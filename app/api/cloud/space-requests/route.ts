import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/cloud/context';
import { submitSpaceRequest, listSpaceRequests } from '@/lib/cloud/ops/space-requests';
import { spaceRequestInputSchema } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;
  try {
    const scope = request.nextUrl.searchParams.get('scope') === 'review' ? 'review' : 'mine';
    return ok(await listSpaceRequests(auth.user, scope));
  } catch (error) {
    return handleRouteError('cloud/space-requests:get', error);
  }
}

export async function POST(request: Request) {
  const auth = await requirePermission(request, 'space.book', { entityType: 'SpaceRequest', entityId: 'new' });
  if (!auth.ok) return auth.response;
  try {
    const body = await readJson(request);
    const input = spaceRequestInputSchema.parse(body);
    return ok(await submitSpaceRequest(auth.user, input, auth.correlationId));
  } catch (error) {
    return handleRouteError('cloud/space-requests:post', error);
  }
}
