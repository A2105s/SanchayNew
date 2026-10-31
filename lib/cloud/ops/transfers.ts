import 'server-only';

import { Prisma, type TransferRequest } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser, TransferView, StationView, VehicleClass } from '@/types';
import { writeAudit } from '@/lib/cloud/audit';
import { recordCloudEvent } from '@/lib/cloud/backend-events';
import { CLOUD_CACHE_TAGS, invalidateCloudData } from '@/lib/cloud/cached-queries';
import { DomainError } from '@/lib/cloud/errors';
import { mapTransfer, mapStation, VEHICLE_CLASS_TO_INVENTORY_FIELD } from '@/lib/cloud/mappers';
import { nextTransferCode } from '@/lib/cloud/codes';

type TxClient = Prisma.TransactionClient | typeof prisma;

function invalidate() {
  invalidateCloudData(CLOUD_CACHE_TAGS.ops, CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.all);
}

const CLASS_KEYS: VehicleClass[] = ['PATROL_CAR', 'MOTORCYCLE', 'VAN', 'HEAVY'];

function countsFromInput(counts: Partial<Record<VehicleClass, number>>): Record<VehicleClass, number> {
  return { PATROL_CAR: counts.PATROL_CAR ?? 0, MOTORCYCLE: counts.MOTORCYCLE ?? 0, VAN: counts.VAN ?? 0, HEAVY: counts.HEAVY ?? 0 };
}

function countsFromRow(row: TransferRequest): Record<VehicleClass, number> {
  return { PATROL_CAR: row.patrolCar, MOTORCYCLE: row.motorcycle, VAN: row.van, HEAVY: row.heavy };
}

// ---------------------------------------------------------------------------
// Station inventory recompute (ELIGIBLE government-fleet vehicles only)
// ---------------------------------------------------------------------------

/**
 * Recomputes a station's allocatable pool counts from the Vehicle table. Only vehicles that
 * are GOVERNMENT_FLEET, ELIGIBLE, operationally ACTIVE and assigned to the station count.
 * Used by the seed and by every eligibility-affecting mutation (register/restrict/verify/
 * maintenance/operational status/station move).
 */
export async function recomputeStationInventory(tx: TxClient, stationId: string): Promise<void> {
  const vehicles = await tx.vehicle.findMany({
    where: {
      stationId,
      ownershipCategory: 'GOVERNMENT_FLEET',
      eligibilityState: 'ELIGIBLE',
      operationalStatus: 'ACTIVE'
    },
    select: { vehicleClass: true }
  });
  const tally = { patrolCar: 0, motorcycle: 0, van: 0, heavy: 0 };
  for (const v of vehicles) {
    tally[VEHICLE_CLASS_TO_INVENTORY_FIELD[v.vehicleClass as VehicleClass]] += 1;
  }
  await tx.stationInventory.upsert({
    where: { stationId },
    update: tally,
    create: { stationId, ...tally }
  });
}

/** Convenience wrapper that no-ops for a null station. */
export async function recomputeStationInventoryForVehicle(tx: TxClient, stationId: string | null): Promise<void> {
  if (!stationId) return;
  await recomputeStationInventory(tx, stationId);
}

// ---------------------------------------------------------------------------
// Scope / review authority
// ---------------------------------------------------------------------------

async function stationOrgId(tx: TxClient, stationId: string): Promise<string | null> {
  const station = await tx.station.findUnique({ where: { id: stationId }, select: { organizationId: true } });
  return station?.organizationId ?? null;
}

/** Only source station officer (or platform admin) may grant station clearance. */
function assertCanGrantClearance(user: SessionUser, transfer: TransferRequest): void {
  if (user.role === 'STATION_OFFICER') {
    if (user.stationId !== transfer.sourceStationId) {
      throw new DomainError('Only the lending station officer can grant station clearance.', 403);
    }
    return;
  }
  if (user.role === 'ADMIN') return;
  throw new DomainError('Only the lending station officer can grant station clearance.', 403);
}

