import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { ReportKind, ReportMetric, ReportResult, SessionUser } from '@/types';
import { DEFAULT_FLEET_SETTINGS, FLEET_SETTINGS_KEY, mergeFleetSettings, DomainError } from '@/lib/cloud/errors';
import { maskRegistration, orgTree } from '@/lib/auth/scope';
import type { FleetSettings } from '@/types';

export interface ReportFilters {
  from?: string;
  to?: string;
  organizationId?: string;
  vehicleClass?: string;
  status?: string;
}

async function loadSettings(): Promise<FleetSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: FLEET_SETTINGS_KEY } });
  return row ? mergeFleetSettings(row.value) : { ...DEFAULT_FLEET_SETTINGS };
}

/** Org ids in scope, or null for ADMIN (all). Intersects with an optional organizationId filter. */
async function scopeOrgIds(user: SessionUser, filterOrgId?: string): Promise<{ orgIds: string[] | null; scopeLabel: string }> {
  const tree = await orgTree(user);
  if (filterOrgId) {
    if (tree !== null && !tree.includes(filterOrgId)) throw new DomainError('Organization is outside your scope.', 403);
    const org = await prisma.organization.findUnique({ where: { id: filterOrgId }, select: { name: true } });
    return { orgIds: [filterOrgId], scopeLabel: `Organization: ${org?.name ?? filterOrgId}` };
  }
  if (tree === null) return { orgIds: null, scopeLabel: 'All organizations (platform)' };
  const org = user.organizationId ? await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } }) : null;
  return { orgIds: tree, scopeLabel: `Organization: ${org?.name ?? 'your organization'} (and sub-units)` };
}

function windowDates(filters: ReportFilters): { from: Date | null; to: Date | null } {
  return { from: filters.from ? new Date(filters.from) : null, to: filters.to ? new Date(filters.to) : null };
}

function metric(key: string, label: string, value: number | string | null, definition: string, unit?: string): ReportMetric {
  return { key, label, value, unit, definition };
}

const REPORT_TITLES: Record<ReportKind, string> = {
  'fleet-composition': 'Fleet Composition',
  maintenance: 'Vehicles in Maintenance',
  'restricted-unverified': 'Restricted / Unverified Vehicles',
  'compliance-due': 'Compliance Due',
  'active-allocations': 'Active Allocations',
  'overdue-returns': 'Overdue Returns',
  'pending-approvals': 'Pending Approvals',
  'stale-telemetry': 'Stale Telemetry',
  utilization: 'Utilization',
  downtime: 'Downtime',
  'approval-cycle-time': 'Approval Cycle Time',
  'allocation-history': 'Allocation History',
  'maintenance-history': 'Maintenance History',
  'gem-disposal': 'GeM Disposal (Auction-Ready)',
  'audit-events': 'Audit Events'
};

export const REPORT_KINDS = Object.keys(REPORT_TITLES) as ReportKind[];

function vehicleScopeWhere(orgIds: string[] | null, filters: ReportFilters): Prisma.VehicleWhereInput {
  const and: Prisma.VehicleWhereInput[] = [];
  if (orgIds !== null) and.push({ organizationId: { in: orgIds } });
  if (filters.vehicleClass) and.push({ vehicleClass: filters.vehicleClass });
  if (filters.status) and.push({ operationalStatus: filters.status });
  return and.length ? { AND: and } : {};
}

