// Shared pure helpers for OPS pages. Kept here (not in lib/fleet) per contract:
// anything OPS-specific that is not in the shared format lib lives under components/ops/.
// Aligned with the NEW model in types/index.ts (no lifecycle, no GeM/auction for seized vehicles).
import React, { type ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import type {
  AllocationView,
  AssetRequestView,
  DeviceView,
  FleetSettings,
  IncidentView,
  SessionUser,
  TransferView,
  TripView,
  VehicleClass,
  VehicleView
} from '@/types';

export const VEHICLE_CLASSES: VehicleClass[] = ['PATROL_CAR', 'MOTORCYCLE', 'VAN', 'HEAVY'];

export const CLASS_LABEL_LOCAL: Record<VehicleClass, string> = {
  PATROL_CAR: 'Patrol car',
  MOTORCYCLE: 'Motorcycle',
  VAN: 'Van',
  HEAVY: 'Heavy'
};

/** Friendly greeting based on local time of day. */
export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function todayLong(d = new Date()): string {
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/** Device status tone (ONLINE/STALE/OFFLINE/UNPROVISIONED). */
export function deviceStatusTone(status: DeviceView['status']): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'ONLINE':
      return 'success';
    case 'STALE':
      return 'warning';
    case 'OFFLINE':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function incidentSeverityTone(sev: IncidentView['severity']): 'info' | 'warning' | 'danger' {
  if (sev === 'CRITICAL') return 'danger';
  if (sev === 'WARNING') return 'warning';
  return 'info';
}

/** Does [aStart,aEnd] overlap [bStart,bEnd] ? (ISO strings) */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = Date.parse(aStart);
  const ae = Date.parse(aEnd);
  const bs = Date.parse(bStart);
  const be = Date.parse(bEnd);
  return as < be && bs < ae;
}

/** Sum trips per day over the last `days` days -> array oldest..newest (BarTrend points). */
export function tripsPerDay(
  trips: TripView[],
  days = 14
): { dateStr: string; displayLabel: string; subLabel: string; count: number }[] {
  const buckets: { dateStr: string; displayLabel: string; subLabel: string; count: number }[] = [];
  const now = new Date();
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    buckets.push({
      dateStr: d.toISOString().slice(0, 10),
      displayLabel: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      subLabel: DAY_NAMES[d.getDay()],
      count: 0
    });
  }
  const map = new Map(buckets.map((b) => [b.dateStr, b]));
  for (const t of trips ?? []) {
    const key = (t.startedAt ?? '').slice(0, 10);
    const b = map.get(key);
    if (b) b.count += 1;
  }
  return buckets;
}

/** Whole hours [aStart,aEnd] etc. — small helpers reused by idle/dashboard. */
export function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / 3_600_000);
}

