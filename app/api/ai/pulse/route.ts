import { ok } from '@/lib/cloud/http';
import { generate } from '@/lib/ai/providers';
import { PULSE_SYSTEM } from '@/lib/ai/prompts';
import { buildAiContext } from '@/lib/ai/context';
import { aiRoute, logAi, metaOf, parseJsonObject } from '@/lib/ai/route';
import type { PulseAction, PulseResponse } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED = new Set(['/allocations?tab=overdue', '/requests?tab=needs', '/compliance', '/operations', '/vehicles/discover', '/incidents', '/maintenance', '/idle', '/reports', '/vehicles']);

/** 5 minute per-user cache so the dashboard widget does not call a model on every visit. */
const cache = new Map<string, { at: number; value: PulseResponse }>();
const TTL = 5 * 60_000;

function deterministic(text: string): Pick<PulseResponse, 'summary' | 'highlights' | 'recommendedActions'> {
  const grab = (re: RegExp) => text.split('\n').filter((l) => re.test(l));
  return {
    summary: 'Live summary from your fleet data (AI engines unavailable, so this is a plain summary).',
    highlights: [...grab(/^Eligibility/), ...grab(/^Requests/), ...grab(/^Compliance/), ...grab(/^Open incidents/)].map((l) => l.slice(0, 220)),
    recommendedActions: [
      { label: 'Review overdue returns', href: '/allocations?tab=overdue', priority: 'high' },
      { label: 'Decide waiting requests', href: '/requests?tab=needs', priority: 'medium' },
      { label: 'Check compliance', href: '/compliance', priority: 'medium' }
    ]
  };
}

export async function GET(request: Request) {
  return aiRoute(request, 'ai/pulse', 'pulse', async ({ user, settings }) => {
    const force = new URL(request.url).searchParams.get('refresh') === '1';
    const hit = cache.get(user.username);
    if (hit && !force && Date.now() - hit.at < TTL) return ok(hit.value);

    const ctx = await buildAiContext(user, settings);
    const result = await generate(
      [
        { role: 'system', content: PULSE_SYSTEM },
        { role: 'user', content: `DATA (untrusted facts):\n<<<DATA\n${ctx.text}\nDATA>>>` }
      ],
      { preferred: settings.preferredProvider, order: settings.fallbackOrder, maxTokens: 600, temperature: 0.2, json: true }
    );

    let value: PulseResponse;
    const parsed = result.text ? parseJsonObject(result.text) : null;
    if (parsed && typeof parsed.summary === 'string') {
      const highlights = Array.isArray(parsed.highlights) ? parsed.highlights.filter((h): h is string => typeof h === 'string').slice(0, 5) : [];
      const actions: PulseAction[] = (Array.isArray(parsed.actions) ? parsed.actions : [])
        .map((a) => a as Record<string, unknown>)
        .filter((a) => typeof a.label === 'string' && typeof a.href === 'string' && ALLOWED.has(a.href as string))
        .slice(0, 4)
        .map((a) => ({ label: String(a.label).slice(0, 80), href: String(a.href), priority: (['high', 'medium', 'low'].includes(String(a.priority)) ? a.priority : 'medium') as PulseAction['priority'] }));
      value = { ...metaOf(result), summary: parsed.summary.slice(0, 500), highlights, recommendedActions: actions, generatedAt: new Date().toISOString() };
    } else {
      value = { ...metaOf({ ...result, degraded: true }), ...deterministic(ctx.text), generatedAt: new Date().toISOString() };
    }
    await logAi('pulse', value);
    if (!value.degraded) cache.set(user.username, { at: Date.now(), value });
    return ok(value);
  });
}
