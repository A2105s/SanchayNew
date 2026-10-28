import 'server-only';

import { Prisma, type Space, type SpaceMaintenance } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser, SpaceView } from '@/types';
import type { SpaceSearchParsed, SpaceInputParsed, SpaceActionParsed } from '@/lib/validation/schemas';
import { writeAudit } from '@/lib/cloud/audit';
import { DomainError } from '@/lib/cloud/errors';
import { CLOUD_CACHE_TAGS, invalidateCloudData } from '@/lib/cloud/cached-queries';
import { mapSpace, mapSpaceBooking, mapSpaceMaintenance } from '@/lib/cloud/mappers';
import { nextSpaceCode } from '@/lib/cloud/codes';
import { orgTree } from '@/lib/auth/scope';

type TxClient = Prisma.TransactionClient;

function invalidate() {
  invalidateCloudData(CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.ops, CLOUD_CACHE_TAGS.all);
}

async function loadSpace(id: string): Promise<Space> {
  const space = await prisma.space.findUnique({ where: { id } });
  if (!space) throw new DomainError('Space not found.', 404);
  return space;
}

/** Own-org guard for record mutation (ADMIN platform admins cannot mutate space records). */
function assertOwnOrg(user: SessionUser, organizationId: string): void {
  if (!user.organizationId || user.organizationId !== organizationId) {
    throw new DomainError('This space belongs to another organization.', 403);
  }
}

export async function registerSpace(user: SessionUser, input: SpaceInputParsed, correlationId: string): Promise<SpaceView> {
  if (!user.organizationId) throw new DomainError('Your account is not attached to an organization.', 403);
  const space = await prisma.$transaction(async (tx) => {
    const row = await tx.space.create({
      data: {
        assetCode: await nextSpaceCode(tx),
        name: input.name,
        category: input.category,
        organizationId: user.organizationId as string,
        buildingOrCampus: input.buildingOrCampus ?? null,
        addressLine: input.addressLine ?? null,
        district: input.district ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        capacity: input.capacity,
        areaSqft: input.areaSqft ?? null,
        operationalState: input.operationalState ?? 'IDLE',
        description: input.description ?? null,
        managerName: input.managerName ?? null,
        contactOfficerName: input.contactOfficerName ?? null,
        contactPhone: input.contactPhone ?? null,
        amenities: input.amenities ?? [],
        accessibility: input.accessibility ?? [],
        operatingHours: input.operatingHours ?? {},
        minBookingHours: input.minBookingHours ?? 1,
        maxBookingHours: input.maxBookingHours ?? 8,
        bookingLeadDays: input.bookingLeadDays ?? 7,
        notes: input.notes ?? null,
        createdBy: user.username
      }
    });
    await writeAudit(tx, { entityType: 'Space', entityId: row.id, action: 'SpaceRegistered', newValue: row.assetCode, performedBy: user.username, performedByRole: user.role, organizationId: row.organizationId, correlationId });
    return row;
  }, { timeout: 15000, maxWait: 5000 });
  invalidate();
  return mapSpace(space);
}

async function lastBookingEndFor(spaceId: string, tx: TxClient | typeof prisma = prisma): Promise<Date | null> {
  const last = await tx.spaceBooking.findFirst({
    where: { spaceId, status: { in: ['CONFIRMED', 'COMPLETED'] }, endAt: { lte: new Date() } },
    orderBy: { endAt: 'desc' },
    select: { endAt: true }
  });
  return last?.endAt ?? null;
}

async function busyNowFor(spaceId: string, tx: TxClient | typeof prisma = prisma): Promise<boolean> {
  const now = new Date();
  const live = await tx.spaceBooking.findFirst({
    where: { spaceId, status: { in: ['PENDING', 'CONFIRMED'] }, startAt: { lte: now }, endAt: { gt: now } },
    select: { id: true }
  });
  return live != null;
}

async function blockedByMaintenanceFor(spaceId: string, tx: TxClient | typeof prisma = prisma): Promise<boolean> {
  const blocking = await tx.spaceMaintenance.findFirst({
    where: { spaceId, status: { in: ['OPEN', 'IN_PROGRESS'] }, blocksBooking: true },
    select: { id: true }
  });
  return blocking != null;
}