/** Copy text to clipboard, resolves to success boolean. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Status dot tone for vehicle live motion status. */
export function vehicleStatusTone(s: VehicleView['status']): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (s) {
    case 'MOVING':
      return 'success';
    case 'IDLE':
      return 'warning';
    case 'BREAKDOWN':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function countsTotal(counts: Partial<Record<VehicleClass, number>>): number {
  return VEHICLE_CLASSES.reduce((sum, c) => sum + (counts[c] ?? 0), 0);
}

export function offlineDevices(devices: DeviceView[]): DeviceView[] {
  return (devices ?? []).filter((d) => d.status === 'OFFLINE' || d.status === 'STALE');
}

/**
 * Does this request need the current user's organization to make a decision?
 * UI affordance only; the server is authoritative. Mirrors the request pipeline:
 * SUBMITTED / UNDER_REVIEW requests whose approverOrgId is in the user's org tree.
 */
export function needsMyDecision(me: SessionUser | null, r: AssetRequestView, orgIds: Set<string>): boolean {
  if (!me) return false;
  if (r.state !== 'SUBMITTED' && r.state !== 'UNDER_REVIEW') return false;
  if (!r.approverOrgId) return false;
  return orgIds.has(r.approverOrgId);
}

/** Overdue allocations (ACTIVE and past end + grace, surfaced by the server as returnDue). */
export function isOverdueReturn(a: AllocationView): boolean {
  return a.lifecycle === 'ACTIVE' && (a.returnDue || a.overdueHours > 0);
}

/** Chart palette aligned with the analytics tokens / EasyLife donut colours. */
export const CHART_COLORS = {
  brand: '#2563eb',
  success: '#16a34a',
  info: '#0ea5e9',
  warning: '#d97706',
  danger: '#dc2626',
  neutral: '#64748b',
  purple: '#7c3aed',
  teal: '#0d9488'
};

/** Tone for a station-pool transfer status badge. */
export function transferStatusTone(s: TransferView['status']): 'info' | 'brand' | 'success' | 'danger' | 'warning' | 'neutral' {
  switch (s) {
    case 'PENDING':
    case 'PENDING_LENDER_REVIEW':
      return 'info';
    case 'PENDING_DISTRICT_SANCTION':
      return 'warning';
    case 'ALLOCATED':
      return 'brand';
    case 'ACTIVE':
    case 'COMPLETED':
      return 'success';
    case 'REJECTED':
    case 'REJECTED_BY_LENDER':
    case 'REJECTED_BY_ADMIN':
      return 'danger';
    default:
      return 'neutral';
  }
}

/**
 * UI affordance only (server is authoritative): may this user review (clearance/sanction/complete) the transfer?
 */
export function canReviewTransfer(me: SessionUser, t: TransferView, hasReviewPermission: boolean): boolean {
  if (!hasReviewPermission) return false;
  if (t.status === 'PENDING' || t.status === 'PENDING_LENDER_REVIEW') {
    if (me.role === 'STATION_OFFICER') return me.stationId === t.sourceStationId;
    return me.role === 'ADMIN';
  }
  if (t.status === 'PENDING_DISTRICT_SANCTION') {
    return me.role === 'ADMIN' || me.role === 'ORG_ADMIN';
  }
  if (t.status === 'ALLOCATED' || t.status === 'ACTIVE') {
    if (me.role === 'STATION_OFFICER') return me.stationId === t.sourceStationId || me.stationId === t.destinationStationId;
    return me.role === 'ADMIN' || me.role === 'ORG_ADMIN';
  }
  return false;
}

/** Organization ids visible to the user: own organization plus all descendants (platform admin: everything). */
export function orgTreeIds(me: SessionUser | null, orgs: { id: string; parentId: string | null }[]): Set<string> {
  const ids = new Set<string>();
  if (!me) return ids;
  if (me.role === 'ADMIN') {
    for (const o of orgs ?? []) ids.add(o.id);
    return ids;
  }
  if (!me.organizationId) return ids;
  ids.add(me.organizationId);
  let grew = true;
  while (grew) {
    grew = false;
    for (const o of orgs ?? []) {
      if (o.parentId && ids.has(o.parentId) && !ids.has(o.id)) {
        ids.add(o.id);
        grew = true;
      }
    }
  }
  return ids;
}
export type { FleetSettings };

/** Human-friendly value for report/table cells: ISO timestamps become local dates, numbers get Indian grouping. */
export function formatCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'number') return v.toLocaleString('en-IN');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return String(v);
}

/**
 * Renders an operational or report cell with EasyLife-grade typography and badge styling.
 * Maps raw database enums (ELIGIBLE, ACTIVE, GOVERNMENT_FLEET, etc.) into high-contrast,
 * branded badge pills, registration plate chips, and JetBrains Mono codes.
 */
