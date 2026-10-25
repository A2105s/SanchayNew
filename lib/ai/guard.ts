import 'server-only';

import { DomainError } from '@/lib/cloud/errors';

/** In-memory sliding window: 20 AI calls per user per minute (per server instance). */
const WINDOW_MS = 60_000;
const LIMIT = 20;
const hits = new Map<string, number[]>();

export function enforceAiRateLimit(username: string): void {
  const now = Date.now();
  const recent = (hits.get(username) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(username, recent);
    throw new DomainError('You are sending AI requests too quickly. Wait a moment and try again.', 429, 'AI_RATE_LIMIT');
  }
  recent.push(now);
  hits.set(username, recent);
}

/** Strip anything that looks like a credential before text is logged or echoed. */
export function redactSecrets(text: string): string {
  return text
    .replace(/nvapi-[A-Za-z0-9_-]{16,}/g, '[redacted]')
    .replace(/sk-or-v1-[A-Za-z0-9]{16,}/g, '[redacted]')
    .replace(/AQ\.[A-Za-z0-9_-]{20,}/g, '[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer [redacted]');
}