export async function searchSpaces(user: SessionUser, filters: SpaceSearchParsed): Promise<{ spaces: SpaceView[]; total: number }> {
  const tree = await orgTree(user);
  const and: Prisma.SpaceWhereInput[] = [];
  if (tree !== null) and.push({ organizationId: { in: tree } });
  if (filters.q) {
    const q = filters.q;
    and.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { assetCode: { contains: q, mode: 'insensitive' } },
        { addressLine: { contains: q, mode: 'insensitive' } },
        { buildingOrCampus: { contains: q, mode: 'insensitive' } },
        { district: { contains: q, mode: 'insensitive' } }
      ]
    });
  }
  if (filters.category) and.push({ category: filters.category });
  if (filters.state) and.push({ operationalState: filters.state });
  if (filters.minCapacity) and.push({ capacity: { gte: filters.minCapacity } });

  const where: Prisma.SpaceWhereInput = and.length ? { AND: and } : {};
  const [rows, total] = await Promise.all([
    prisma.space.findMany({ where, include: { organization: { select: { name: true } } }, orderBy: [{ operationalState: 'asc' }, { name: 'asc' }], take: 300 }),
    prisma.space.count({ where })
  ]);

  const now = new Date();
  const spaces = rows.map((r) => mapSpace(r, now));

  // Derived availability flags (batched)
  const ids = spaces.map((s) => s.id);
  const [liveBookings, blocking] = await Promise.all([
    prisma.spaceBooking.findMany({
      where: { spaceId: { in: ids }, status: { in: ['PENDING', 'CONFIRMED'] } },
      select: { spaceId: true, startAt: true, endAt: true, status: true }
    }),
    prisma.spaceMaintenance.findMany({
      where: { spaceId: { in: ids }, status: { in: ['OPEN', 'IN_PROGRESS'] }, blocksBooking: true },
      select: { spaceId: true }
    })
  ]);
  const blockedSet = new Set(blocking.map((b) => b.spaceId));
  const rangeFrom = filters.from ? new Date(filters.from) : null;
  const rangeTo = filters.to ? new Date(filters.to) : null;
  const included = new Set<string>();
  for (const s of spaces) {
    s.busyNow = liveBookings.some((b) => b.spaceId === s.id && b.startAt <= now && b.endAt > now);
    s.blockedByMaintenance = blockedSet.has(s.id);
    const notBookable = s.operationalState === 'RESTRICTED' || s.operationalState === 'RETIRED' || s.blockedByMaintenance;
    if (rangeFrom && rangeTo) {
      const overlap = liveBookings.some((b) => b.spaceId === s.id && b.startAt < rangeTo && b.endAt > rangeFrom);
      if (overlap || notBookable) continue;
    }
    if (filters.availableOnly && (s.busyNow || notBookable)) continue;
    included.add(s.id);
  }

  const resultSpaces = spaces
    .filter((s) => included.has(s.id))
    .map((s) => ({ ...s, idleDays: s.busyNow || s.operationalState === 'RESTRICTED' || s.operationalState === 'RETIRED' ? null : s.idleDays }));
  return { spaces: resultSpaces, total };
}

export interface SpaceDetail {
  space: SpaceView;
  bookings: ReturnType<typeof mapSpaceBooking>[];
  maintenance: ReturnType<typeof mapSpaceMaintenance>[];
  openMaintenanceCount: number;
}

