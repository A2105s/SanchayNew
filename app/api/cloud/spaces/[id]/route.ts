import { requirePermission } from '@/lib/cloud/context';
import { getSpaceDetail } from '@/lib/cloud/ops/spaces';
import { handleRouteError, ok } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    return ok(await getSpaceDetail(auth.user, id));
  } catch (error) {
    return handleRouteError('cloud/spaces/[id]:get', error);
  }
}
