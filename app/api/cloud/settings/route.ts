import { requirePermission } from '@/lib/cloud/context';
import { prisma } from '@/lib/db/prisma';
import { DEFAULT_FLEET_SETTINGS, FLEET_SETTINGS_KEY, mergeFleetSettings } from '@/lib/cloud/errors';
import { fleetSettingsSchema } from '@/lib/validation/schemas';
import { writeAudit } from '@/lib/cloud/audit';
import { recordCloudEvent } from '@/lib/cloud/backend-events';
import { CLOUD_CACHE_TAGS, invalidateCloudData } from '@/lib/cloud/cached-queries';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: FLEET_SETTINGS_KEY } });
    return ok(row ? mergeFleetSettings(row.value) : { ...DEFAULT_FLEET_SETTINGS });
  } catch (error) {
    return handleRouteError('cloud/settings:get', error);
  }
}

export async function PUT(request: Request) {
  const auth = await requirePermission(request, 'settings.manage', { entityType: 'Settings', entityId: FLEET_SETTINGS_KEY });
  if (!auth.ok) return auth.response;
  try {
    const body = await readJson(request);
    const settings = fleetSettingsSchema.parse(body);
    await prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({ where: { key: FLEET_SETTINGS_KEY }, update: { value: settings }, create: { key: FLEET_SETTINGS_KEY, value: settings } });
      await writeAudit(tx, { entityType: 'Settings', entityId: FLEET_SETTINGS_KEY, action: 'SettingsUpdated', newValue: JSON.stringify(settings), performedBy: auth.user.username, performedByRole: auth.user.role, organizationId: auth.user.organizationId, correlationId: auth.correlationId, reason: 'Fleet settings updated' });
    });
    await recordCloudEvent({ level: 'info', category: 'settings', action: 'update-settings', status: 'succeeded', message: 'Fleet settings updated.' });
    invalidateCloudData(CLOUD_CACHE_TAGS.all, CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.ops);
    return ok(settings);
  } catch (error) {
    return handleRouteError('cloud/settings:put', error);
  }
}
