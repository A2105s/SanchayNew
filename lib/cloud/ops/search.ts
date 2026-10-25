import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser, VehicleCardView, VehicleSearchResult, VehicleView } from '@/types';
import { DEFAULT_FLEET_SETTINGS, FLEET_SETTINGS_KEY, mergeFleetSettings } from '@/lib/cloud/errors';
import { freshnessFor, mapVehicle, maskRegistration } from '@/lib/cloud/mappers';
import { computeAvailability } from '@/lib/cloud/eligibility';
import { orgTree } from '@/lib/auth/scope';
import type { FleetSettings } from '@/types';
import type { VehicleSearchParsed } from '@/lib/validation/schemas';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

async function loadSettings(): Promise<FleetSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: FLEET_SETTINGS_KEY } });
  return row ? mergeFleetSettings(row.value) : { ...DEFAULT_FLEET_SETTINGS };
}

/**
 * Server-side vehicle search with pagination, filters and scope.
 *  - scope=own: vehicles in the caller's org tree (full VehicleView).
 *  - scope=discover: eligible, active, government-fleet vehicles of OTHER orgs (masked VehicleCardView).
 * emptyReason distinguishes "no vehicles match these filters" (NO_MATCH) from "no vehicles are
 * accessible" (NO_ACCESS). Out-of-scope records are never revealed.
 */
