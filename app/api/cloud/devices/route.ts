import { requirePermission } from '@/lib/cloud/context';
import { provisionDevice } from '@/lib/cloud/ops/devices';
import { deviceInputSchema } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requirePermission(request, 'device.manage', { entityType: 'Device', entityId: 'new' });
  if (!auth.ok) return auth.response;
  try {
    const body = await readJson(request);
    const input = deviceInputSchema.parse(body);
    return ok(await provisionDevice(auth.user, input, auth.correlationId));
  } catch (error) {
    return handleRouteError('cloud/devices:post', error);
  }
}
