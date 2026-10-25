import { requirePermission } from '@/lib/cloud/context';
import { bulkImport, reassignStation } from '@/lib/cloud/ops/vehicles';
import { vehicleBulkActionSchema } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await readJson(request).catch(() => null);
  let action;
  try {
    action = vehicleBulkActionSchema.parse(body);
  } catch (error) {
    return handleRouteError('cloud/vehicles/bulk', error);
  }

  const permission = action.type === 'import' ? 'vehicle.register' : 'vehicle.edit';
  const auth = await requirePermission(request, permission, { entityType: 'Vehicle', entityId: 'bulk' });
  if (!auth.ok) return auth.response;

  try {
    if (action.type === 'import') {
      const result = await bulkImport(auth.user, action.rows, auth.correlationId);
      return ok({ count: result.created + result.updated, details: result });
    }
    const result = await reassignStation(auth.user, action.ids, action.stationId, auth.correlationId);
    return ok(result);
  } catch (error) {
    return handleRouteError('cloud/vehicles/bulk', error);
  }
}
