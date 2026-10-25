import { requirePermission } from '@/lib/cloud/context';
import { can } from '@/lib/auth/roles';
import { applyTransferAction } from '@/lib/cloud/ops/transfers';
import { transferActionSchema } from '@/lib/validation/schemas';
import { DomainError } from '@/lib/cloud/errors';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    const body = await readJson(request);
    const action = transferActionSchema.parse(body);

    // Baseline capability; source-station review and requester-ownership are enforced
    // inside the domain service (assertCanReviewSource / requestedBy checks).
    if (!can(auth.user.role, 'transfer.create') && !can(auth.user.role, 'transfer.review')) {
      throw new DomainError('You do not have permission to act on transfers.', 403);
    }

    const result = await applyTransferAction(auth.user, id, action, auth.correlationId);
    return ok(result);
  } catch (error) {
    return handleRouteError('cloud/transfers/[id]/actions', error);
  }
}
