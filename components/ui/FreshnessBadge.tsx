import type { TelemetryFreshness } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { FRESHNESS_LABEL, freshnessTone, fmtRelative } from '@/lib/fleet/format';

/**
 * Telemetry freshness badge. Shows FRESH / STALE / UNKNOWN with the last-updated
 * relative time. A stale/unknown reading NEVER implies the vehicle is inactive or
 * unavailable (spec 17) — only that the last telemetry event is older than the
 * configured threshold.
 */
export function FreshnessBadge({
  freshness,
  lastSeenAt,
  showRelative = true
}: {
  freshness: TelemetryFreshness;
  lastSeenAt?: string | null;
  showRelative?: boolean;
}) {
  const title =
    freshness === 'FRESH'
      ? 'Telemetry is fresh (within the configured threshold).'
      : freshness === 'STALE'
        ? 'Telemetry is stale. This does not mean the vehicle is inactive, unavailable or lost.'
        : 'No recent telemetry. Freshness is unknown; status is not inferred from telemetry.';
  return (
    <span className="freshness-badge" title={title}>
      <Badge tone={freshnessTone(freshness)}>{FRESHNESS_LABEL[freshness]}</Badge>
      {showRelative && lastSeenAt ? (
        <span className="freshness-badge__time">Updated {fmtRelative(lastSeenAt)}</span>
      ) : null}
    </span>
  );
}
