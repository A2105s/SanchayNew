'use client';

/**
 * Offline-capable mutation queue.
 *
 * Offline actions (logIncident / startTrip / endTrip) are enqueued to localStorage
 * when the network is unavailable, then flushed with exponential backoff:
 *  - whenever the browser fires the `online` event, and
 *  - on a 30s interval timer.
 *
 * The queue stores minimal request descriptors {url, body, createdAt, attempts, id}.
 */

import { markCloudSyncQueued } from '@/lib/client/sync-status';

export interface OfflineRequest {
  id: string;
  url: string;
  body: unknown;
  createdAt: number;
  attempts: number;
}

const STORAGE_KEY = 'sanchay:offline-queue:v1';
const QUEUE_EVENT = 'sanchay:offline-queue-change';
const MAX_ATTEMPTS = 8;

let flushing = false;
let timer: ReturnType<typeof setInterval> | null = null;
let wired = false;

function read(): OfflineRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(queue: OfflineRequest[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // storage may be blocked; best effort
  }
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: queue.length }));
}

export function pendingCount(): number {
  return read().length;
}

export function subscribe(listener: (count: number) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => listener(read().length);
  window.addEventListener(QUEUE_EVENT, handler);
  window.addEventListener('storage', handler);
  listener(read().length);
  return () => {
    window.removeEventListener(QUEUE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

/** Enqueue a mutation for later delivery. Returns the queued request id. */
export function enqueueOffline(url: string, body: unknown): string {
  const queue = read();
  const id = `ofq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  queue.push({ id, url, body, createdAt: Date.now(), attempts: 0 });
  write(queue);
  markCloudSyncQueued(`${queue.length} offline action${queue.length === 1 ? '' : 's'} queued`);
  return id;
}

/** Try to deliver every queued request. Items exceeding MAX_ATTEMPTS are dropped. */
export async function flushOfflineQueue(): Promise<void> {
  if (typeof window === 'undefined' || flushing) return;
  if (!navigator.onLine) return;
  flushing = true;
  try {
    let queue = read();
    if (!queue.length) return;

    const remaining: OfflineRequest[] = [];
    for (const item of queue) {
      // Exponential backoff gate: skip items that failed recently.
      const backoffMs = Math.min(30_000, 1000 * 2 ** item.attempts);
      if (item.attempts > 0 && Date.now() - item.createdAt < backoffMs) {
        remaining.push(item);
        continue;
      }
      try {
        const response = await fetch(item.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(item.body),
          cache: 'no-store'
        });
        if (!response.ok && response.status >= 500) {
          throw new Error(`HTTP ${response.status}`);
        }
        // 2xx or non-retryable 4xx => drop from the queue.
      } catch {
        const attempts = item.attempts + 1;
        if (attempts < MAX_ATTEMPTS) {
          remaining.push({ ...item, attempts, createdAt: Date.now() });
        }
      }
    }
    write(remaining);
    queue = remaining;
  } finally {
    flushing = false;
  }
}

/** Wire up the automatic flush triggers once per page. Safe to call repeatedly. */
export function ensureOfflineFlushWiring(): void {
  if (typeof window === 'undefined' || wired) return;
  wired = true;
  window.addEventListener('online', () => void flushOfflineQueue());
  if (!timer) timer = setInterval(() => void flushOfflineQueue(), 30_000);
  void flushOfflineQueue();
}
