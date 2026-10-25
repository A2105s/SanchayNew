import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type BackendEvent, type SyncJob } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { CLOUD_CACHE_TAGS, invalidateCloudData } from '@/lib/cloud/cached-queries';
import { recordCloudEvent } from '@/lib/cloud/backend-events';

const RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const JOB_LOCK_MS = 2 * 60_000;

export type SyncJobType = 'ImportVehicles' | 'PruneTelemetry' | 'ReevaluateEligibility' | 'ExpireRequests';

export interface SyncJobView {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError?: string;
  operationId: string;
  recordCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface SyncJobCounts {
  pending: number;
  processing: number;
  failed: number;
  completed: number;
}

export interface SyncJobSummary extends SyncJobCounts {
  recent: SyncJobView[];
  events: BackendEventView[];
}

export interface BackendEventView {
  id: string;
  operationId: string;
  level: string;
  category: string;
  action: string;
  status: string;
  recordCount?: number;
  message: string;
  details?: unknown;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------

type JobHandler = (payload: Prisma.JsonValue, job: SyncJob) => Promise<{ recordCount: number; result?: Prisma.InputJsonValue }>;

const HANDLERS: Record<SyncJobType, JobHandler> = {
  ImportVehicles: async (payload) => {
    const { importVehiclesFromJob } = await import('@/lib/cloud/ops/vehicles');
    const result = await importVehiclesFromJob(payload);
    invalidateCloudData(CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.all);
    return { recordCount: result.created + result.updated, result: result as unknown as Prisma.InputJsonValue };
  },
  PruneTelemetry: async () => {
    const deleted = await pruneTelemetry(7);
    return { recordCount: deleted, result: { telemetryDeleted: deleted } };
  },
  ReevaluateEligibility: async () => {
    const { reevaluateAll } = await import('@/lib/cloud/eligibility');
    const count = await reevaluateAll();
    invalidateCloudData(CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.all);
    return { recordCount: count, result: { reevaluated: count } };
  },
  ExpireRequests: async () => {
    const { expireStaleRequests } = await import('@/lib/cloud/ops/requests');
    const count = await expireStaleRequests();
    invalidateCloudData(CLOUD_CACHE_TAGS.ops, CLOUD_CACHE_TAGS.all);
    return { recordCount: count, result: { expired: count } };
  }
};

// ---------------------------------------------------------------------------
// Enqueue / process
// ---------------------------------------------------------------------------

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function enqueueJob(type: SyncJobType, payload: unknown, idempotencyKey?: string): Promise<SyncJob> {
  const key = idempotencyKey ?? `${type}:${createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex')}`;
  const operationId = randomUUID();
  const existing = await prisma.syncJob.findUnique({ where: { idempotencyKey: key } });

  if (existing?.status === 'Completed' || existing?.status === 'Processing') return existing;

  if (existing) {
    return prisma.syncJob.update({
      where: { id: existing.id },
      data: {
        payload: toJson(payload),
        operationId,
        status: 'Pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null
      }
    });
  }

  try {
    return await prisma.syncJob.create({
      data: { idempotencyKey: key, type, status: 'Pending', payload: toJson(payload), operationId }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    return prisma.syncJob.findUniqueOrThrow({ where: { idempotencyKey: key } });
  }
}

export async function processSyncJob(jobId: string): Promise<SyncJob> {
  const current = await prisma.syncJob.findUniqueOrThrow({ where: { id: jobId } });
  if (current.status === 'Completed' || current.status === 'Failed') return current;

  const workerId = randomUUID();
  const lockExpiredBefore = new Date(Date.now() - JOB_LOCK_MS);
  const claimed = await prisma.syncJob.updateMany({
    where: {
      id: jobId,
      AND: [
        {
          OR: [
            { status: { in: ['Pending', 'Retrying'] }, nextAttemptAt: { lte: new Date() } },
            { status: 'Processing', lockedAt: { lt: lockExpiredBefore } }
          ]
        },
        { OR: [{ lockedAt: null }, { lockedAt: { lt: lockExpiredBefore } }] }
      ]
    },
    data: { status: 'Processing', lockedAt: new Date(), lockedBy: workerId }
  });

  if (!claimed.count) return prisma.syncJob.findUniqueOrThrow({ where: { id: jobId } });

  const job = await prisma.syncJob.findUniqueOrThrow({ where: { id: jobId } });
  const attempt = job.attempts + 1;
  const handler = HANDLERS[job.type as SyncJobType];

  await recordCloudEvent({
    operationId: job.operationId,
    level: 'info',
    category: 'sync-job',
    action: job.type,
    status: 'started',
    message: `Sync job ${job.type} attempt ${attempt} started.`
  });

  if (!handler) {
    const failed = await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: 'Failed', attempts: attempt, lockedAt: null, lockedBy: null, lastError: `No handler for job type ${job.type}` }
    });
    return failed;
  }

