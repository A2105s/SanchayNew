import { requirePermission } from '@/lib/cloud/context';
import type { Permission } from '@/lib/auth/roles';
import { applyVehicleAction } from '@/lib/cloud/ops/vehicles';
import { vehicleActionSchema, type VehicleActionParsed } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Each action maps to the capability it requires beyond a valid session. */
function permissionFor(action: VehicleActionParsed): Permission {
  switch (action.type) {
    case 'update':
    case 'assignDriver':
    case 'renewCompliance':
      return 'vehicle.edit';
    case 'setOperationalStatus':
    case 'retire':
      return 'vehicle.edit';
    case 'submitOwnership':
    case 'decideOwnership':
    case 'reevaluateEligibility':
      return 'eligibility.verify';
    case 'addRestriction':
    case 'liftRestriction':
      return 'restriction.manage';
    case 'startTrip':
    case 'endTrip':
      return 'trip.write';
    case 'raiseMaintenance':
    case 'updateMaintenance':
      return 'maintenance.write';
    case 'logIncident':
    case 'resolveIncident':
      return 'incident.write';
    case 'logFuel':
      return 'trip.write';
    case 'addLegalRecord':
    case 'updateLegalRecord':
    case 'linkCourtCase':
    case 'refreshCourtCase':
    case 'releaseCustody':
    case 'markAuctionReady':
      return 'restriction.manage';
    default:
      return 'vehicle.edit';
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson(request).catch(() => null);
  let action: VehicleActionParsed;
  try {
    action = vehicleActionSchema.parse(body);
  } catch (error) {
    return handleRouteError('cloud/vehicles/[id]/actions', error);
  }

  const { id } = await ctx.params;
  const auth = await requirePermission(request, permissionFor(action), { entityType: 'Vehicle', entityId: id });
  if (!auth.ok) return auth.response;

  try {
    const result = await applyVehicleAction(auth.user, id, action, auth.correlationId);
    return ok(result);
  } catch (error) {
    return handleRouteError('cloud/vehicles/[id]/actions', error);
  }
}