export async function getSpaceDetail(user: SessionUser, id: string): Promise<SpaceDetail> {
  const space = await loadSpace(id);
  const tree = await orgTree(user);
  if (tree !== null && !tree.includes(space.organizationId)) throw new DomainError('This space belongs to another organization.', 403);

  const [org, bookings, maintenance, lastEnd, busyNow, blocked] = await Promise.all([
    prisma.organization.findUnique({ where: { id: space.organizationId }, select: { name: true } }),
    prisma.spaceBooking.findMany({ where: { spaceId: id }, orderBy: { startAt: 'desc' }, take: 50, include: { space: { select: { name: true, assetCode: true } } } }),
    prisma.spaceMaintenance.findMany({ where: { spaceId: id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    lastBookingEndFor(id),
    busyNowFor(id),
    blockedByMaintenanceFor(id)
  ]);
  const view = mapSpace({ ...space, organization: org ?? null }, new Date(), lastEnd);
  view.busyNow = busyNow;
  view.blockedByMaintenance = blocked;
  return {
    space: view,
    bookings: bookings.map(mapSpaceBooking),
    maintenance: maintenance.map(mapSpaceMaintenance),
    openMaintenanceCount: maintenance.filter((m) => m.status !== 'RESOLVED').length
  };
}

export async function applySpaceAction(user: SessionUser, id: string, action: SpaceActionParsed, correlationId: string): Promise<{ space: SpaceView; ticket?: SpaceMaintenance }> {
  const current = await loadSpace(id);
  assertOwnOrg(user, current.organizationId);

  if (action.type === 'update') {
    const space = await prisma.$transaction(async (tx) => {
      const row = await tx.space.update({ where: { id }, data: {
        name: action.patch.name ?? undefined,
        category: action.patch.category ?? undefined,
        buildingOrCampus: action.patch.buildingOrCampus ?? undefined,
        addressLine: action.patch.addressLine ?? undefined,
        district: action.patch.district ?? undefined,
        lat: action.patch.lat ?? undefined,
        lng: action.patch.lng ?? undefined,
        capacity: action.patch.capacity ?? undefined,
        areaSqft: action.patch.areaSqft ?? undefined,
        description: action.patch.description ?? undefined,
        managerName: action.patch.managerName ?? undefined,
        contactOfficerName: action.patch.contactOfficerName ?? undefined,
        contactPhone: action.patch.contactPhone ?? undefined,
        amenities: action.patch.amenities ?? undefined,
        accessibility: action.patch.accessibility ?? undefined,
        operatingHours: action.patch.operatingHours ?? undefined,
        minBookingHours: action.patch.minBookingHours ?? undefined,
        maxBookingHours: action.patch.maxBookingHours ?? undefined,
        bookingLeadDays: action.patch.bookingLeadDays ?? undefined,
        notes: action.patch.notes ?? undefined
      } });
      await writeAudit(tx, { entityType: 'Space', entityId: id, action: 'SpaceUpdated', performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId });
      return row;
    }, { timeout: 15000, maxWait: 5000 });
    invalidate();
    return { space: mapSpace(space) };
  }

  if (action.type === 'setState') {
    const space = await prisma.$transaction(async (tx) => {
      const row = await tx.space.update({ where: { id }, data: { operationalState: action.state } });
      await writeAudit(tx, { entityType: 'Space', entityId: id, action: 'SpaceStateChanged', fieldName: 'operationalState', oldValue: current.operationalState, newValue: action.state, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason: action.reason });
      return row;
    });
    invalidate();
    return { space: mapSpace(space) };
  }

  if (action.type === 'raiseMaintenance') {
    const blocks = action.blocksBooking ?? action.severity === 'CRITICAL';
    const ticket = await prisma.$transaction(async (tx) => {
      const row = await tx.spaceMaintenance.create({ data: {
        spaceId: id,
        title: action.title,
        description: action.description ?? null,
        severity: action.severity,
        blocksBooking: blocks,
        reportedBy: user.username
      } });
      await writeAudit(tx, { entityType: 'SpaceMaintenance', entityId: row.id, action: 'SpaceMaintenanceRaised', newValue: `${action.severity} ${action.title}`, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason: blocks ? 'Blocks booking' : undefined });
      return row;
    });
    invalidate();
    return { space: mapSpace(current), ticket };
  }

  // updateMaintenance
  const ticket = await prisma.spaceMaintenance.findUnique({ where: { id: action.ticketId } });
  if (!ticket || ticket.spaceId !== id) throw new DomainError('Maintenance ticket not found for this space.', 404);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.spaceMaintenance.update({ where: { id: ticket.id }, data: {
      status: action.status,
      resolutionNote: action.resolutionNote ?? undefined,
      costInr: action.costInr ?? undefined,
      resolvedBy: action.status === 'RESOLVED' ? user.username : undefined,
      resolvedAt: action.status === 'RESOLVED' ? new Date() : undefined
    } });
    await writeAudit(tx, { entityType: 'SpaceMaintenance', entityId: row.id, action: 'SpaceMaintenanceUpdated', fieldName: 'status', oldValue: ticket.status, newValue: action.status, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId });
    return row;
  });
  invalidate();
  return { space: mapSpace(current), ticket: updated };
}

