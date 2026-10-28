import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/cloud/context';
import { searchSpaces, registerSpace } from '@/lib/cloud/ops/spaces';
import { spaceSearchSchema, spaceInputSchema } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;
  try {
    const sp = request.nextUrl.searchParams;
    const filters = spaceSearchSchema.parse({
      q: sp.get('q') ?? undefined,
      category: sp.get('category') ?? undefined,
      state: sp.get('state') ?? undefined,
      minCapacity: sp.get('minCapacity') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      availableOnly: sp.get('availableOnly') ?? undefined
    });
    return ok(await searchSpaces(auth.user, filters));
  } catch (error) {
    return handleRouteError('cloud/spaces:get', error);
  }
}

export async function POST(request: Request) {
  const auth = await requirePermission(request, 'space.manage', { entityType: 'Space', entityId: 'new' });
  if (!auth.ok) return auth.response;
  try {
    const body = await readJson(request);
    const input = spaceInputSchema.parse(body);
    return ok(await registerSpace(auth.user, input, auth.correlationId));
  } catch (error) {
    return handleRouteError('cloud/spaces:post', error);
  }
}
