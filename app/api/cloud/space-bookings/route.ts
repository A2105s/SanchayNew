import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/cloud/context';
import { createSpaceBooking, listSpaceBookings } from '@/lib/cloud/ops/space-bookings';
import { spaceBookingInputSchema, spaceBookingSearchSchema } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;
  try {
    const sp = request.nextUrl.searchParams;
    const filters = spaceBookingSearchSchema.parse({
      scope: sp.get('scope') ?? 'mine',
      spaceId: sp.get('spaceId') ?? undefined,
      bucket: sp.get('bucket') ?? undefined
    });
    return ok(await listSpaceBookings(auth.user, filters));
  } catch (error) {
    return handleRouteError('cloud/space-bookings:get', error);
  }
}

export async function POST(request: Request) {
  const auth = await requirePermission(request, 'space.book', { entityType: 'SpaceBooking', entityId: 'new' });
  if (!auth.ok) return auth.response;
  try {
    const body = await readJson(request);
    const input = spaceBookingInputSchema.parse(body);
    return ok(await createSpaceBooking(auth.user, input, auth.correlationId));
  } catch (error) {
    return handleRouteError('cloud/space-bookings:post', error);
  }
}