/** Only SP Fleet Desk (GWL-POLICE Org Admin) or Platform Admin (DM Admin) can issue District Movement Sanction. */
async function assertCanGrantSanction(tx: TxClient, user: SessionUser, transfer: TransferRequest): Promise<void> {
  if (user.role === 'ADMIN') return;
  if (user.role === 'ORG_ADMIN') {
    const orgId = await stationOrgId(tx, transfer.sourceStationId);
    if (!orgId || !user.organizationId || orgId === user.organizationId) return;
    throw new DomainError('Only the organization admin of the lending station may sanction this transfer.', 403);
  }
  throw new DomainError('Only SP Fleet Desk / Admin can issue the District Movement Sanction.', 403);
}

/** Only source-station officer (own station), or ORG_ADMIN/DEPT_OFFICER of the source org, may review. */
async function assertCanReviewSource(tx: TxClient, user: SessionUser, transfer: TransferRequest): Promise<void> {
  if (user.role === 'STATION_OFFICER') {
    if (user.stationId !== transfer.sourceStationId) {
      throw new DomainError('Only the source station officer may review this transfer.', 403);
    }
    return;
  }
  if (user.role === 'ADMIN') return;
  if (user.role === 'ORG_ADMIN' || user.role === 'DEPT_OFFICER') {
    const orgId = await stationOrgId(tx, transfer.sourceStationId);
    if (!orgId || !user.organizationId || orgId === user.organizationId) return;
    throw new DomainError('Only the source organization may review this transfer.', 403);
  }
  throw new DomainError('You do not have permission to review transfers.', 403);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createTransfer(user: SessionUser, input: { sourceStationId: string; destinationStationId: string; startAt: string; endAt: string; counts: Partial<Record<VehicleClass, number>>; purpose: string; comments?: string }, correlationId: string): Promise<TransferView> {
  if (input.sourceStationId === input.destinationStationId) {
    throw new DomainError('Source and destination stations must be different.', 400);
  }
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (endAt <= startAt) throw new DomainError('End time must be after start time.', 400);

  const counts = countsFromInput(input.counts);
  const total = CLASS_KEYS.reduce((sum, key) => sum + counts[key], 0);
  if (total <= 0) throw new DomainError('At least one vehicle must be requested.', 400);

  const [source, destination] = await Promise.all([
    prisma.station.findUnique({ where: { id: input.sourceStationId }, include: { inventory: true } }),
    prisma.station.findUnique({ where: { id: input.destinationStationId } })
  ]);
  if (!source) throw new DomainError('Source station not found.', 404);
  if (!destination) throw new DomainError('Destination station not found.', 404);

  for (const key of CLASS_KEYS) {
    const field = VEHICLE_CLASS_TO_INVENTORY_FIELD[key];
    const available = source.inventory?.[field] ?? 0;
    if (counts[key] > available) throw new DomainError(`Source station has only ${available} ${key} available (requested ${counts[key]}).`, 409);
  }

  const transfer = await prisma.$transaction(async (tx) => {
    const transferCode = await nextTransferCode(tx);
    const created = await tx.transferRequest.create({
      data: {
        transferCode,
        requesterStationId: user.stationId ?? input.destinationStationId,
        sourceStationId: input.sourceStationId,
        destinationStationId: input.destinationStationId,
        requestedBy: user.username,
        startAt,
        endAt,
        patrolCar: counts.PATROL_CAR,
        motorcycle: counts.MOTORCYCLE,
        van: counts.VAN,
        heavy: counts.HEAVY,
        purpose: input.purpose,
        comments: input.comments ?? null,
        status: 'PENDING_LENDER_REVIEW'
      }
    });
    await writeAudit(tx, { entityType: 'Transfer', entityId: created.id, action: 'TransferCreated', newValue: created.transferCode, performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId, reason: input.purpose });
    return created;
  });

  await recordCloudEvent({ level: 'info', category: 'ops', action: 'create-transfer', status: 'succeeded', message: 'Transfer requested.', details: { transferId: transfer.id } });
  invalidate();
  return mapTransfer(transfer);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface TransferActionResult {
  transfer: TransferView;
  stations?: StationView[];
}

const ALLOWED_FROM: Record<string, string[]> = {
  approve: ['PENDING', 'PENDING_LENDER_REVIEW', 'PENDING_DISTRICT_SANCTION', 'ALLOCATED', 'ACTIVE'],
  grant_clearance: ['PENDING', 'PENDING_LENDER_REVIEW'],
  grant_sanction: ['PENDING_DISTRICT_SANCTION'],
  handover: ['ALLOCATED'],
  reject: ['PENDING', 'PENDING_LENDER_REVIEW', 'PENDING_DISTRICT_SANCTION'],
  complete: ['ACTIVE', 'ALLOCATED'],
  cancel: ['PENDING', 'PENDING_LENDER_REVIEW', 'PENDING_DISTRICT_SANCTION', 'ALLOCATED']
};

export async function applyTransferAction(
  user: SessionUser,
  id: string,
  action: {
    type: 'approve' | 'grant_clearance' | 'grant_sanction' | 'handover' | 'reject' | 'complete' | 'cancel';
    reason?: string;
  },
  correlationId: string
): Promise<TransferActionResult> {
  const transfer = await prisma.transferRequest.findUnique({ where: { id } });
  if (!transfer) throw new DomainError('Transfer not found.', 404);
  const allowedFrom = ALLOWED_FROM[action.type];
  if (allowedFrom && !allowedFrom.includes(transfer.status)) {
    throw new DomainError(`Cannot ${action.type} a transfer in status ${transfer.status}.`, 409);
  }
  switch (action.type) {
    case 'grant_clearance':
      return grantClearance(user, transfer, correlationId);
    case 'grant_sanction':
      return grantSanction(user, transfer, correlationId);
    case 'handover':
      return handoverTransfer(user, transfer, correlationId);
    case 'approve':
      if (transfer.status === 'PENDING_LENDER_REVIEW' || transfer.status === 'PENDING') {
        return grantClearance(user, transfer, correlationId);
      }
      if (transfer.status === 'PENDING_DISTRICT_SANCTION') {
        return grantSanction(user, transfer, correlationId);
      }
      if (transfer.status === 'ALLOCATED') {
        return handoverTransfer(user, transfer, correlationId);
      }
      if (transfer.status === 'ACTIVE') {
        return completeTransfer(user, transfer, correlationId);
      }
      throw new DomainError(`Cannot approve transfer in status ${transfer.status}.`, 409);
    case 'reject':
      return rejectTransfer(user, transfer, action.reason ?? 'Rejected', correlationId);
    case 'complete':
      return completeTransfer(user, transfer, correlationId);
    case 'cancel':
      return cancelTransfer(user, transfer, correlationId);
    default:
      throw new DomainError('Unsupported transfer action.', 400);
  }
}

async function loadStations(tx: Prisma.TransactionClient, ids: string[]) {
  return tx.station.findMany({ where: { id: { in: ids } }, include: { inventory: true } });
}

async function grantClearance(user: SessionUser, transfer: TransferRequest, correlationId: string): Promise<TransferActionResult> {
  assertCanGrantClearance(user, transfer);
  const counts = countsFromRow(transfer);

  const { updated, stations } = await prisma.$transaction(async (tx) => {
    await recomputeStationInventory(tx, transfer.sourceStationId);
    const rows = await tx.$queryRaw<Array<{ patrolCar: number; motorcycle: number; van: number; heavy: number }>>(
      Prisma.sql`SELECT "patrolCar", "motorcycle", "van", "heavy" FROM "StationInventory" WHERE "stationId" = ${transfer.sourceStationId} FOR UPDATE`
    );
    const source = rows[0];
    if (!source) throw new DomainError('Source station inventory is unavailable.', 409);
    for (const key of CLASS_KEYS) {
      const field = VEHICLE_CLASS_TO_INVENTORY_FIELD[key];
      if (counts[key] > source[field]) throw new DomainError(`Source station no longer has enough ${key} (needs ${counts[key]}, has ${source[field]}).`, 409);
    }
    const result = await tx.transferRequest.update({
      where: { id: transfer.id },
      data: { status: 'PENDING_DISTRICT_SANCTION', reviewedBy: user.username, reviewedAt: new Date() }
    });
    await writeAudit(tx, {
      entityType: 'Transfer',
      entityId: transfer.id,
      action: 'TransferClearanceGranted',
      fieldName: 'status',
      oldValue: transfer.status,
      newValue: 'PENDING_DISTRICT_SANCTION',
      performedBy: user.username,
      performedByRole: user.role,
      organizationId: user.organizationId,
      correlationId
    });
    const stationRows = await loadStations(tx, [transfer.sourceStationId, transfer.destinationStationId]);
    return { updated: result, stations: stationRows };
  });

  await recordCloudEvent({ level: 'info', category: 'ops', action: 'transfer-clearance-granted', status: 'succeeded', message: 'Station clearance granted.', details: { transferId: transfer.id } });
  invalidate();
  return { transfer: mapTransfer(updated), stations: stations.map(mapStation) };
}

async function grantSanction(user: SessionUser, transfer: TransferRequest, correlationId: string): Promise<TransferActionResult> {
  const counts = countsFromRow(transfer);

  const { updated, stations } = await prisma.$transaction(async (tx) => {
    await assertCanGrantSanction(tx, user, transfer);
    await recomputeStationInventory(tx, transfer.sourceStationId);
    const rows = await tx.$queryRaw<Array<{ patrolCar: number; motorcycle: number; van: number; heavy: number }>>(
      Prisma.sql`SELECT "patrolCar", "motorcycle", "van", "heavy" FROM "StationInventory" WHERE "stationId" = ${transfer.sourceStationId} FOR UPDATE`
    );
    const source = rows[0];
    if (!source) throw new DomainError('Source station inventory is unavailable.', 409);
    for (const key of CLASS_KEYS) {
      const field = VEHICLE_CLASS_TO_INVENTORY_FIELD[key];
      if (counts[key] > source[field]) throw new DomainError(`Source station no longer has enough ${key} (needs ${counts[key]}, has ${source[field]}).`, 409);
    }
    const result = await tx.transferRequest.update({
      where: { id: transfer.id },
      data: { status: 'ALLOCATED', reviewedBy: user.username, reviewedAt: new Date() }
    });
    await writeAudit(tx, {
      entityType: 'Transfer',
      entityId: transfer.id,
      action: 'TransferSanctionGranted',
      fieldName: 'status',
      oldValue: transfer.status,
      newValue: 'ALLOCATED',
      performedBy: user.username,
      performedByRole: user.role,
      organizationId: user.organizationId,
      correlationId
    });
    const stationRows = await loadStations(tx, [transfer.sourceStationId, transfer.destinationStationId]);
    return { updated: result, stations: stationRows };
  });

  await recordCloudEvent({ level: 'info', category: 'ops', action: 'transfer-sanction-granted', status: 'succeeded', message: 'District movement sanction issued.', details: { transferId: transfer.id } });
  invalidate();
  return { transfer: mapTransfer(updated), stations: stations.map(mapStation) };
}

async function handoverTransfer(user: SessionUser, transfer: TransferRequest, correlationId: string): Promise<TransferActionResult> {
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.transferRequest.update({
      where: { id: transfer.id },
      data: { status: 'ACTIVE' }
    });
    await writeAudit(tx, {
      entityType: 'Transfer',
      entityId: transfer.id,
      action: 'TransferHandover',
      fieldName: 'status',
      oldValue: transfer.status,
      newValue: 'ACTIVE',
      performedBy: user.username,
      performedByRole: user.role,
      organizationId: user.organizationId,
      correlationId
    });
    return result;
  });
  await recordCloudEvent({ level: 'info', category: 'ops', action: 'transfer-handover', status: 'succeeded', message: 'Transfer marked active (handed over).', details: { transferId: transfer.id } });
  invalidate();
  return { transfer: mapTransfer(updated) };
}

