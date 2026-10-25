import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { processDueSyncJobs, pruneSyncHistory } from '@/lib/cloud/sync-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  const isCronAuthorized = Boolean(configuredSecret && authorization === `Bearer ${configuredSecret}`);

  if (!isCronAuthorized) {
    const auth = await requireSession(request);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Valid cron secret or active session required.' },
        { status: 401 }
      );
    }
  }

  try {
    await processDueSyncJobs(20);
    const pruned = await pruneSyncHistory(30);
    return NextResponse.json({ success: true, data: { pruned } });
  } catch (error) {
    console.error('[cloud/sync-jobs/process]', error);
    return NextResponse.json({ success: false, error: 'Scheduled retries could not be processed.' }, { status: 503 });
  }
}
