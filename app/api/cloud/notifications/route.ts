import { requirePermission } from '@/lib/cloud/context';
import { listNotifications } from '@/lib/cloud/notifications';
import { handleRouteError, ok } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission(request);
  if (!auth.ok) return auth.response;
  try {
    const notifications = await listNotifications(auth.user.username, auth.user.role, auth.user.organizationId);
    return ok(notifications);
  } catch (error) {
    return handleRouteError('cloud/notifications', error);
  }
}
