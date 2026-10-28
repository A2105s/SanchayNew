import { requirePermission } from '@/lib/cloud/context';
import { applySpaceBookingAction } from '@/lib/cloud/ops/space-bookings';
import { spaceBookingActionSchema, type SpaceBookingActionParsed } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** approve/reject/complete are review actions; cancel is allowed for the requester too (checked in the op). */
function permissionFor(action: SpaceBookingActionParsed) {
  return action.type === 'cancel' ? 'space.book' : 'space.review';
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson(request).catch(() => null);
  let action: SpaceBookingActionParsed;
  try {
    action = spaceBookingActionSchema.parse(body);
  } catch (error) {
    return handleRouteError('cloud/space-bookings/[id]/actions', error);
  }
  const auth = await requirePermission(request, permissionFor(action), { entityType: 'SpaceBooking', entityId: (await ctx.params).id });
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    return ok(await applySpaceBookingAction(auth.user, id, action, auth.correlationId));
  } catch (error) {
    return handleRouteError('cloud/space-bookings/[id]/actions:post', error);
  }
}
