import { requirePermission } from '@/lib/cloud/context';
import { listDocuments, uploadDocument } from '@/lib/cloud/ops/documents';
import { documentMetaSchema } from '@/lib/validation/schemas';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'document.read');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    return ok(await listDocuments(auth.user, id));
  } catch (error) {
    return handleRouteError('cloud/vehicles/[id]/documents:get', error);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'document.write');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    const body = await readJson(request);
    const meta = documentMetaSchema.parse(body);
    return ok(await uploadDocument(auth.user, id, meta, auth.correlationId));
  } catch (error) {
    return handleRouteError('cloud/vehicles/[id]/documents:post', error);
  }
}
