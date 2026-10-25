import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { DEFAULT_ORDER } from '@/lib/ai/providers';
import type { AiProviderId, AiRouting, AiSettings } from '@/types/ai';

const KEY = 'ai_settings';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  preferredProvider: 'auto',
  fallbackOrder: DEFAULT_ORDER,
  shareRegistration: false,
  features: { copilot: true, draftRequest: true, polish: true, extractDocument: true, pulse: true }
};

const isProvider = (v: unknown): v is AiProviderId => typeof v === 'string' && (DEFAULT_ORDER as string[]).includes(v);

export function normalizeAiSettings(raw: unknown): AiSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const f = (r.features && typeof r.features === 'object' ? r.features : {}) as Record<string, unknown>;
  const flag = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const order = Array.isArray(r.fallbackOrder) ? (r.fallbackOrder.filter(isProvider) as AiProviderId[]) : [];
  // Always keep every provider in the chain (appended) so a partial list never disables one silently.
  const fallbackOrder = [...new Set([...order, ...DEFAULT_ORDER])];
  const preferred: AiRouting = r.preferredProvider === 'auto' || isProvider(r.preferredProvider) ? (r.preferredProvider as AiRouting) : 'auto';
  return {
    enabled: flag(r.enabled, true),
    preferredProvider: preferred,
    fallbackOrder,
    shareRegistration: flag(r.shareRegistration, false),
    features: {
      copilot: flag(f.copilot, true),
      draftRequest: flag(f.draftRequest, true),
      polish: flag(f.polish, true),
      extractDocument: flag(f.extractDocument, true),
      pulse: flag(f.pulse, true)
    }
  };
}

export async function getAiSettings(): Promise<AiSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return normalizeAiSettings(row?.value);
}

export async function saveAiSettings(input: unknown): Promise<AiSettings> {
  const next = normalizeAiSettings(input);
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next as unknown as object },
    update: { value: next as unknown as object }
  });
  return next;
}
