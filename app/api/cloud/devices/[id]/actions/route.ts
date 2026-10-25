import { requirePermission } from '@/lib/cloud/context';
import { applyDeviceAction } from '@/lib/cloud/ops/devices';
import { deviceActionSchema } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'device.manage', { entityType: 'Device', entityId: 'action' });
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    const body = await readJson(request);
    const action = deviceActionSchema.parse(body);
    return ok(await applyDeviceAction(auth.user, id, action, auth.correlationId));
  } catch (error) {
    return handleRouteError('cloud/devices/[id]/actions', error);
  }
}