async function completeTransfer(user: SessionUser, transfer: TransferRequest, correlationId: string): Promise<TransferActionResult> {
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.transferRequest.update({
      where: { id: transfer.id },
      data: { status: 'COMPLETED', completedBy: user.username, completedAt: new Date() }
    });
    await writeAudit(tx, {
      entityType: 'Transfer',
      entityId: transfer.id,
      action: 'TransferCompleted',
      fieldName: 'status',
      oldValue: transfer.status,
      newValue: 'COMPLETED',
      performedBy: user.username,
      performedByRole: user.role,
      organizationId: user.organizationId,
      correlationId
    });
    // Inbound return inspection completed -> restores inventory to lending station
    await recomputeStationInventory(tx, transfer.sourceStationId);
    await recomputeStationInventory(tx, transfer.destinationStationId);
    return result;
  });
  await recordCloudEvent({ level: 'info', category: 'ops', action: 'transfer-complete', status: 'succeeded', message: 'Transfer completed.', details: { transferId: transfer.id } });
  invalidate();
  return { transfer: mapTransfer(updated) };
}

async function rejectTransfer(user: SessionUser, transfer: TransferRequest, reason: string, correlationId: string): Promise<TransferActionResult> {
  let targetStatus = 'REJECTED';
  if (transfer.status === 'PENDING_LENDER_REVIEW' || transfer.status === 'PENDING') {
    assertCanGrantClearance(user, transfer);
    targetStatus = 'REJECTED_BY_LENDER';
  } else if (transfer.status === 'PENDING_DISTRICT_SANCTION') {
    await assertCanGrantSanction(prisma, user, transfer);
    targetStatus = 'REJECTED_BY_ADMIN';
  } else {
    await assertCanReviewSource(prisma, user, transfer);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.transferRequest.update({
      where: { id: transfer.id },
      data: { status: targetStatus, reviewedBy: user.username, reviewedAt: new Date(), rejectionReason: reason }
    });
    await writeAudit(tx, {
      entityType: 'Transfer',
      entityId: transfer.id,
      action: 'TransferRejected',
      fieldName: 'status',
      oldValue: transfer.status,
      newValue: targetStatus,
      performedBy: user.username,
      performedByRole: user.role,
      organizationId: user.organizationId,
      correlationId,
      reason
    });
    return result;
  });
  await recordCloudEvent({ level: 'info', category: 'ops', action: 'transfer-reject', status: 'succeeded', message: `Transfer rejected (${targetStatus}).`, details: { transferId: transfer.id } });
  invalidate();
  return { transfer: mapTransfer(updated) };
}

async function cancelTransfer(user: SessionUser, transfer: TransferRequest, correlationId: string): Promise<TransferActionResult> {
  if (transfer.requestedBy !== user.username) await assertCanReviewSource(prisma, user, transfer);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.transferRequest.update({ where: { id: transfer.id }, data: { status: 'CANCELLED', reviewedBy: user.username, reviewedAt: new Date() } });
    await writeAudit(tx, { entityType: 'Transfer', entityId: transfer.id, action: 'TransferCancelled', fieldName: 'status', oldValue: transfer.status, newValue: 'CANCELLED', performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId });
    return result;
  });
  await recordCloudEvent({ level: 'info', category: 'ops', action: 'transfer-cancel', status: 'succeeded', message: 'Transfer cancelled.', details: { transferId: transfer.id } });
  invalidate();
  return { transfer: mapTransfer(updated) };
}
