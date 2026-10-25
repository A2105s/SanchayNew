import { requirePermission } from '@/lib/cloud/context';
import type { Permission } from '@/lib/auth/roles';
import { applyAllocationAction } from '@/lib/cloud/ops/allocations';
import { allocationActionSchema, type AllocationActionParsed } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function permissionFor(action: AllocationActionParsed): Permission {
  switch (action.type) {
    case 'prepareHandover':
    case 'recordHandover':
      return 'handover.record';
    case 'recordReturn':
      return 'return.record';
    case 'inspect':
      return 'return.inspect';
    case 'requestExtension':
      return 'request.create';
    case 'decideExtension':
      return 'extension.decide';
    case 'hold':
    case 'releaseHold':
    case 'cancel':
      return 'handover.record';
    default:
      return 'handover.record';
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson(request).catch(() => null);
  let action: AllocationActionParsed;
  try {
    action = allocationActionSchema.parse(body);
  } catch (error) {
    return handleRouteError('cloud/allocations/[id]/actions', error);
  }

  const { id } = await ctx.params;
  const auth = await requirePermission(request, permissionFor(action), { entityType: 'Allocation', entityId: id });
  if (!auth.ok) return auth.response;

  try {
    const result = await applyAllocationAction(auth.user, id, action, auth.correlationId);
    return ok(result);
  } catch (error) {
    return handleRouteError('cloud/allocations/[id]/actions', error);
  }
}
