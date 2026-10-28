import { requirePermission } from '@/lib/cloud/context';
import { applySpaceAction } from '@/lib/cloud/ops/spaces';
import { spaceActionSchema, type SpaceActionParsed } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function permissionFor(action: SpaceActionParsed) {
  return action.type === 'raiseMaintenance' || action.type === 'updateMaintenance' ? 'maintenance.write' : 'space.manage';
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson(request).catch(() => null);
  let action: SpaceActionParsed;
  try {
    action = spaceActionSchema.parse(body);
  } catch (error) {
    return handleRouteError('cloud/spaces/[id]/actions', error);
  }
  const auth = await requirePermission(request, permissionFor(action), { entityType: 'Space', entityId: (await ctx.params).id });
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    return ok(await applySpaceAction(auth.user, id, action, auth.correlationId));
  } catch (error) {
    return handleRouteError('cloud/spaces/[id]/actions:post', error);
  }
}
