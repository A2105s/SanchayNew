import { requirePermission } from '@/lib/cloud/context';
import { loadSpaceSettings, updateSpaceSettings } from '@/lib/cloud/ops/space-settings';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;
  try {
    return ok(await loadSpaceSettings());
  } catch (error) {
    return handleRouteError('cloud/space-settings:get', error);
  }
}

export async function PUT(request: Request) {
  const auth = await requirePermission(request, 'settings.manage', { entityType: 'SpaceSettings', entityId: 'space_settings' });
  if (!auth.ok) return auth.response;
  try {
    const body = await readJson(request);
    const patch = (body ?? {}) as { approvalThresholdHours?: number; bookingWindowDays?: number; idleAlertDays?: number; reason?: string };
    const { reason, ...settings } = patch;
    return ok(await updateSpaceSettings(auth.user, settings, reason || 'Space booking policy updated', auth.correlationId));
  } catch (error) {
    return handleRouteError('cloud/space-settings:put', error);
  }
}
