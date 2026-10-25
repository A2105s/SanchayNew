export type CloudSyncState = 'idle' | 'syncing' | 'queued' | 'synced' | 'failed';

export interface CloudSyncStatus {
  state: CloudSyncState;
  pending: number;
  message?: string;
  updatedAt: number;
}

const SYNC_STATUS_EVENT = 'sanchay:cloud-sync-status';
let pendingCount = 0;
let lastStatus: CloudSyncStatus = {
  state: 'idle',
  pending: 0,
  updatedAt: Date.now()
};

export function getCloudSyncStatus(): CloudSyncStatus {
  return lastStatus;
}

export function subscribeCloudSyncStatus(listener: (status: CloudSyncStatus) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handler = (event: Event) => {
    listener((event as CustomEvent<CloudSyncStatus>).detail);
  };

  window.addEventListener(SYNC_STATUS_EVENT, handler);
  listener(lastStatus);
  return () => window.removeEventListener(SYNC_STATUS_EVENT, handler);
}

export async function trackCloudSync<T>(operation: Promise<T>, message = 'Syncing changes'): Promise<T> {
  beginCloudSync(message);
  try {
    const result = await operation;
    endCloudSync(true);
    return result;
  } catch (error) {
    endCloudSync(false);
    throw error;
  }
}

export function beginCloudSync(message = 'Syncing changes') {
  pendingCount += 1;
  publishCloudSyncStatus({
    state: 'syncing',
    pending: pendingCount,
    message,
    updatedAt: Date.now()
  });
}

export function endCloudSync(success: boolean) {
  pendingCount = Math.max(0, pendingCount - 1);
  if (pendingCount > 0) {
    publishCloudSyncStatus({
      state: 'syncing',
      pending: pendingCount,
      message: `${pendingCount} sync task${pendingCount === 1 ? '' : 's'} running`,
      updatedAt: Date.now()
    });
    return;
  }

  publishCloudSyncStatus({
    state: success ? 'synced' : 'failed',
    pending: 0,
    message: success ? 'Cloud sync complete' : 'Cloud sync failed',
    updatedAt: Date.now()
  });
}

export function markCloudSyncQueued(message: string) {
  pendingCount = Math.max(0, pendingCount - 1);
  publishCloudSyncStatus({
    state: 'queued',
    pending: 0,
    message,
    updatedAt: Date.now()
  });
}

function publishCloudSyncStatus(status: CloudSyncStatus) {
  lastStatus = status;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: status }));
}
