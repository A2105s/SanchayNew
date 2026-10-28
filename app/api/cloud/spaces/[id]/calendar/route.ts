import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/cloud/context';
import { spaceCalendar } from '@/lib/cloud/ops/space-bookings';
import { handleRouteError, ok } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    const sp = request.nextUrl.searchParams;
    const from = sp.get('from') ?? new Date(Date.now() - 86_400_000).toISOString();
    const to = sp.get('to') ?? new Date(Date.now() + 14 * 86_400_000).toISOString();
    return ok(await spaceCalendar(auth.user, id, from, to));
  } catch (error) {
    return handleRouteError('cloud/spaces/[id]/calendar:get', error);
  }
}
