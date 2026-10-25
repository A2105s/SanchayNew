import { after, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { getDataVersion } from '@/lib/cloud/fleet';
import { getSyncJobCounts, processDueSyncJobs, pruneSyncHistory } from '@/lib/cloud/sync-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPruneAt = 0;

export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  try {
    const [syncJobs, dataVersion] = await Promise.all([getSyncJobCounts(), getDataVersion()]);

    const hasRetryableJobs = syncJobs.pending + syncJobs.processing > 0;
    const shouldPrune = Date.now() - lastPruneAt >= PRUNE_INTERVAL_MS;
    if (shouldPrune) lastPruneAt = Date.now();

    if (hasRetryableJobs || shouldPrune) {
      after(async () => {
        await Promise.all([
          hasRetryableJobs ? processDueSyncJobs(5) : Promise.resolve(),
          shouldPrune ? pruneSyncHistory(30) : Promise.resolve()
        ]).catch((error) => console.error('[cloud/health:background]', error));
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        resetEpoch: 0,
        dataVersion,
        syncJobs: {
          pending: syncJobs.pending,
          processing: syncJobs.processing,
          failed: syncJobs.failed,
          completed: syncJobs.completed
        }
      }
    });
  } catch (error) {
    console.error('[cloud/health]', error);
    return NextResponse.json({ success: false, error: 'Cloud database is not available.' }, { status: 503 });
  }
}
