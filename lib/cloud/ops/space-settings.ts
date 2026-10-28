import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser, SpaceSettings } from '@/types';
import { writeAudit } from '@/lib/cloud/audit';
import { DomainError } from '@/lib/cloud/errors';
import { invalidateCloudData, CLOUD_CACHE_TAGS } from '@/lib/cloud/cached-queries';

export const SPACE_SETTINGS_KEY = 'space_settings';

export const DEFAULT_SPACE_SETTINGS: SpaceSettings = {
  approvalThresholdHours: 4,
  bookingWindowDays: 30,
  idleAlertDays: 14
};

function merge(input: Partial<SpaceSettings> | null | undefined): SpaceSettings {
  return {
    approvalThresholdHours: clampNumber(input?.approvalThresholdHours, 0, 72, DEFAULT_SPACE_SETTINGS.approvalThresholdHours),
    bookingWindowDays: clampNumber(input?.bookingWindowDays, 1, 365, DEFAULT_SPACE_SETTINGS.bookingWindowDays),
    idleAlertDays: clampNumber(input?.idleAlertDays, 1, 365, DEFAULT_SPACE_SETTINGS.idleAlertDays)
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function loadSpaceSettings(): Promise<SpaceSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: SPACE_SETTINGS_KEY } });
  return merge((row?.value ?? null) as Partial<SpaceSettings> | null);
}

export async function updateSpaceSettings(user: SessionUser, patch: Partial<SpaceSettings>, reason: string, correlationId: string): Promise<SpaceSettings> {
  const current = await loadSpaceSettings();
  const next = merge({ ...current, ...patch });
  await prisma.$transaction(async (tx) => {
    await tx.appSetting.upsert({ where: { key: SPACE_SETTINGS_KEY }, update: { value: next as unknown as Prisma.InputJsonValue }, create: { key: SPACE_SETTINGS_KEY, value: next as unknown as Prisma.InputJsonValue } });
    await writeAudit(tx, {
      entityType: 'SpaceSettings',
      entityId: SPACE_SETTINGS_KEY,
      action: 'SpaceSettingsUpdated',
      fieldName: 'policy',
      oldValue: JSON.stringify(current),
      newValue: JSON.stringify(next),
      performedBy: user.username,
      performedByRole: user.role,
      organizationId: user.organizationId,
      correlationId,
      reason
    });
  }, { timeout: 15000, maxWait: 5000 });
  invalidateCloudData(CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.all);
  return next;
}

export function assertSameOrg(user: SessionUser, organizationId: string): void {
  if (user.role === 'ADMIN') return; // platform admin reads aggregates across orgs
  if (!user.organizationId || user.organizationId !== organizationId) {
    throw new DomainError('This space belongs to another organization.', 403);
  }
}
