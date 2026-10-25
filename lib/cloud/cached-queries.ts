import 'server-only';

import { revalidateTag } from 'next/cache';

export const CLOUD_CACHE_TAGS = {
  all: 'cloud-data',
  fleet: 'cloud-fleet',
  ops: 'cloud-ops',
  audit: 'cloud-audit'
} as const;

export type CloudCacheTag = (typeof CLOUD_CACHE_TAGS)[keyof typeof CLOUD_CACHE_TAGS];

/**
 * The FleetSnapshot is now scoped to the caller's organization tree and therefore cannot be a
 * shared cache; the snapshot route computes it per request. These tags remain so that writes
 * can invalidate any future per-tag caches and so the public health fingerprint stays coherent.
 */
export function invalidateCloudData(...tags: string[]): void {
  const tagsToInvalidate = tags.length ? tags : [CLOUD_CACHE_TAGS.all];
  tagsToInvalidate.forEach((tag) => {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch (error) {
      // revalidateTag throws outside a request scope (e.g. background jobs); safe to ignore.
      if (process.env.NODE_ENV === 'development') {
        console.debug('[cloud-cache:invalidate]', tag, error instanceof Error ? error.message : 'unknown');
      }
    }
  });
}
