import { requirePermission } from '@/lib/cloud/context';
import { getDocumentSignedUrl } from '@/lib/cloud/ops/documents';
import { handleRouteError, ok } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ docId: string }> }) {
  const auth = await requirePermission(request, 'document.read', { entityType: 'Document', entityId: 'url' });
  if (!auth.ok) return auth.response;
  try {
    const { docId } = await ctx.params;
    return ok(await getDocumentSignedUrl(auth.user, docId, auth.correlationId));
  } catch (error) {
    return handleRouteError('cloud/documents/[docId]/url', error);
  }
}
