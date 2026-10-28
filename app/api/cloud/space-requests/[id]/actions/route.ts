import { requirePermission } from '@/lib/cloud/context';
import { applySpaceRequestAction } from '@/lib/cloud/ops/space-requests';
import { spaceRequestActionSchema, type SpaceRequestActionParsed } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** withdraw is the requester's action; the rest are review actions (self-review is blocked in the op). */
function permissionFor(action: SpaceRequestActionParsed) {
  return action.type === 'withdraw' ? 'space.book' : 'space.review';
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson(request).catch(() => null);
  let action: SpaceRequestActionParsed;
  try {
    action = spaceRequestActionSchema.parse(body);
  } catch (error) {
    return handleRouteError('cloud/space-requests/[id]/actions', error);
  }
  const auth = await requirePermission(request, permissionFor(action), { entityType: 'SpaceRequest', entityId: (await ctx.params).id });
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    return ok(await applySpaceRequestAction(auth.user, id, action, auth.correlationId));
  } catch (error) {
    return handleRouteError('cloud/space-requests/[id]/actions:post', error);
  }
}
