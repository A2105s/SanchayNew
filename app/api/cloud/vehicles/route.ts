import { requirePermission } from '@/lib/cloud/context';
import { registerVehicle } from '@/lib/cloud/ops/vehicles';
import { vehicleInputSchema } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requirePermission(request, 'vehicle.register', { entityType: 'Vehicle', entityId: 'new' });
  if (!auth.ok) return auth.response;

  try {
    const body = await readJson(request);
    const input = vehicleInputSchema.parse(body);
    const vehicle = await registerVehicle(auth.user, input, auth.correlationId);
    return ok(vehicle);
  } catch (error) {
    return handleRouteError('cloud/vehicles:post', error);
  }
}
