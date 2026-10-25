import { requirePermission } from '@/lib/cloud/context';
import { markRead } from '@/lib/cloud/notifications';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ ids: z.union([z.array(z.string().min(1)).max(500), z.literal('all')]) });

export async function POST(request: Request) {
  const auth = await requirePermission(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await readJson(request);
    const { ids } = bodySchema.parse(body);
    const count = await markRead(auth.user.username, auth.user.role, auth.user.organizationId, ids);
    return ok({ marked: count });
  } catch (error) {
    return handleRouteError('cloud/notifications/read', error);
  }
}
