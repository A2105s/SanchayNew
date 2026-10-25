import 'server-only';

import type { AiMeta, AiProviderHealth, AiProviderId, AiRouting, ProviderAttempt } from '@/types/ai';

/**
 * Server-side AI providers. Plain fetch, no SDKs. Keys are read from process.env only and are NEVER
 * returned, logged or placed in an error message.
 */

export interface ChatImage {
  mimeType: string;
  base64: string;
}
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: ChatImage[];
}
export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  /** Ask for JSON output where the provider supports it */
  json?: boolean;
  timeoutMs?: number;
}

interface ProviderDef {
  id: AiProviderId;
  name: string;
  vision: boolean;
  defaultModel: string;
  key: () => string;
  model: () => string;
}

const env = (n: string): string => (process.env[n] ?? '').trim();

export const PROVIDERS: Record<AiProviderId, ProviderDef> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    vision: true,
    defaultModel: 'gemini-3.8-flash',
    key: () => env('GOOGLE_GENERATIVE_AI_API_KEY') || env('GEMINI_API_KEY'),
    model: () => env('GEMINI_CHAT_MODEL') || 'gemini-3.8-flash'
  },
  nvidia: {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    vision: true,
    defaultModel: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
    key: () => env('NVIDIA_API_KEY'),
    model: () => env('NVIDIA_CHAT_MODEL') || 'nvidia/nemotron-3.5-super-vl-120b-a12b'
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    vision: true,
    defaultModel: 'openrouter/free',
    key: () => env('OPENROUTER_API_KEY'),
    model: () => env('OPENROUTER_CHAT_MODEL') || 'openrouter/free'
  },
  groq: {
    id: 'groq',
    name: 'Groq Cloud',
    vision: false,
    defaultModel: 'qwen/qwen3.8-27b',
    key: () => env('GROQ_API_KEY'),
    model: () => env('GROQ_CHAT_MODEL') || 'qwen/qwen3.8-27b'
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    vision: true,
    defaultModel: 'pixtral-12b-2409',
    key: () => env('MISTRAL_API_KEY'),
    model: () => env('MISTRAL_CHAT_MODEL') || 'pixtral-12b-2409'
  }
};

// Fastest-first. Gemini 3.x flash is currently slow/overloaded for short tasks; it remains the second choice.
export const DEFAULT_ORDER: AiProviderId[] = ['nvidia', 'gemini', 'openrouter', 'groq', 'mistral'];

export function isConfigured(id: AiProviderId): boolean {
  return PROVIDERS[id].key().length > 0;
}
export function anyConfigured(): boolean {
  return DEFAULT_ORDER.some(isConfigured);
}

/** Friendly, secret-free explanation for an HTTP status (EasyLife-style). */
export function explainHttpStatus(status: number, providerName: string): string {
  if (status === 0) return `${providerName} could not be reached (network error or timeout).`;
  if (status === 400) return `${providerName} rejected the request format.`;
  if (status === 401 || status === 403) return `${providerName} refused the credentials. Check the API key and that the service is enabled.`;
  if (status === 404) return `${providerName} does not know the configured model. Check the model name.`;
  if (status === 408) return `${providerName} timed out.`;
  if (status === 429) return `${providerName} rate limit reached. Try again shortly or use another engine.`;
  if (status >= 500) return `${providerName} is temporarily unavailable (HTTP ${status}).`;
  return `${providerName} returned HTTP ${status}.`;
}

