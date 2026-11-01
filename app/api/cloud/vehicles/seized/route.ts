import { requirePermission } from '@/lib/cloud/context';
import { registerSeizedVehicle } from '@/lib/cloud/ops/vehicles';
import { seizedVehicleInputSchema } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requirePermission(request, 'vehicle.register', { entityType: 'Vehicle', entityId: 'new-seized' });
  if (!auth.ok) return auth.response;

  try {
    const body = await readJson(request);
    const input = seizedVehicleInputSchema.parse(body);
    const vehicle = await registerSeizedVehicle(auth.user, input, auth.correlationId);
    return ok(vehicle);
  } catch (error) {
    return handleRouteError('cloud/vehicles/seized:post', error);
  }
}

