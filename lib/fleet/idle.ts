import type { VehicleView } from '@/types';

/** Whole days the vehicle has been idle (based on `idleSince`), or null if active. */
export function idleDays(vehicle: VehicleView): number | null {
  if (!vehicle.idleSince) return null;
  const since = new Date(vehicle.idleSince);
  if (Number.isNaN(since.getTime())) return null;
  const diff = Date.now() - since.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / 86_400_000);
}

export type IdleLevel = 'none' | 'review' | 'reallocate' | 'gem';

export interface IdleSuggestion {
  level: IdleLevel;
  title: string;
  detail: string;
  /** True when this vehicle is NOT a candidate for reuse/disposal suggestions at all. */
  excluded: boolean;
}

/**
 * Only GOVERNMENT_FLEET vehicles that are verified (eligibility != PENDING_VERIFICATION)
 * and operationally eligible may ever appear as idle-reuse / GeM candidates.
 *
 * Seized/impounded and unverified vehicles are NEVER surfaced for reallocation or auction —
 * their disposal follows a separate legal/custody workflow, not ordinary fleet reuse.
 */
export function isReuseCandidate(vehicle: VehicleView): boolean {
  if (vehicle.ownershipCategory !== 'GOVERNMENT_FLEET') return false;
  if (vehicle.eligibilityState === 'PENDING_VERIFICATION') return false;
  if (vehicle.operationalStatus === 'RETIRED') return false;
  return true;
}

/**
 * Suggests what to do with a long-idle government-fleet asset:
 *  - review (3+ days), reallocate (7+ days), GeM surplus candidate (30+ days).
 * Never recommends auction/disposal for seized or unverified vehicles.
 */
export function idleSuggestion(vehicle: VehicleView): IdleSuggestion {
  if (!isReuseCandidate(vehicle)) {
    return {
      level: 'none',
      title: 'Not a reuse candidate',
      detail:
        vehicle.ownershipCategory !== 'GOVERNMENT_FLEET'
          ? 'Seized/impounded or unverified assets follow a separate legal process, not fleet reuse.'
          : 'Pending verification or retired; excluded from reuse suggestions until reviewed.',
      excluded: true
    };
  }

  const days = idleDays(vehicle);

  if (days == null) {
    return { level: 'none', title: 'Active', detail: 'Vehicle is in regular use.', excluded: false };
  }

  if (days >= 30) {
    return {
      level: 'gem',
      title: 'GeM surplus candidate',
      detail: `Idle for ${days} days. Evaluate for surplus listing/disposal on GeM.`,
      excluded: false
    };
  }
  if (days >= 7) {
    return {
      level: 'reallocate',
      title: 'Reallocate to another station',
      detail: `Idle for ${days} days. Consider transferring to a station with demand.`,
      excluded: false
    };
  }
  if (days >= 3) {
    return {
      level: 'review',
      title: 'Review utilisation',
      detail: `Idle for ${days} days. Check whether this asset can be put back into service.`,
      excluded: false
    };
  }
  return {
    level: 'none',
    title: 'Recently idle',
    detail: `Idle for ${days} day${days === 1 ? '' : 's'}.`,
    excluded: false
  };
}