export async function buildReport(user: SessionUser, kind: ReportKind, filters: ReportFilters): Promise<ReportResult> {
  if (!REPORT_KINDS.includes(kind)) throw new DomainError(`Unknown report "${kind}".`, 404);
  const settings = await loadSettings();
  const rowCap = settings.exportRowLimit;
  const now = new Date();
  const { orgIds, scopeLabel } = await scopeOrgIds(user, filters.organizationId);
  const { from, to } = windowDates(filters);

  const base = {
    kind,
    title: REPORT_TITLES[kind],
    generatedAt: now.toISOString(),
    window: { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null },
    scope: scopeLabel
  };

  const vehicleWhere = vehicleScopeWhere(orgIds, filters);

  switch (kind) {
    case 'fleet-composition': {
      const vehicles = await prisma.vehicle.findMany({ where: vehicleWhere, take: rowCap + 1 });
      const truncated = vehicles.length > rowCap;
      const rows = vehicles.slice(0, rowCap);
      const byClass = new Map<string, number>();
      const byElig = new Map<string, number>();
      for (const v of rows) {
        byClass.set(v.vehicleClass, (byClass.get(v.vehicleClass) ?? 0) + 1);
        byElig.set(v.eligibilityState, (byElig.get(v.eligibilityState) ?? 0) + 1);
      }
      return {
        ...base,
        metrics: [
          metric('total', 'Total vehicles', rows.length, 'Count of vehicles in scope (any ownership/eligibility). Retired excluded only if status filter applied.'),
          metric('eligible', 'Eligible', byElig.get('ELIGIBLE') ?? 0, 'Vehicles with cached eligibilityState=ELIGIBLE.'),
          metric('ineligible', 'Ineligible', byElig.get('INELIGIBLE') ?? 0, 'Vehicles with eligibilityState=INELIGIBLE (seized/out-of-service/compliance).')
        ],
        columns: [
          { key: 'assetCode', label: 'Asset' },
          { key: 'registration', label: 'Registration' },
          { key: 'vehicleClass', label: 'Class' },
          { key: 'ownershipCategory', label: 'Ownership' },
          { key: 'eligibilityState', label: 'Eligibility' },
          { key: 'operationalStatus', label: 'Status' }
        ],
        rows: rows.map((v) => ({ assetCode: v.assetCode, registration: maskRegistration(v.registrationNumber), vehicleClass: v.vehicleClass, ownershipCategory: v.ownershipCategory, eligibilityState: v.eligibilityState, operationalStatus: v.operationalStatus })),
        truncated
      };
    }

    case 'maintenance':
    case 'maintenance-history': {
      const historical = kind === 'maintenance-history';
      const where: Prisma.MaintenanceRecordWhereInput = {
        vehicle: orgIds !== null ? { organizationId: { in: orgIds } } : undefined,
        ...(historical ? {} : { status: { notIn: ['COMPLETED', 'CANCELLED'] } }),
        ...(from || to ? { createdAt: { gte: from ?? undefined, lte: to ?? undefined } } : {})
      };
      const records = await prisma.maintenanceRecord.findMany({ where, orderBy: { createdAt: 'desc' }, take: rowCap + 1, include: { vehicle: { select: { assetCode: true, registrationNumber: true } } } });
      const truncated = records.length > rowCap;
      const rows = records.slice(0, rowCap);
      return {
        ...base,
        metrics: [
          metric('count', historical ? 'Tickets in window' : 'Open tickets', rows.length, historical ? 'All maintenance tickets created in the window.' : 'Tickets with status not in {COMPLETED, CANCELLED}.'),
          metric('blocking', 'Blocking availability', rows.filter((r) => r.blocksAvailability).length, 'Open tickets with blocksAvailability=true (remove the vehicle from availability).')
        ],
        columns: [
          { key: 'ticket', label: 'Ticket' },
          { key: 'asset', label: 'Asset' },
          { key: 'title', label: 'Title' },
          { key: 'severity', label: 'Severity' },
          { key: 'status', label: 'Status' },
          { key: 'blocks', label: 'Blocks availability' }
        ],
        rows: rows.map((r) => ({ ticket: r.ticketCode, asset: r.vehicle.assetCode, title: r.title, severity: r.severity, status: r.status, blocks: r.blocksAvailability })),
        truncated
      };
    }

    case 'restricted-unverified': {
      const where: Prisma.VehicleWhereInput = { AND: [vehicleWhere, { OR: [{ eligibilityState: 'RESTRICTED' }, { eligibilityState: 'PENDING_VERIFICATION' }, { ownershipCategory: { not: 'GOVERNMENT_FLEET' } }] }] };
      const vehicles = await prisma.vehicle.findMany({ where, take: rowCap + 1 });
      const truncated = vehicles.length > rowCap;
      const rows = vehicles.slice(0, rowCap);
      return {
        ...base,
        metrics: [metric('count', 'Restricted / unverified', rows.length, 'Vehicles with eligibility RESTRICTED or PENDING_VERIFICATION, or ownership not GOVERNMENT_FLEET.')],
        columns: [
          { key: 'asset', label: 'Asset' },
          { key: 'registration', label: 'Registration' },
          { key: 'ownership', label: 'Ownership' },
          { key: 'eligibility', label: 'Eligibility' }
        ],
        rows: rows.map((v) => ({ asset: v.assetCode, registration: maskRegistration(v.registrationNumber), ownership: v.ownershipCategory, eligibility: v.eligibilityState })),
        truncated
      };
    }

    case 'gem-disposal': {
      const where: Prisma.VehicleWhereInput = { AND: [vehicleWhere, { custodyState: 'AUCTION_READY' }] };
      const vehicles = await prisma.vehicle.findMany({ where, take: rowCap + 1 });
      const truncated = vehicles.length > rowCap;
      const rows = vehicles.slice(0, rowCap);
      return {
        ...base,
        metrics: [metric('count', 'Auction-ready', rows.length, 'Vehicles marked AUCTION_READY in the custody/disposal workflow; withdrawn from ordinary allocation.')],
        columns: [
          { key: 'asset', label: 'Asset' },
          { key: 'registration', label: 'Registration' },
          { key: 'makeModel', label: 'Make / model' },
          { key: 'class', label: 'Class' },
          { key: 'ownership', label: 'Ownership' },
          { key: 'custodyNote', label: 'Disposal authorization' },
          { key: 'since', label: 'Marked at' }
        ],
        rows: rows.map((v) => ({ asset: v.assetCode, registration: maskRegistration(v.registrationNumber), makeModel: v.makeModel ?? '', class: v.vehicleClass, ownership: v.ownershipCategory, custodyNote: v.custodyNote ?? '', since: v.custodyUpdatedAt ? v.custodyUpdatedAt.toISOString() : '' })),
        truncated
      };
    }

    case 'compliance-due': {
      const warn = new Date(now.getTime() + settings.complianceWarnDays * 86400000);
      const where: Prisma.VehicleWhereInput = { AND: [vehicleWhere, { OR: [{ pucExpiry: { lte: warn } }, { insuranceExpiry: { lte: warn } }, { fitnessExpiry: { lte: warn } }] }] };
      const vehicles = await prisma.vehicle.findMany({ where, take: rowCap + 1 });
      const truncated = vehicles.length > rowCap;
      const rows = vehicles.slice(0, rowCap);
      const expired = rows.filter((v) => [v.pucExpiry, v.insuranceExpiry, v.fitnessExpiry].some((d) => d && d < now)).length;
      return {
        ...base,
        metrics: [
          metric('due', 'Compliance due/expiring', rows.length, `Vehicles with any mandatory document expiring within ${settings.complianceWarnDays} days or already expired.`),
          metric('expired', 'Already expired', expired, 'Subset with at least one expired mandatory document.')
        ],
        columns: [
          { key: 'asset', label: 'Asset' },
          { key: 'puc', label: 'PUC expiry' },
          { key: 'insurance', label: 'Insurance expiry' },
          { key: 'fitness', label: 'Fitness expiry' }
        ],
        rows: rows.map((v) => ({ asset: v.assetCode, puc: v.pucExpiry?.toISOString() ?? '', insurance: v.insuranceExpiry?.toISOString() ?? '', fitness: v.fitnessExpiry?.toISOString() ?? '' })),
        truncated
      };
    }

    case 'active-allocations': {
      const allocWhere = allocationScopeWhere(orgIds, { lifecycle: { in: ['RESERVED', 'AWAITING_HANDOVER', 'ACTIVE', 'RETURNED_PENDING_INSPECTION', 'INCIDENT_HOLD'] } });
      const allocations = await prisma.allocation.findMany({ where: allocWhere, orderBy: { startAt: 'asc' }, take: rowCap + 1, include: { vehicle: { select: { assetCode: true, registrationNumber: true } } } });
      const truncated = allocations.length > rowCap;
      const rows = allocations.slice(0, rowCap);
      return {
        ...base,
        metrics: [metric('active', 'Live allocations', rows.length, 'Allocations whose lifecycle is not COMPLETED or CANCELLED.')],
        columns: [
          { key: 'code', label: 'Allocation' },
          { key: 'asset', label: 'Asset' },
          { key: 'lifecycle', label: 'Lifecycle' },
          { key: 'start', label: 'Start' },
          { key: 'end', label: 'End' }
        ],
        rows: rows.map((a) => ({ code: a.allocationCode, asset: a.vehicle.assetCode, lifecycle: a.lifecycle, start: a.startAt.toISOString(), end: a.endAt.toISOString() })),
        truncated
      };
    }

    case 'overdue-returns': {
      const graceCutoff = new Date(now.getTime() - settings.returnGraceMinutes * 60000);
      const allocWhere = allocationScopeWhere(orgIds, { lifecycle: 'ACTIVE', endAt: { lt: graceCutoff } });
      const allocations = await prisma.allocation.findMany({ where: allocWhere, orderBy: { endAt: 'asc' }, take: rowCap + 1, include: { vehicle: { select: { assetCode: true, registrationNumber: true } } } });
      const truncated = allocations.length > rowCap;
      const rows = allocations.slice(0, rowCap);
      return {
        ...base,
        metrics: [metric('overdue', 'Overdue returns', rows.length, `ACTIVE allocations past endAt + returnGrace (${settings.returnGraceMinutes} min) and not yet returned.`)],
        columns: [
          { key: 'code', label: 'Allocation' },
          { key: 'asset', label: 'Asset' },
          { key: 'end', label: 'Due' },
          { key: 'overdueHours', label: 'Overdue (h)' }
        ],
        rows: rows.map((a) => ({ code: a.allocationCode, asset: a.vehicle.assetCode, end: a.endAt.toISOString(), overdueHours: Math.floor((now.getTime() - a.endAt.getTime()) / 3600000) })),
        truncated
      };
    }

    case 'pending-approvals': {
      const where: Prisma.AssetRequestWhereInput = {
        state: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
        ...(orgIds !== null ? { approverOrgId: { in: orgIds } } : {})
      };
      const requests = await prisma.assetRequest.findMany({ where, orderBy: { submittedAt: 'asc' }, take: rowCap + 1 });
      const truncated = requests.length > rowCap;
      const rows = requests.slice(0, rowCap);
      return {
        ...base,
        metrics: [metric('pending', 'Pending approvals', rows.length, 'Requests in state SUBMITTED or UNDER_REVIEW awaiting a decision by an in-scope org. Cancelled/expired excluded.')],
        columns: [
          { key: 'code', label: 'Request' },
          { key: 'class', label: 'Class' },
          { key: 'state', label: 'State' },
          { key: 'submitted', label: 'Submitted' }
        ],
        rows: rows.map((r) => ({ code: r.requestCode, class: r.requestedClass, state: r.state, submitted: r.submittedAt?.toISOString() ?? '' })),
        truncated
      };
    }

    case 'stale-telemetry': {
      const staleBefore = new Date(now.getTime() - settings.telemetryFreshMinutes * 60000);
      const where: Prisma.VehicleWhereInput = { AND: [vehicleWhere, { OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: staleBefore } }] }] };
      const vehicles = await prisma.vehicle.findMany({ where, take: rowCap + 1 });
      const truncated = vehicles.length > rowCap;
      const rows = vehicles.slice(0, rowCap);
      return {
        ...base,
        metrics: [metric('stale', 'Stale / unknown telemetry', rows.length, `Vehicles with no telemetry or lastSeenAt older than ${settings.telemetryFreshMinutes} min. Does NOT imply the vehicle is inactive.`)],
        columns: [
          { key: 'asset', label: 'Asset' },
          { key: 'lastSeen', label: 'Last seen' },
          { key: 'source', label: 'GPS source' }
        ],
        rows: rows.map((v) => ({ asset: v.assetCode, lastSeen: v.lastSeenAt?.toISOString() ?? '', source: v.gpsSource })),
        truncated
      };
    }

    case 'utilization': {
      const trips = await prisma.trip.findMany({
        where: { vehicle: orgIds !== null ? { organizationId: { in: orgIds } } : undefined, startedAt: { gte: from ?? undefined, lte: to ?? undefined }, status: 'COMPLETED' },
        take: rowCap + 1,
        include: { vehicle: { select: { assetCode: true } } }
      });
      const truncated = trips.length > rowCap;
      const rows = trips.slice(0, rowCap);
      const totalKm = rows.reduce((s, t) => s + (t.distanceKm ?? 0), 0);
      const totalMin = rows.reduce((s, t) => s + (t.durationMin ?? 0), 0);
      return {
        ...base,
        metrics: [
          metric('trips', 'Completed trips', rows.length, 'Numerator: completed trips in the window. Cancelled/aborted trips excluded.'),
          metric('km', 'Total distance', Math.round(totalKm), 'Sum of distanceKm over completed trips in the window.', 'km'),
          metric('hours', 'Total hours', Math.round(totalMin / 60), 'Sum of durationMin/60 over completed trips in the window.', 'h')
        ],
        columns: [
          { key: 'trip', label: 'Trip' },
          { key: 'asset', label: 'Asset' },
          { key: 'km', label: 'Distance (km)' },
          { key: 'min', label: 'Duration (min)' }
        ],
        rows: rows.map((t) => ({ trip: t.tripCode, asset: t.vehicle.assetCode, km: t.distanceKm ?? 0, min: t.durationMin ?? 0 })),
        truncated
      };
    }

    case 'downtime': {
      const where: Prisma.MaintenanceRecordWhereInput = {
        vehicle: orgIds !== null ? { organizationId: { in: orgIds } } : undefined,
        status: 'COMPLETED',
        completedAt: { gte: from ?? undefined, lte: to ?? undefined }
      };
      const records = await prisma.maintenanceRecord.findMany({ where, take: rowCap + 1, include: { vehicle: { select: { assetCode: true } } } });
      const truncated = records.length > rowCap;
      const rows = records.slice(0, rowCap);
      return {
        ...base,
        metrics: [metric('events', 'Completed maintenance events', rows.length, 'Numerator: maintenance tickets completed in the window. Cancelled tickets excluded.')],
        columns: [
          { key: 'ticket', label: 'Ticket' },
          { key: 'asset', label: 'Asset' },
          { key: 'completed', label: 'Completed' },
          { key: 'cost', label: 'Cost (INR)' }
        ],
        rows: rows.map((r) => ({ ticket: r.ticketCode, asset: r.vehicle.assetCode, completed: r.completedAt?.toISOString() ?? '', cost: r.costInr })),
        truncated
      };
    }

    case 'approval-cycle-time': {
      const where: Prisma.AssetRequestWhereInput = {
        ...(orgIds !== null ? { approverOrgId: { in: orgIds } } : {}),
        state: { in: ['APPROVED', 'REJECTED'] },
        submittedAt: { not: null, gte: from ?? undefined, lte: to ?? undefined },
        decidedAt: { not: null }
      };
      const requests = await prisma.assetRequest.findMany({ where, take: rowCap + 1 });
      const truncated = requests.length > rowCap;
      const rows = requests.slice(0, rowCap);
      const cycleHours = rows
        .filter((r) => r.submittedAt && r.decidedAt)
        .map((r) => (r.decidedAt as Date).getTime() - (r.submittedAt as Date).getTime());
      const avgHours = cycleHours.length ? Math.round(cycleHours.reduce((s, v) => s + v, 0) / cycleHours.length / 3600000) : null;
      return {
        ...base,
        metrics: [
          metric('decided', 'Decided requests', rows.length, 'Approved or rejected requests with both submittedAt and decidedAt in the window. Cancelled/expired excluded.'),
          metric('avgCycleHours', 'Avg cycle time', avgHours, 'Mean (decidedAt - submittedAt) over decided requests.', 'h')
        ],
        columns: [
          { key: 'code', label: 'Request' },
          { key: 'state', label: 'Outcome' },
          { key: 'submitted', label: 'Submitted' },
          { key: 'decided', label: 'Decided' }
        ],
        rows: rows.map((r) => ({ code: r.requestCode, state: r.state, submitted: r.submittedAt?.toISOString() ?? '', decided: r.decidedAt?.toISOString() ?? '' })),
        truncated
      };
    }

    case 'allocation-history': {
      const allocWhere = allocationScopeWhere(orgIds, from || to ? { createdAt: { gte: from ?? undefined, lte: to ?? undefined } } : {});
      const allocations = await prisma.allocation.findMany({ where: allocWhere, orderBy: { createdAt: 'desc' }, take: rowCap + 1, include: { vehicle: { select: { assetCode: true } } } });
      const truncated = allocations.length > rowCap;
      const rows = allocations.slice(0, rowCap);
      return {
        ...base,
        metrics: [metric('count', 'Allocations in window', rows.length, 'All allocations created in the window, any lifecycle (including CANCELLED and COMPLETED).')],
        columns: [
          { key: 'code', label: 'Allocation' },
          { key: 'asset', label: 'Asset' },
          { key: 'lifecycle', label: 'Lifecycle' },
          { key: 'created', label: 'Created' }
        ],
        rows: rows.map((a) => ({ code: a.allocationCode, asset: a.vehicle.assetCode, lifecycle: a.lifecycle, created: a.createdAt.toISOString() })),
        truncated
      };
    }

    case 'audit-events': {
      const where: Prisma.AuditLogWhereInput = {
        ...(orgIds !== null ? { organizationId: { in: orgIds } } : {}),
        ...(from || to ? { performedAt: { gte: from ?? undefined, lte: to ?? undefined } } : {})
      };
      const events = await prisma.auditLog.findMany({ where, orderBy: { seq: 'desc' }, take: rowCap + 1 });
      const truncated = events.length > rowCap;
      const rows = events.slice(0, rowCap);
      return {
        ...base,
        metrics: [
          metric('count', 'Audit events', rows.length, 'Append-only audit rows in scope and window.'),
          metric('denied', 'Denied attempts', rows.filter((r) => r.outcome === 'DENIED').length, 'Subset with outcome=DENIED (blocked privileged attempts).')
        ],
        columns: [
          { key: 'seq', label: 'Seq' },
          { key: 'entity', label: 'Entity' },
          { key: 'action', label: 'Action' },
          { key: 'by', label: 'By' },
          { key: 'outcome', label: 'Outcome' },
          { key: 'at', label: 'At' }
        ],
        rows: rows.map((e) => ({ seq: e.seq, entity: `${e.entityType}:${e.entityId}`, action: e.action, by: e.performedBy, outcome: e.outcome, at: e.performedAt.toISOString() })),
        truncated
      };
    }

    default: {
      const _exhaustive: never = kind;
      throw new DomainError('Unknown report.', 404);
    }
  }
}

function allocationScopeWhere(orgIds: string[] | null, extra: Prisma.AllocationWhereInput): Prisma.AllocationWhereInput {
  if (orgIds === null) return extra;
  return { AND: [extra, { vehicle: { organizationId: { in: orgIds } } }] };
}

// ---------------------------------------------------------------------------
// CSV export (same scope + masking; formula-injection guard; row cap)
// ---------------------------------------------------------------------------

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[=+\-@\t\r]/u.test(str)) str = `'${str}`;
  if (/[",\n\r]/u.test(str)) str = `"${str.replace(/"/gu, '""')}"`;
  return str;
}

export function reportToCsv(report: ReportResult): string {
  const header = report.columns.map((c) => c.label);
  const lines = [header.map(csvCell).join(',')];
  for (const row of report.rows) {
    lines.push(report.columns.map((c) => csvCell(row[c.key])).join(','));
  }
  return `\ufeff${lines.join('\r\n')}\r\n`;
}
