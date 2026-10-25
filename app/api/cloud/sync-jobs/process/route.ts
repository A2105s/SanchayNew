import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { processDueSyncJobs, pruneSyncHistory } from '@/lib/cloud/sync-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isCronAuthorized(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) return false;

  const authorization = request.headers.get('authorization');
  if (authorization === `Bearer ${configuredSecret}`) {
    return true;
  }

  const xCronSecret = request.headers.get('x-cron-secret');
  if (xCronSecret === configuredSecret) {
    return true;
  }

  try {
    const url = new URL(request.url);
    const querySecret = url.searchParams.get('key') || url.searchParams.get('secret');
    if (querySecret === configuredSecret) {
      return true;
    }
  } catch {
    // ignore URL parsing error
  }

  return false;
}

export async function GET(request: Request) {
  const authorized = isCronAuthorized(request);

  if (!authorized) {
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

export const POST = GET;
