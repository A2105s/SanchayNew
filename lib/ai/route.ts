import 'server-only';

import type { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/cloud/context';
import { DomainError } from '@/lib/cloud/errors';
import { handleRouteError } from '@/lib/cloud/http';
import { recordCloudEvent } from '@/lib/cloud/backend-events';
import { enforceAiRateLimit } from '@/lib/ai/guard';
import { getAiSettings } from '@/lib/ai/settings';
import type { AiFeatureToggles, AiMeta, AiSettings } from '@/types/ai';
import type { SessionUser } from '@/types';

export interface AiRouteContext {
  user: SessionUser;
  settings: AiSettings;
  request: Request;
}

/**
 * Wraps an AI route: session + permission, feature switch, rate limit, and an event log entry that records
 * the feature, engine and latency but NEVER the prompt or the answer.
 */
export async function aiRoute(
  request: Request,
  scope: string,
  feature: keyof AiFeatureToggles,
  handler: (ctx: AiRouteContext) => Promise<NextResponse>,
  permission: Parameters<typeof requirePermission>[1] = 'fleet.read'
): Promise<NextResponse> {
  try {
    const auth = await requirePermission(request, permission);
    if (!auth.ok) return auth.response;
    const settings = await getAiSettings();
    if (!settings.enabled) throw new DomainError('AI assistance is turned off by an administrator.', 403, 'AI_DISABLED');
    if (!settings.features[feature]) throw new DomainError('This AI feature is turned off by an administrator.', 403, 'AI_FEATURE_DISABLED');
    enforceAiRateLimit(auth.user.username);
    return await handler({ user: auth.user, settings, request });
  } catch (error) {
    return handleRouteError(scope, error);
  }
}

export async function logAi(feature: string, meta: Pick<AiMeta, 'provider' | 'latencyMs' | 'degraded'>): Promise<void> {
  try {
    await recordCloudEvent({
      level: 'info',
      category: 'ai',
      action: feature,
      status: meta.degraded ? 'failed' : 'succeeded',
      message: meta.degraded ? 'No AI engine answered; a non-AI answer was returned.' : `AI answer from ${meta.provider}.`,
      details: { feature, provider: meta.provider, latencyMs: meta.latencyMs, degraded: meta.degraded }
    });
  } catch {
    // Logging must never break the user's request.
  }
}

/** Robust JSON extraction: handles fenced blocks and chatter around the object. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const metaOf = (r: AiMeta): AiMeta => ({ provider: r.provider, model: r.model, latencyMs: r.latencyMs, attempts: r.attempts, degraded: r.degraded });
