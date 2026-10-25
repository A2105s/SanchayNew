import { requirePermission } from '@/lib/cloud/context';
import { getVehicleDetail } from '@/lib/cloud/fleet';
import { DomainError } from '@/lib/cloud/errors';
import { handleRouteError, ok } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    const detail = await getVehicleDetail(auth.user, id);
    if (!detail) throw new DomainError('Vehicle not found.', 404);
    return ok(detail);
  } catch (error) {
    return handleRouteError('cloud/vehicles/[id]', error);
  }
}
