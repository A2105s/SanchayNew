import 'server-only';

import { unstable_cache } from 'next/cache';
import { CLOUD_CACHE_TAGS } from '@/lib/cloud/cached-queries';
import { prisma } from '@/lib/db/prisma';
import type {
  AllocationView,
  AssetRequestView,
  FleetSnapshot,
  LiveDelta,
  SessionUser,
  VehicleCardView,
  VehicleDetail,
  VehicleStatus,
  VehicleView
} from '@/types';
import {
  freshnessFor,
  mapAllocation,
  mapApprovalStep,
  mapDevice,
  mapExtension,
  mapHandover,
  mapIncident,
  mapLegal,
  mapMaintenance,
  mapOrganization,
  mapRequest,
  mapRestriction,
  mapReturn,
  mapStation,
  mapTrip,
  mapTransfer,
  mapVehicle,
  mapAudit,
  mapDocument,
  mapOwnership,
  maskRegistration
} from '@/lib/cloud/mappers';
import { DEFAULT_FLEET_SETTINGS, FLEET_SETTINGS_KEY, mergeFleetSettings } from '@/lib/cloud/errors';
import { orgTree } from '@/lib/auth/scope';
import { evaluateEligibility, computeAvailability } from '@/lib/cloud/eligibility';
import type { FleetSettings } from '@/types';

