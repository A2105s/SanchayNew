import { requirePermission } from '@/lib/cloud/context';
import { createTransfer } from '@/lib/cloud/ops/transfers';
import { transferInputSchema } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requirePermission(request, 'transfer.create', { entityType: 'Transfer', entityId: 'new' });
  if (!auth.ok) return auth.response;
  try {
    const body = await readJson(request);
    const input = transferInputSchema.parse(body);
    return ok(await createTransfer(auth.user, input, auth.correlationId));
  } catch (error) {
    return handleRouteError('cloud/transfers:post', error);
  }
}
