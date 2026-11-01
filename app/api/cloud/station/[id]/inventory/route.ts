import { requirePermission } from '@/lib/cloud/context';
import { getStationInventoryBreakdown } from '@/lib/cloud/ops/inventory';
import { handleRouteError, ok } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    const breakdown = await getStationInventoryBreakdown(id);
    return ok(breakdown);
  } catch (error) {
    return handleRouteError('cloud/station/[id]/inventory:get', error);
  }
}

