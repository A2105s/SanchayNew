// Shared pure helpers for OPS pages. Kept here (not in lib/fleet) per contract:
// anything OPS-specific that is not in the shared format lib lives under components/ops/.
// Aligned with the NEW model in types/index.ts (no lifecycle, no GeM/auction for seized vehicles).
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
export function transferStatusTone(s: TransferView['status']): 'info' | 'brand' | 'success' | 'danger' | 'neutral' {
  switch (s) {
    case 'PENDING':
      return 'info';
    case 'ALLOCATED':
      return 'brand';
    case 'COMPLETED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    default:
      return 'neutral';
  }
}

/**
 * UI affordance only (server is authoritative): may this user review (approve/reject) the transfer?
 * Source-station officers review their own station's pool; department officers / org admins review any in scope.
 */
export function canReviewTransfer(me: SessionUser, t: TransferView, hasReviewPermission: boolean): boolean {
  if (!hasReviewPermission) return false;
  if (t.status !== 'PENDING') return false;
  if (me.role === 'STATION_OFFICER') return me.stationId === t.sourceStationId;
  return true;
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
  return v;
}
