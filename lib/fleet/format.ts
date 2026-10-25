import type {
  AllocationLifecycle,
  AvailabilityState,
  EligibilityState,
  OperationalStatus,
  OwnershipCategory,
  RequestState,
  Sector,
  TelemetryFreshness,
  VehicleClass,
  VehicleStatus
} from '@/types';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

export const SECTOR_LABEL: Record<Sector, string> = {
  GMC_WASTE: 'GMC Waste',
  AMBULANCE_108: 'Ambulance 108',
  POLICE_PATROL: 'Police Patrol',
  PWD_HEAVY: 'PWD Heavy',
  HEALTH_VAN: 'Health Van',
  ELECTION_REQUISITION: 'Election Requisition'
};

export const CLASS_LABEL: Record<VehicleClass, string> = {
  PATROL_CAR: 'Patrol car',
  MOTORCYCLE: 'Motorcycle',
  VAN: 'Van',
  HEAVY: 'Heavy vehicle'
};

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  MOVING: 'Moving',
  IDLE: 'Idle',
  BREAKDOWN: 'Breakdown',
  OFFLINE: 'Offline'
};

const STATUS_TONE: Record<VehicleStatus, Tone> = {
  MOVING: 'success',
  IDLE: 'warning',
  BREAKDOWN: 'danger',
  OFFLINE: 'neutral'
};

export function statusTone(status: VehicleStatus): Tone {
  return STATUS_TONE[status] ?? 'neutral';
}

// ---------------------------------------------------------------------------
// New status concepts (kept SEPARATE per spec 13): operational / ownership /
// eligibility / availability / request state / allocation lifecycle / freshness.
// Each label map has a matching tone map.
// ---------------------------------------------------------------------------

export const OPERATIONAL_LABEL: Record<OperationalStatus, string> = {
  ACTIVE: 'Active',
  MAINTENANCE: 'In maintenance',
  OUT_OF_SERVICE: 'Out of service',
  RETIRED: 'Retired'
};

export const OPERATIONAL_TONE: Record<OperationalStatus, Tone> = {
  ACTIVE: 'success',
  MAINTENANCE: 'warning',
  OUT_OF_SERVICE: 'danger',
  RETIRED: 'neutral'
};

export function operationalTone(status: OperationalStatus): Tone {
  return OPERATIONAL_TONE[status] ?? 'neutral';
}

export const OWNERSHIP_LABEL: Record<OwnershipCategory, string> = {
  GOVERNMENT_FLEET: 'Government fleet',
  SEIZED_IMPOUNDED: 'Seized / impounded',
  OTHER_UNVERIFIED: 'Other / unverified'
};

export const OWNERSHIP_TONE: Record<OwnershipCategory, Tone> = {
  GOVERNMENT_FLEET: 'brand',
  SEIZED_IMPOUNDED: 'danger',
  OTHER_UNVERIFIED: 'warning'
};

export function ownershipTone(category: OwnershipCategory): Tone {
  return OWNERSHIP_TONE[category] ?? 'neutral';
}

export const ELIGIBILITY_LABEL: Record<EligibilityState, string> = {
  ELIGIBLE: 'Eligible',
  RESTRICTED: 'Restricted',
  PENDING_VERIFICATION: 'Pending verification',
  INELIGIBLE: 'Ineligible'
};

export const ELIGIBILITY_TONE: Record<EligibilityState, Tone> = {
  ELIGIBLE: 'success',
  RESTRICTED: 'warning',
  PENDING_VERIFICATION: 'info',
  INELIGIBLE: 'danger'
};

export function eligibilityTone(state: EligibilityState): Tone {
  return ELIGIBILITY_TONE[state] ?? 'neutral';
}

export const AVAILABILITY_LABEL: Record<AvailabilityState, string> = {
  AVAILABLE: 'Available',
  ALLOCATED: 'Allocated',
  UNAVAILABLE: 'Unavailable',
  RESTRICTED: 'Restricted',
  PENDING_VERIFICATION: 'Pending verification',
  INELIGIBLE: 'Ineligible'
};

export const AVAILABILITY_TONE: Record<AvailabilityState, Tone> = {
  AVAILABLE: 'success',
  ALLOCATED: 'info',
  UNAVAILABLE: 'neutral',
  RESTRICTED: 'warning',
  PENDING_VERIFICATION: 'info',
  INELIGIBLE: 'danger'
};

export function availabilityTone(state: AvailabilityState): Tone {
  return AVAILABILITY_TONE[state] ?? 'neutral';
}

export const REQUEST_STATE_LABEL: Record<RequestState, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired'
};

export const REQUEST_STATE_TONE: Record<RequestState, Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  CHANGES_REQUESTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral'
};

export function requestStateTone(state: RequestState): Tone {
  return REQUEST_STATE_TONE[state] ?? 'neutral';
}

export const ALLOCATION_LABEL: Record<AllocationLifecycle, string> = {
  RESERVED: 'Reserved',
  AWAITING_HANDOVER: 'Awaiting handover',
  ACTIVE: 'Active',
  RETURNED_PENDING_INSPECTION: 'Returned — pending inspection',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  INCIDENT_HOLD: 'Incident hold'
};

export const ALLOCATION_TONE: Record<AllocationLifecycle, Tone> = {
  RESERVED: 'info',
  AWAITING_HANDOVER: 'warning',
  ACTIVE: 'success',
  RETURNED_PENDING_INSPECTION: 'warning',
  COMPLETED: 'neutral',
  CANCELLED: 'neutral',
  INCIDENT_HOLD: 'danger'
};

export function allocationTone(lifecycle: AllocationLifecycle): Tone {
  return ALLOCATION_TONE[lifecycle] ?? 'neutral';
}

export const FRESHNESS_LABEL: Record<TelemetryFreshness, string> = {
  FRESH: 'Fresh',
  STALE: 'Stale',
  UNKNOWN: 'Unknown'
};

export const FRESHNESS_TONE: Record<TelemetryFreshness, Tone> = {
  FRESH: 'success',
  STALE: 'warning',
  UNKNOWN: 'neutral'
};

export function freshnessTone(freshness: TelemetryFreshness): Tone {
  return FRESHNESS_TONE[freshness] ?? 'neutral';
}

// ---------------------------------------------------------------------------
// Date / number formatting
// ---------------------------------------------------------------------------

function parseDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function fmtDate(value: string | number | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(value: string | number | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function fmtRelative(value: string | number | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;

  if (abs < minute) return 'just now';
  const rtf = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' });
  if (abs < hour) return rtf.format(Math.round(diffMs / minute), 'minute');
  if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour');
  if (abs < day * 30) return rtf.format(Math.round(diffMs / day), 'day');
  return fmtDate(date);
}

export function fmtKm(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return '—';
  return `${Math.round(km).toLocaleString('en-IN')} km`;
}

export function fmtInr(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

/** Full datetime for a device clock vs server ingestion contrast (spec 17). */
export function fmtClock(value: string | number | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}