export function renderReportCell(
  v: unknown,
  columnKey?: string
): ReactNode {
  if (v === null || v === undefined || v === '') {
    return <span className="text-muted">—</span>;
  }

  // Boolean values
  if (typeof v === 'boolean') {
    return <Badge tone={v ? 'success' : 'neutral'}>{v ? 'Yes' : 'No'}</Badge>;
  }

  // Numeric values
  if (typeof v === 'number') {
    return <span className="mono">{v.toLocaleString('en-IN')}</span>;
  }

  if (typeof v === 'string') {
    const trimmed = v.trim();

    // 1. Exact enum mappings to Badges
    switch (trimmed) {
      // Eligibility states
      case 'ELIGIBLE':
        return <Badge tone="success">Eligible</Badge>;
      case 'RESTRICTED':
        return <Badge tone="danger">Restricted</Badge>;
      case 'PENDING_VERIFICATION':
        return <Badge tone="warning">Pending verification</Badge>;
      case 'INELIGIBLE':
        return <Badge tone="neutral">Ineligible</Badge>;

      // Operational & motion statuses
      case 'ACTIVE':
        return <Badge tone="success">Active</Badge>;
      case 'MOVING':
        return (
          <span className="badge badge--success" style={{ gap: 6 }}>
            <span className="status-dot status-dot--success status-dot--pulse" style={{ width: 6, height: 6 }} />
            <span>Moving</span>
          </span>
        );
      case 'IDLE':
        return <Badge tone="warning">Idle</Badge>;
      case 'BREAKDOWN':
        return <Badge tone="danger">Breakdown</Badge>;
      case 'MAINTENANCE':
        return <Badge tone="warning">Maintenance</Badge>;
      case 'INCIDENT_HOLD':
        return <Badge tone="danger">Incident hold</Badge>;
      case 'RETIRED':
        return <Badge tone="neutral">Retired</Badge>;
      case 'DECOMMISSIONED':
        return <Badge tone="neutral">Decommissioned</Badge>;

      // Ownership categories
      case 'GOVERNMENT_FLEET':
        return <Badge tone="brand">Gov Fleet</Badge>;
      case 'HIRED_PRIVATE':
        return <Badge tone="neutral">Hired Private</Badge>;
      case 'SEIZED_DISPUTED':
        return <Badge tone="warning">Seized / Disputed</Badge>;

      // Vehicle classes
      case 'PATROL_CAR':
        return <span style={{ fontWeight: 600 }}>Patrol car</span>;
      case 'MOTORCYCLE':
        return <span style={{ fontWeight: 600 }}>Motorcycle</span>;
      case 'VAN':
        return <span style={{ fontWeight: 600 }}>Van</span>;
      case 'HEAVY':
        return <span style={{ fontWeight: 600 }}>Heavy</span>;

      // Telemetry / Device statuses
      case 'ONLINE':
        return <Badge tone="success">Online</Badge>;
      case 'STALE':
        return <Badge tone="warning">Stale</Badge>;
      case 'OFFLINE':
        return <Badge tone="danger">Offline</Badge>;
      case 'UNPROVISIONED':
        return <Badge tone="neutral">Unprovisioned</Badge>;

      // Incident severity
      case 'CRITICAL':
        return <Badge tone="danger">Critical</Badge>;
      case 'WARNING':
        return <Badge tone="warning">Warning</Badge>;
      case 'INFO':
        return <Badge tone="info">Info</Badge>;

      // Lifecycle / Request / Transfer / Ticket states
      case 'SUBMITTED':
        return <Badge tone="info">Submitted</Badge>;
      case 'UNDER_REVIEW':
        return <Badge tone="warning">Under review</Badge>;
      case 'APPROVED':
        return <Badge tone="success">Approved</Badge>;
      case 'ALLOCATED':
        return <Badge tone="brand">Allocated</Badge>;
      case 'PENDING_LENDER_REVIEW':
        return <Badge tone="info">Pending clearance</Badge>;
      case 'PENDING_DISTRICT_SANCTION':
        return <Badge tone="warning">Pending sanction</Badge>;
      case 'REJECTED':
        return <Badge tone="danger">Rejected</Badge>;
      case 'REJECTED_BY_LENDER':
        return <Badge tone="danger">Rejected by lender</Badge>;
      case 'REJECTED_BY_ADMIN':
        return <Badge tone="danger">Rejected by admin</Badge>;
      case 'COMPLETED':
        return <Badge tone="success">Completed</Badge>;
      case 'CANCELLED':
        return <Badge tone="neutral">Cancelled</Badge>;
      case 'OPEN':
        return <Badge tone="warning">Open</Badge>;
      case 'IN_PROGRESS':
        return <Badge tone="brand">In progress</Badge>;
      case 'RESOLVED':
        return <Badge tone="success">Resolved</Badge>;
      case 'CLOSED':
        return <Badge tone="neutral">Closed</Badge>;
      case 'RESERVED':
        return <Badge tone="info">Reserved</Badge>;
      case 'AWAITING_HANDOVER':
        return <Badge tone="warning">Awaiting handover</Badge>;
      case 'RETURNED_PENDING_INSPECTION':
        return <Badge tone="warning">Pending inspection</Badge>;
      case 'VALID':
        return <Badge tone="success">Valid</Badge>;
      case 'EXPIRING_SOON':
        return <Badge tone="warning">Expiring soon</Badge>;
      case 'EXPIRED':
        return <Badge tone="danger">Expired</Badge>;
      default:
        break;
    }

    // 2. License plate registration numbers (e.g. MP07-**-6386 or MP07AB1234)
    if (
      columnKey === 'registration' ||
      columnKey === 'registrationNumber' ||
      /^[A-Z]{2}\d{2}[-*A-Z0-9]{2,10}$/i.test(trimmed)
    ) {
      return <span className="reg-plate-inline">{trimmed}</span>;
    }

    // 3. Asset codes (e.g. SCH-V-0001, SCH-M-0012)
    if (
      columnKey === 'asset' ||
      columnKey === 'assetCode' ||
      /^SCH-[A-Z]-\d+$/i.test(trimmed)
    ) {
      return <strong className="mono table-code">{trimmed}</strong>;
    }

    // 4. Ticket, Transfer, Request, Incident, Audit codes (e.g. TKT-2026-..., TRF-...)
    if (/^[A-Z]{3,4}-\d{4}-[A-Z0-9]+$/i.test(trimmed)) {
      return <strong className="mono table-code">{trimmed}</strong>;
    }

    // 5. ISO timestamps (e.g. 2026-10-18T10:30:00.000Z)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
      const d = new Date(trimmed);
      if (!Number.isNaN(d.getTime())) {
        const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        return (
          <span className="table-date-cell">
            <strong className="mono" style={{ fontSize: '0.86rem', color: 'var(--color-text-primary)' }}>{dateStr}</strong>
            <span className="mono text-muted" style={{ fontSize: '0.76rem', display: 'block' }}>{timeStr}</span>
          </span>
        );
      }
    }

    // 6. ISO Date only (e.g. 2026-10-18)
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(`${trimmed}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        return (
          <span className="mono" style={{ fontSize: '0.86rem' }}>
            {d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        );
      }
    }

    // Fallback: regular string
    return trimmed;
  }

  return String(v);
}