export async function searchVehicles(user: SessionUser, params: VehicleSearchParsed): Promise<VehicleSearchResult> {
  const settings = await loadSettings();
  const now = new Date();
  const page = params.page ?? 1;
  const pageSize = Math.min(MAX_PAGE_SIZE, params.pageSize ?? DEFAULT_PAGE_SIZE);
  const scope = params.scope ?? 'own';
  const tree = await orgTree(user);

  const from = params.from ? new Date(params.from) : null;
  const to = params.to ? new Date(params.to) : null;

  const and: Prisma.VehicleWhereInput[] = [];

  // Scope gate.
  if (scope === 'discover') {
    and.push({ ownershipCategory: 'GOVERNMENT_FLEET', eligibilityState: 'ELIGIBLE', operationalStatus: 'ACTIVE' });
    if (tree !== null) and.push({ organizationId: { notIn: tree } });
    else and.push({}); // ADMIN discovers everything that is discoverable
  } else {
    if (tree !== null) {
      if (tree.length === 0) {
        return emptyResult(page, pageSize, now, from, to, 'NO_ACCESS');
      }
      and.push({ organizationId: { in: tree } });
      // Station-scoped roles only see their station within the org.
      if ((user.role === 'STATION_OFFICER' || user.role === 'FIELD_STAFF') && user.stationId) {
        and.push({ stationId: user.stationId });
      }
    }
  }

  // Filters.
  if (params.q) {
    const q = params.q.trim();
    and.push({
      OR: [
        { assetCode: { contains: q, mode: 'insensitive' } },
        { registrationNormalized: { contains: q.toUpperCase().replace(/[^A-Z0-9]/gu, '') } },
        { displayName: { contains: q, mode: 'insensitive' } }
      ]
    });
  }
  if (params.vehicleClass) and.push({ vehicleClass: params.vehicleClass });
  if (params.sector) and.push({ sector: params.sector });
  if (params.organizationId) and.push({ organizationId: params.organizationId });
  if (params.stationId) and.push({ stationId: params.stationId });
  if (params.operationalStatus) and.push({ operationalStatus: params.operationalStatus });
  if (params.eligibility) and.push({ eligibilityState: params.eligibility });
  if (params.ownership) and.push({ ownershipCategory: params.ownership });

  if (params.complianceState) {
    const warn = new Date(now.getTime() + settings.complianceWarnDays * 86400000);
    if (params.complianceState === 'expired') {
      and.push({ OR: [{ pucExpiry: { lt: now } }, { insuranceExpiry: { lt: now } }, { fitnessExpiry: { lt: now } }] });
    } else if (params.complianceState === 'expiring') {
      and.push({ OR: [{ pucExpiry: { gte: now, lte: warn } }, { insuranceExpiry: { gte: now, lte: warn } }, { fitnessExpiry: { gte: now, lte: warn } }] });
    }
  }
  if (params.staleTelemetry) {
    const staleBefore = new Date(now.getTime() - settings.telemetryFreshMinutes * 60000);
    and.push({ OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: staleBefore } }] });
  }

  const where: Prisma.VehicleWhereInput = and.length ? { AND: and } : {};

  const orderBy: Prisma.VehicleOrderByWithRelationInput = (() => {
    const dir = params.dir ?? 'asc';
    switch (params.sort) {
      case 'registration':
        return { registrationNormalized: dir };
      case 'status':
        return { operationalStatus: dir };
      case 'lastSeen':
        return { lastSeenAt: dir };
      default:
        return { assetCode: dir };
    }
  })();

  const total = await prisma.vehicle.count({ where });
  const rows = await prisma.vehicle.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize });

  const orgIds = [...new Set(rows.map((r) => r.organizationId))];
  const orgs = orgIds.length ? await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [];
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

  const stationIds = [...new Set(rows.map((r) => r.stationId).filter(Boolean))] as string[];
  const stations = stationIds.length ? await prisma.station.findMany({ where: { id: { in: stationIds } }, select: { id: true, name: true } }) : [];
  const stationNameById = new Map(stations.map((s) => [s.id, s.name]));

  const items: (VehicleView | VehicleCardView)[] = [];
  for (const row of rows) {
    const isOwn = tree === null || tree.includes(row.organizationId);
    const availability = await computeAvailability(row.id, from, to, prisma, settings, now);

    if (params.availableOnly && availability.state !== 'AVAILABLE') continue;

    if (scope === 'own' && isOwn) {
      items.push(mapVehicle(row, orgNameById.get(row.organizationId) ?? 'Unknown', settings.telemetryFreshMinutes));
    } else {
      const card: VehicleCardView = {
        id: row.id,
        assetCode: row.assetCode,
        registrationMasked: isOwn ? row.registrationNumber : maskRegistration(row.registrationNumber),
        displayName: row.displayName,
        vehicleClass: row.vehicleClass as VehicleCardView['vehicleClass'],
        vehicleType: row.vehicleType,
        makeModel: row.makeModel,
        seating: row.seating,
        fuelType: row.fuelType,
        organizationId: row.organizationId,
        organizationName: orgNameById.get(row.organizationId) ?? 'Unknown',
        stationName: row.stationId ? stationNameById.get(row.stationId) ?? null : null,
        operationalStatus: row.operationalStatus as VehicleCardView['operationalStatus'],
        eligibilityState: row.eligibilityState as VehicleCardView['eligibilityState'],
        availability,
        telemetryFreshness: freshnessFor(row.lastSeenAt, settings.telemetryFreshMinutes, now),
        lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
        nextMaintenanceDue: null,
        isOwn,
        photoUrl: row.photoPath
      };
      items.push(card);
    }
  }

  const hasFilters = Boolean(
    params.q || params.vehicleClass || params.sector || params.organizationId || params.stationId || params.operationalStatus || params.eligibility || params.ownership || params.complianceState || params.staleTelemetry || params.availableOnly
  );
  let emptyReason: VehicleSearchResult['emptyReason'] = null;
  if (items.length === 0) {
    emptyReason = hasFilters ? 'NO_MATCH' : total === 0 ? 'NO_ACCESS' : 'NO_MATCH';
  }

  return {
    items,
    total,
    page,
    pageSize,
    asOf: now.toISOString(),
    emptyReason,
    from: from ? from.toISOString() : null,
    to: to ? to.toISOString() : null
  };
}

function emptyResult(page: number, pageSize: number, now: Date, from: Date | null, to: Date | null, reason: VehicleSearchResult['emptyReason']): VehicleSearchResult {
  return { items: [], total: 0, page, pageSize, asOf: now.toISOString(), emptyReason: reason, from: from ? from.toISOString() : null, to: to ? to.toISOString() : null };
}