export async function getDataVersion(): Promise<string> {
  try {
    const raw = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        (SELECT count(*) FROM "Organization")::int as org_c,
        (SELECT max("updatedAt") FROM "Organization") as org_m,
        (SELECT count(*) FROM "Station")::int as sta_c,
        (SELECT max("updatedAt") FROM "Station") as sta_m,
        (SELECT count(*) FROM "Vehicle")::int as veh_c,
        (SELECT max("updatedAt") FROM "Vehicle") as veh_m,
        (SELECT count(*) FROM "IotDevice")::int as dev_c,
        (SELECT max("updatedAt") FROM "IotDevice") as dev_m,
        (SELECT count(*) FROM "IncidentReport")::int as inc_c,
        (SELECT max("updatedAt") FROM "IncidentReport") as inc_m,
        (SELECT count(*) FROM "MaintenanceRecord")::int as mai_c,
        (SELECT max("updatedAt") FROM "MaintenanceRecord") as mai_m,
        (SELECT count(*) FROM "AssetRequest")::int as req_c,
        (SELECT max("updatedAt") FROM "AssetRequest") as req_m,
        (SELECT count(*) FROM "Allocation")::int as all_c,
        (SELECT max("updatedAt") FROM "Allocation") as all_m,
        (SELECT count(*) FROM "TransferRequest")::int as tra_c,
        (SELECT max("updatedAt") FROM "TransferRequest") as tra_m,
        (SELECT count(*) FROM "Trip")::int as tri_c,
        (SELECT max("updatedAt") FROM "Trip") as tri_m,
        (SELECT count(*) FROM "Notification")::int as not_c,
        (SELECT max("createdAt") FROM "Notification") as not_m
    `);
    if (raw && raw[0]) {
      const r = raw[0];
      const p = (c: unknown, m: unknown) => `${Number(c ?? 0)}:${m ? new Date(m as string | number | Date).getTime() : 0}`;
      return [
        p(r.org_c, r.org_m),
        p(r.sta_c, r.sta_m),
        p(r.veh_c, r.veh_m),
        p(r.dev_c, r.dev_m),
        p(r.inc_c, r.inc_m),
        p(r.mai_c, r.mai_m),
        p(r.req_c, r.req_m),
        p(r.all_c, r.all_m),
        p(r.tra_c, r.tra_m),
        p(r.tri_c, r.tri_m),
        p(r.not_c, r.not_m)
      ].join('|');
    }
  } catch (err) {
    console.warn('[fleet:getDataVersion] raw aggregate failed, falling back:', err);
  }

  const [orgs, stations, vehicles, devices, incidents, maintenance, requests, allocations, transfers, trips, notifications] = await Promise.all([
    prisma.organization.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.station.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.vehicle.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.iotDevice.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.incidentReport.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.maintenanceRecord.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.assetRequest.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.allocation.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.transferRequest.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.trip.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.notification.aggregate({ _count: { _all: true }, _max: { createdAt: true } })
  ]);
  const part = (item: { _count: { _all: number }; _max: { updatedAt?: Date | null; createdAt?: Date | null } }) =>
    `${item._count._all}:${(item._max.updatedAt ?? item._max.createdAt)?.getTime() ?? 0}`;
  return [orgs, stations, vehicles, devices, incidents, maintenance, requests, allocations, transfers, trips, notifications].map(part).join('|');
}

async function getSettings(): Promise<FleetSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: FLEET_SETTINGS_KEY } });
  return row ? mergeFleetSettings(row.value) : { ...DEFAULT_FLEET_SETTINGS };
}

/**
 * Builds a FleetSnapshot scoped to the caller's organization tree. The identity-dependent
 * scoping means the snapshot cannot be a SHARED cache — but it is cached per operator
 * (keyed by username + role + station) and invalidated by the same tags every write
 * already calls, so repeat dashboard loads are instant. The 30s bound covers writes that
 * bypass the ops layer.
 */
export async function getFleetSnapshot(user: SessionUser): Promise<FleetSnapshot> {
  const compute = unstable_cache(
    () => computeFleetSnapshot(user),
    ['cloud-snapshot', user.username, user.role, user.stationId ?? 'no-station'],
    { tags: [CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.all], revalidate: 30 }
  );
  return compute();
}

async function computeFleetSnapshot(user: SessionUser): Promise<FleetSnapshot> {
  const settings = await getSettings();
  const now = new Date();
  const tree = await orgTree(user);
  const treeOrgFilter = tree === null ? {} : { organizationId: { in: tree } };
  const vehicleStationFilter =
    (user.role === 'STATION_OFFICER' || user.role === 'FIELD_STAFF') && user.stationId ? { stationId: user.stationId } : {};

  const requestWhere =
    tree === null
      ? {}
      : { OR: [{ requestingOrgId: { in: tree } }, { approverOrgId: { in: tree } }] };

  // Allocations in scope (vehicle org in tree OR requesting org in tree).
  const allocWhere =
    tree === null
      ? {}
      : { OR: [{ vehicle: { organizationId: { in: tree } } }, { request: { requestingOrgId: { in: tree } } }] };

  const [organizations, stations, vehicleRows, vehicleTotal, devices, incidents, maintenance, trips, transfers, notifUnread, requestRows, allocRows, dataVersion] = await Promise.all([
    prisma.organization.findMany({ orderBy: { name: 'asc' } }),
    prisma.station.findMany({ where: tree === null ? {} : { OR: [{ organizationId: { in: tree } }, { organizationId: null }] }, include: { inventory: true }, orderBy: { name: 'asc' } }),
    prisma.vehicle.findMany({ where: { AND: [treeOrgFilter, vehicleStationFilter] }, orderBy: { updatedAt: 'desc' }, take: 300 }),
    prisma.vehicle.count({ where: { AND: [treeOrgFilter, vehicleStationFilter] } }),
    prisma.iotDevice.findMany({ where: tree === null ? {} : { OR: [{ organizationId: { in: tree } }, { organizationId: null }] }, orderBy: { updatedAt: 'desc' } }),
    prisma.incidentReport.findMany({ where: { vehicle: treeOrgFilter }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.maintenanceRecord.findMany({ where: { vehicle: treeOrgFilter, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, take: 400 }),
    prisma.trip.findMany({ where: { vehicle: treeOrgFilter }, orderBy: { startedAt: 'desc' }, take: 400 }),
    prisma.transferRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }),
    countUnreadInternal(user),
    prisma.assetRequest.findMany({ where: requestWhere, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.allocation.findMany({ where: allocWhere, orderBy: { createdAt: 'desc' }, take: 200 }),
    getDataVersion()
  ]);

  const orgNameById = new Map(organizations.map((o) => [o.id, o.name]));

  const vehicles: VehicleView[] = vehicleRows.map((v) => mapVehicle(v, orgNameById.get(v.organizationId) ?? 'Unknown', settings.telemetryFreshMinutes));

  // Requests I raised OR that need my org's decision. Their rows loaded in the main
  // parallel batch above; only the per-row detail fan-out runs as a second stage.
  const [requests, allocations] = await Promise.all([
    Promise.all(requestRows.map((r) => buildRequestView(r.id, user, orgNameById, tree))),
    Promise.all(allocRows.map((a) => buildAllocationView(a.id, user, tree, settings)))
  ]);

  return {
    me: user,
    generatedAt: now.toISOString(),
    dataVersion,
    settings,
    organizations: organizations.map(mapOrganization),
    stations: stations.map(mapStation),
    vehicles,
    vehicleTotal,
    devices: devices.map(mapDevice),
    incidents: incidents.map(mapIncident),
    maintenance: maintenance.map(mapMaintenance),
    requests,
    allocations,
    transfers: transfers.map(mapTransfer),
    trips: trips.map(mapTrip),
    unreadNotifications: notifUnread
  };
}

async function countUnreadInternal(user: SessionUser): Promise<number> {
  const or: Array<Record<string, unknown>> = [{ recipientUsername: user.username }];
  if (user.organizationId) {
    or.push({ recipientOrgId: user.organizationId, recipientRole: user.role });
    or.push({ recipientOrgId: user.organizationId, recipientRole: null });
  }
  return prisma.notification.count({ where: { AND: [{ OR: or }, { readAt: null }] } });
}

async function buildRequestView(requestId: string, user: SessionUser, orgNameById: Map<string, string>, tree: string[] | null): Promise<AssetRequestView> {
  const request = await prisma.assetRequest.findUniqueOrThrow({ where: { id: requestId } });
  const [steps, allocation, vehicle] = await Promise.all([
    prisma.approvalStep.findMany({ where: { requestId }, orderBy: { stepOrder: 'asc' } }),
    prisma.allocation.findUnique({ where: { requestId } }),
    request.vehicleId ? prisma.vehicle.findUnique({ where: { id: request.vehicleId }, select: { organizationId: true, displayName: true, registrationNumber: true } }) : Promise.resolve(null)
  ]);
  // `tree` is hoisted from the caller — orgTree() inside this loop re-scanned the
  // whole organization table per request and dominated the snapshot latency.
  const isOwnVehicle = vehicle ? tree === null || tree.includes(vehicle.organizationId) : false;
  const vehicleLabel = vehicle ? (isOwnVehicle ? `${vehicle.displayName} ${vehicle.registrationNumber}`.trim() : maskRegistration(vehicle.registrationNumber)) : null;
  const vehicleOrgName = vehicle ? orgNameById.get(vehicle.organizationId) ?? null : null;
  return mapRequest(request, {
    requestingOrgName: orgNameById.get(request.requestingOrgId) ?? 'Unknown',
    vehicleOrgName,
    vehicleLabel,
    steps: steps.map((s) => mapApprovalStep(s, orgNameById.get(s.approverOrgId) ?? 'Unknown')),
    allocationId: allocation?.id ?? null
  });
}

async function buildAllocationView(allocationId: string, user: SessionUser, tree: string[] | null, settings: FleetSettings): Promise<AllocationView> {
  const allocation = await prisma.allocation.findUniqueOrThrow({ where: { id: allocationId } });
  const [vehicle, handover, returnRec, extensions] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id: allocation.vehicleId }, select: { organizationId: true, displayName: true, registrationNumber: true } }),
    prisma.handoverRecord.findUnique({ where: { allocationId } }),
    prisma.returnRecord.findUnique({ where: { allocationId } }),
    prisma.extensionRequest.findMany({ where: { allocationId }, orderBy: { createdAt: 'asc' } })
  ]);
  const isOwn = vehicle ? tree === null || tree.includes(vehicle.organizationId) : false;
  const label = vehicle ? (isOwn ? `${vehicle.displayName} ${vehicle.registrationNumber}`.trim() : maskRegistration(vehicle.registrationNumber)) : '';
  return mapAllocation(allocation, {
    vehicleLabel: label,
    handover: handover ? mapHandover(handover) : null,
    returnRecord: returnRec ? mapReturn(returnRec) : null,
    extensions: extensions.map(mapExtension),
    graceMinutes: settings.returnGraceMinutes
  });
}

export async function getVehicleDetail(user: SessionUser, id: string): Promise<VehicleDetail | null> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) return null;
  const settings = await getSettings();
  const tree = await orgTree(user);
  const isOwn = tree === null || tree.includes(vehicle.organizationId);

  // Cross-org: only discoverable vehicles are visible at all; else 404 (return null).
  const discoverable = vehicle.ownershipCategory === 'GOVERNMENT_FLEET' && vehicle.eligibilityState === 'ELIGIBLE' && vehicle.operationalStatus === 'ACTIVE';
  if (!isOwn && !discoverable) return null;

  const org = await prisma.organization.findUnique({ where: { id: vehicle.organizationId }, select: { name: true } });
  const eligibility = await evaluateEligibility(id, prisma, settings);
  const availability = await computeAvailability(id, null, null, prisma, settings);

  if (!isOwn) {
    // Masked card for foreign callers: omit sensitive sections.
    const card: VehicleCardView = {
      id: vehicle.id,
      assetCode: vehicle.assetCode,
      registrationMasked: maskRegistration(vehicle.registrationNumber),
      displayName: vehicle.displayName,
      vehicleClass: vehicle.vehicleClass as VehicleCardView['vehicleClass'],
      vehicleType: vehicle.vehicleType,
      makeModel: vehicle.makeModel,
      seating: vehicle.seating,
      fuelType: vehicle.fuelType,
      organizationId: vehicle.organizationId,
      organizationName: org?.name ?? 'Unknown',
      stationName: null,
      operationalStatus: vehicle.operationalStatus as VehicleCardView['operationalStatus'],
      eligibilityState: vehicle.eligibilityState as VehicleCardView['eligibilityState'],
      availability,
      telemetryFreshness: freshnessFor(vehicle.lastSeenAt, settings.telemetryFreshMinutes),
      lastSeenAt: vehicle.lastSeenAt ? vehicle.lastSeenAt.toISOString() : null,
      nextMaintenanceDue: null,
      isOwn: false,
      photoUrl: vehicle.photoPath
    };
    return {
      vehicle: card,
      masked: true,
      eligibility,
      availability,
      ownership: [],
      restrictions: [],
      documents: [],
      trips: [],
      maintenance: [],
      legal: [],
      incidents: [],
      fuelLogs: [],
      devices: [],
      allocations: [],
      audit: []
    };
  }

  const [ownership, restrictions, documents, trips, maintenance, legal, incidents, fuelLogs, devices, allocRows, audit] = await Promise.all([
    prisma.vehicleOwnershipVerification.findMany({ where: { vehicleId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.vehicleRestriction.findMany({ where: { vehicleId: id }, orderBy: { decidedAt: 'desc' } }),
    prisma.vehicleDocument.findMany({ where: { vehicleId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.trip.findMany({ where: { vehicleId: id }, orderBy: { startedAt: 'desc' }, take: 100 }),
    prisma.maintenanceRecord.findMany({ where: { vehicleId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.legalRecord.findMany({ where: { vehicleId: id }, orderBy: { date: 'desc' }, take: 100 }),
    prisma.incidentReport.findMany({ where: { vehicleId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.fuelLog.findMany({ where: { vehicleId: id }, orderBy: { loggedAt: 'desc' }, take: 100 }),
    prisma.iotDevice.findMany({ where: { vehicleId: id }, orderBy: { updatedAt: 'desc' } }),
    prisma.allocation.findMany({ where: { vehicleId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.auditLog.findMany({ where: { entityType: 'Vehicle', entityId: id }, orderBy: { seq: 'desc' }, take: 100 })
  ]);

  const allocations = await Promise.all(allocRows.map((a) => buildAllocationView(a.id, user, tree, settings)));

  return {
    vehicle: mapVehicle(vehicle, org?.name ?? 'Unknown', settings.telemetryFreshMinutes),
    masked: false,
    eligibility,
    availability,
    ownership: ownership.map(mapOwnership),
    restrictions: restrictions.map((r) => mapRestriction(r)),
    documents: documents.map(mapDocument),
    trips: trips.map(mapTrip),
    maintenance: maintenance.map(mapMaintenance),
    legal: legal.map(mapLegal),
    incidents: incidents.map(mapIncident),
    fuelLogs: fuelLogs.map((f) => ({ id: f.id, vehicleId: f.vehicleId, liters: f.liters, costInr: f.costInr, odometerKm: f.odometerKm, source: f.source as 'MANUAL' | 'SENSOR', loggedBy: f.loggedBy, loggedAt: f.loggedAt.toISOString() })),
    devices: devices.map(mapDevice),
    allocations,
    audit: audit.map(mapAudit)
  };
}

/** Live position deltas for non-simulated vehicles within the caller's scope, seen in the last 15 min. */
export async function getLiveDeltas(user: SessionUser): Promise<LiveDelta[]> {
  const since = new Date(Date.now() - 15 * 60_000);
  const tree = await orgTree(user);
  const vehicles = await prisma.vehicle.findMany({
    where: {
      AND: [
        tree === null ? {} : { organizationId: { in: tree } },
        { gpsSource: { not: 'SIMULATED' }, lastSeenAt: { gte: since }, lat: { not: null }, lng: { not: null } }
      ]
    },
    select: { id: true, lat: true, lng: true, speedKmph: true, heading: true, ignition: true, status: true, fuelPercent: true, lastSeenAt: true }
  });
  return vehicles
    .filter((v) => v.lat !== null && v.lng !== null && v.lastSeenAt !== null)
    .map((v) => ({
      vehicleId: v.id,
      lat: v.lat as number,
      lng: v.lng as number,
      speedKmph: v.speedKmph,
      heading: v.heading,
      ignition: v.ignition,
      status: v.status as VehicleStatus,
      fuelPercent: v.fuelPercent,
      lastSeenAt: (v.lastSeenAt as Date).toISOString(),
      simulated: false
    }));
}
