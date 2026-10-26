import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/**
 * Local cache for *paid* provider lookups.
 *
 * Only data Sanchay is allowed to retain goes here. Mapbox geocoding is deliberately excluded:
 * its terms forbid retaining geocoding responses, so that client keeps a short in-memory cache
 * instead. eCourts case data has no such restriction and every fetch costs credits, so it is
 * persisted here and reused.
 *
 * Every function is failure-tolerant: a cache outage must degrade to "call the provider", never
 * to a broken screen.
 */

export type CacheStatus = 'OK' | 'NOT_FOUND' | 'RESTRICTED' | 'PROVIDER_ERROR';

export interface CacheEntry<T> {
  payload: T;
  status: CacheStatus;
  fetchedAt: Date;
  expiresAt: Date | null;
  hits: number;
}

export interface CacheWriteOptions {
  status?: CacheStatus;
  /** Time-to-live in ms. Null/omitted means the row never expires (reference data). */
  ttlMs?: number | null;
}

function asJson(payload: unknown): Prisma.InputJsonValue {
  if (payload === null || payload === undefined) return {};
  return payload as Prisma.InputJsonValue;
}

export async function readCache<T>(provider: string, cacheKey: string): Promise<CacheEntry<T> | null> {
  try {
    const row = await prisma.externalDataCache.findUnique({
      where: { provider_cacheKey: { provider, cacheKey } }
    });
    if (!row) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

    // Fire-and-forget hit counter, so reviewing provider spend is possible later.
    void prisma.externalDataCache
      .update({ where: { id: row.id }, data: { hits: { increment: 1 } } })
      .catch(() => undefined);

    return {
      payload: row.payload as T,
      status: row.status as CacheStatus,
      fetchedAt: row.fetchedAt,
      expiresAt: row.expiresAt,
      hits: row.hits
    };
  } catch (error) {
    console.warn('[integration-cache] read failed:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

export async function writeCache(
  provider: string,
  cacheKey: string,
  payload: unknown,
  options: CacheWriteOptions = {}
): Promise<void> {
  const status: CacheStatus = options.status ?? 'OK';
  const expiresAt = options.ttlMs ? new Date(Date.now() + options.ttlMs) : null;
  try {
    await prisma.externalDataCache.upsert({
      where: { provider_cacheKey: { provider, cacheKey } },
      create: { provider, cacheKey, payload: asJson(payload), status, expiresAt, fetchedAt: new Date() },
      update: { payload: asJson(payload), status, expiresAt, fetchedAt: new Date() }
    });
  } catch (error) {
    console.warn('[integration-cache] write failed:', error instanceof Error ? error.message : 'unknown');
  }
}

export interface WithCacheResult<T> {
  payload: T;
  status: CacheStatus;
  cached: boolean;
  fetchedAt: Date;
}

/**
 * Read-through helper: returns the cached payload when fresh, otherwise runs `load` once and
 * stores the result. `load` must already have mapped provider errors into a status.
 */
export async function withCache<T>(
  provider: string,
  cacheKey: string,
  ttlMs: number | null,
  load: () => Promise<{ payload: T; status: CacheStatus; cacheable?: boolean }>
): Promise<WithCacheResult<T>> {
  const hit = await readCache<T>(provider, cacheKey);
  if (hit) {
    return { payload: hit.payload, status: hit.status, cached: true, fetchedAt: hit.fetchedAt };
  }

  const fresh = await load();
  // Only successful and definitive-negative results are worth retaining; transient provider
  // failures must not be cached, or a blip would poison the key for the whole TTL.
  const cacheable = fresh.cacheable ?? (fresh.status === 'OK' || fresh.status === 'NOT_FOUND');
  if (cacheable) await writeCache(provider, cacheKey, fresh.payload, { status: fresh.status, ttlMs });

  return { payload: fresh.payload, status: fresh.status, cached: false, fetchedAt: new Date() };
}

/** Drops a single cached entry (used when an operator explicitly asks for fresh data). */
export async function dropCache(provider: string, cacheKey: string): Promise<void> {
  try {
    await prisma.externalDataCache.deleteMany({ where: { provider, cacheKey } });
  } catch (error) {
    console.warn('[integration-cache] delete failed:', error instanceof Error ? error.message : 'unknown');
  }
}
