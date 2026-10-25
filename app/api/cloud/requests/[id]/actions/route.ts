import { requirePermission } from '@/lib/cloud/context';
import type { Permission } from '@/lib/auth/roles';
import {
  approveRequest,
  cancelRequest,
  escalateRequest,
  rejectRequest,
  requestChanges,
  startReview,
  submitRequest,
  updateRequest
} from '@/lib/cloud/ops/requests';
import { requestActionSchema, type RequestActionParsed } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function permissionFor(action: RequestActionParsed): Permission {
  switch (action.type) {
    case 'update':
    case 'submit':
    case 'cancel':
      return 'request.create';
    case 'startReview':
    case 'approve':
    case 'reject':
    case 'requestChanges':
    case 'escalate':
      return 'request.review';
    default:
      return 'request.create';
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson(request).catch(() => null);
  let action: RequestActionParsed;
  try {
    action = requestActionSchema.parse(body);
  } catch (error) {
    return handleRouteError('cloud/requests/[id]/actions', error);
  }

  const { id } = await ctx.params;
  const auth = await requirePermission(request, permissionFor(action), { entityType: 'Request', entityId: id });
  if (!auth.ok) return auth.response;

  try {
    const cid = auth.correlationId;
    const user = auth.user;
    switch (action.type) {
      case 'update':
        return ok(await updateRequest(user, id, action.patch, cid));
      case 'submit':
        return ok(await submitRequest(user, id, cid));
      case 'startReview':
        return ok(await startReview(user, id, cid));
      case 'approve':
        return ok(await approveRequest(user, id, action.comment, cid));
      case 'reject':
        return ok(await rejectRequest(user, id, action.reason, cid));
      case 'requestChanges':
        return ok(await requestChanges(user, id, action.comment, cid));
      case 'escalate':
        return ok(await escalateRequest(user, id, action.comment, cid));
      case 'cancel':
        return ok(await cancelRequest(user, id, action.reason, cid));
      default: {
        const _exhaustive: never = action;
        return _exhaustive;
      }
    }
  } catch (error) {
    return handleRouteError('cloud/requests/[id]/actions', error);
  }
}