class ProviderError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<{ status: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ProviderError(aborted ? 408 : 0, aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(def: ProviderDef, messages: ChatMessage[], opts: GenerateOptions): Promise<string> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: m.content },
        ...(m.images ?? []).map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } }))
      ]
    }));
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxTokens ?? 1024,
      ...(opts.json ? { responseMimeType: 'application/json' } : {})
    }
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(def.model())}:generateContent`;
  const { status, json } = await fetchJson(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': def.key() }, body: JSON.stringify(body) },
    opts.timeoutMs ?? 20_000
  );
  if (status < 200 || status >= 300) throw new ProviderError(status, 'http');
  const parts = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? '').join('').trim();
  if (!text) throw new ProviderError(502, 'empty');
  return text;
}

const OPENAI_BASES: Partial<Record<AiProviderId, () => string>> = {
  nvidia: () => (env('NVIDIA_BASE_URL') || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, ''),
  openrouter: () => 'https://openrouter.ai/api/v1',
  groq: () => 'https://api.groq.com/openai/v1',
  mistral: () => 'https://api.mistral.ai/v1'
};

async function callOpenAiCompatible(def: ProviderDef, messages: ChatMessage[], opts: GenerateOptions): Promise<string> {
  const base = OPENAI_BASES[def.id]?.() ?? '';
  const payload = messages.map((m) => {
    if (m.images?.length) {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content },
          ...m.images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } }))
        ]
      };
    }
    return { role: m.role, content: m.content };
  });
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${def.key()}` };
  if (def.id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://sanchay.local';
    headers['X-Title'] = 'Sanchay';
  }
  const body: Record<string, unknown> = {
    model: def.model(),
    messages: payload,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 1024,
    stream: false
  };
  // Only providers with reliable JSON mode get response_format; free routed models return empty bodies with it.
  // NVIDIA's Nemotron is a reasoning model; for short factual tasks the hidden thinking only adds latency.
  if (def.id === 'nvidia') body.chat_template_kwargs = { enable_thinking: false };
  if (opts.json && (def.id === 'groq' || def.id === 'mistral')) body.response_format = { type: 'json_object' };
  const { status, json } = await fetchJson(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) }, opts.timeoutMs ?? 20_000);
  if (status < 200 || status >= 300) throw new ProviderError(status, 'http');
  const content = (json as { choices?: { message?: { content?: string | null } }[] })?.choices?.[0]?.message?.content;
  // Reasoning models may put their chain of thought in reasoning_content; only the final content is used.
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) throw new ProviderError(502, 'empty');
  return text;
}

export async function callProvider(id: AiProviderId, messages: ChatMessage[], opts: GenerateOptions = {}): Promise<string> {
  const def = PROVIDERS[id];
  return id === 'gemini' ? callGemini(def, messages, opts) : callOpenAiCompatible(def, messages, opts);
}

export interface RouteResult extends AiMeta {
  text: string | null;
}

/**
 * Try providers in order (preferred first, then the fallback chain). Unconfigured providers are skipped.
 * One retry on 429/5xx per provider. Never throws: returns text=null and degraded=true when nothing answered.
 */
export async function generate(
  messages: ChatMessage[],
  opts: GenerateOptions & { preferred?: AiRouting; order?: AiProviderId[]; needVision?: boolean } = {}
): Promise<RouteResult> {
  const started = Date.now();
  const chain: AiProviderId[] = [];
  const order = opts.order?.length ? opts.order : DEFAULT_ORDER;
  if (opts.preferred && opts.preferred !== 'auto') chain.push(opts.preferred);
  for (const id of order) if (!chain.includes(id)) chain.push(id);

  const attempts: ProviderAttempt[] = [];
  for (const id of chain) {
    const def = PROVIDERS[id];
    if (!isConfigured(id)) continue;
    if (opts.needVision && !def.vision) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        const text = await callProvider(id, messages, opts);
        const latencyMs = Date.now() - t0;
        attempts.push({ provider: id, model: def.model(), ok: true, status: 200, latencyMs, message: 'ok' });
        return { text, provider: id, model: def.model(), latencyMs: Date.now() - started, attempts, degraded: false };
      } catch (error) {
        const status = error instanceof ProviderError ? error.status : 0;
        const latencyMs = Date.now() - t0;
        attempts.push({ provider: id, model: def.model(), ok: false, status, latencyMs, message: explainHttpStatus(status, def.name) });
        const retryable = status === 429 || status >= 500;
        if (!(retryable && attempt === 0)) break;
      }
    }
  }
  return { text: null, provider: null, model: null, latencyMs: Date.now() - started, attempts, degraded: true };
}

/** Tiny ping used by the health check. */
export async function ping(id: AiProviderId): Promise<AiProviderHealth> {
  const def = PROVIDERS[id];
  const base: AiProviderHealth = { id, name: def.name, model: def.model(), configured: isConfigured(id), vision: def.vision, ok: false, status: 0, latencyMs: 0, message: 'Not configured' };
  if (!base.configured) return base;
  const t0 = Date.now();
  try {
    await callProvider(id, [{ role: 'user', content: 'Reply with the single word: ok' }], { maxTokens: 64, timeoutMs: 15_000 });
    return { ...base, ok: true, status: 200, latencyMs: Date.now() - t0, message: 'Operational' };
  } catch (error) {
    const status = error instanceof ProviderError ? error.status : 0;
    return { ...base, ok: false, status, latencyMs: Date.now() - t0, message: explainHttpStatus(status, def.name) };
  }
}
