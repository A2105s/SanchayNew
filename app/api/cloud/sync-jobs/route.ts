import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { getSyncJobSummary, processDueSyncJobs } from '@/lib/cloud/sync-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json({ success: true, data: await getSyncJobSummary() });
  } catch (error) {
    console.error('[cloud/sync-jobs:get]', error);
    return NextResponse.json({ success: false, error: 'Server retry status is unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  try {
    await processDueSyncJobs(10);
    return NextResponse.json({ success: true, data: await getSyncJobSummary() });
  } catch (error) {
    console.error('[cloud/sync-jobs:post]', error);
    return NextResponse.json({ success: false, error: 'Server retries could not be processed.' }, { status: 503 });
  }
}
