import { requirePermission } from '@/lib/cloud/context';
import { getAllocationView } from '@/lib/cloud/ops/allocations';
import { handleRouteError, ok } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    return ok(await getAllocationView(auth.user, id));
  } catch (error) {
    return handleRouteError('cloud/allocations/[id]', error);
  }
}