  try {
    const { recordCount, result } = await handler(job.payload, job);
    const completed = await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: 'Completed',
        attempts: attempt,
        recordCount,
        result: result ?? Prisma.JsonNull,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        completedAt: new Date()
      }
    });
    await recordCloudEvent({
      operationId: job.operationId,
      level: 'info',
      category: 'sync-job',
      action: job.type,
      status: 'succeeded',
      recordCount,
      message: `Sync job ${job.type} completed.`
    });
    return completed;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync-job failure';
    const retryable = isRetryableJobError(error);
    const hasAttemptsRemaining = attempt < job.maxAttempts;
    const status = retryable && hasAttemptsRemaining ? 'Retrying' : 'Failed';
    const failed = await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status,
        attempts: attempt,
        nextAttemptAt: new Date(Date.now() + getRetryDelayMs(attempt)),
        lockedAt: null,
        lockedBy: null,
        lastError: message
      }
    });
    await recordCloudEvent({
      operationId: job.operationId,
      level: 'error',
      category: 'sync-job',
      action: job.type,
      status: 'failed',
      message: `Sync job ${job.type} ${status === 'Retrying' ? 'scheduled for retry' : 'failed'}: ${message}`
    });
    return failed;
  }
}

export async function processDueSyncJobs(limit = 5): Promise<void> {
  const lockExpiredBefore = new Date(Date.now() - JOB_LOCK_MS);
  const dueJobs = await prisma.syncJob.findMany({
    where: {
      OR: [
        { status: { in: ['Pending', 'Retrying'] }, nextAttemptAt: { lte: new Date() } },
        { status: 'Processing', lockedAt: { lt: lockExpiredBefore } }
      ]
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: Math.max(1, Math.min(limit, 20)),
    select: { id: true }
  });
  for (const job of dueJobs) {
    await processSyncJob(job.id);
  }
}

export async function getSyncJobCounts(): Promise<SyncJobCounts> {
  const grouped = await prisma.syncJob.groupBy({ by: ['status'], _count: { _all: true } });
  const counts = new Map(grouped.map((item) => [item.status, item._count._all]));
  return {
    pending: (counts.get('Pending') ?? 0) + (counts.get('Retrying') ?? 0),
    processing: counts.get('Processing') ?? 0,
    failed: counts.get('Failed') ?? 0,
    completed: counts.get('Completed') ?? 0
  };
}

export async function getSyncJobSummary(): Promise<SyncJobSummary> {
  const [counts, recent, events] = await Promise.all([
    getSyncJobCounts(),
    prisma.syncJob.findMany({ orderBy: { updatedAt: 'desc' }, take: 50 }),
    prisma.backendEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  ]);
  return { ...counts, recent: recent.map(mapSyncJob), events: events.map(mapBackendEvent) };
}

/**
 * Prunes completed sync-job history and old backend events (default 30 days), and always
 * prunes TelemetryPoint rows older than 7 days.
 */
export async function pruneSyncHistory(retentionDays = 30): Promise<{ eventsDeleted: number; jobsDeleted: number; telemetryDeleted: number }> {
  const days = Math.max(1, Math.min(365, Math.floor(retentionDays)));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [events, jobs] = await prisma.$transaction([
    prisma.backendEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.syncJob.deleteMany({ where: { status: 'Completed', completedAt: { lt: cutoff } } })
  ]);
  const telemetryDeleted = await pruneTelemetry(7);
  return { eventsDeleted: events.count, jobsDeleted: jobs.count, telemetryDeleted };
}

export async function pruneTelemetry(retentionDays = 7): Promise<number> {
  const days = Math.max(1, Math.min(90, Math.floor(retentionDays)));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await prisma.telemetryPoint.deleteMany({ where: { recordedAt: { lt: cutoff } } });
  return deleted.count;
}

// ---------------------------------------------------------------------------
// Mappers / helpers
// ---------------------------------------------------------------------------

function mapBackendEvent(event: BackendEvent): BackendEventView {
  return {
    id: event.id,
    operationId: event.operationId,
    level: event.level,
    category: event.category,
    action: event.action,
    status: event.status,
    recordCount: event.recordCount ?? undefined,
    message: event.message,
    details: event.details ?? undefined,
    createdAt: event.createdAt.toISOString()
  };
}

export function mapSyncJob(job: SyncJob): SyncJobView {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    nextAttemptAt: job.nextAttemptAt.toISOString(),
    lastError: job.lastError ?? undefined,
    operationId: job.operationId,
    recordCount: job.recordCount,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString()
  };
}

function getRetryDelayMs(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(0, attempt - 1), RETRY_DELAYS_MS.length - 1)];
}

function isRetryableJobError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028', 'P2034'].includes(error.code);
  }
  return true;
}
