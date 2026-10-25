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

/** Only source-station officer (own station), or ORG_ADMIN/DEPT_OFFICER of the source org, may review. */
async function assertCanReviewSource(user: SessionUser, transfer: TransferRequest): Promise<void> {
  if (user.role === 'STATION_OFFICER') {
    if (user.stationId !== transfer.sourceStationId) {
      throw new DomainError('Only the source station officer may review this transfer.', 403);
    }
    return;
  }
  if (user.role === 'ORG_ADMIN' || user.role === 'DEPT_OFFICER') {
    const orgId = await stationOrgId(prisma, transfer.sourceStationId);
    if (orgId && user.organizationId && orgId === user.organizationId) return;
    // Allow DEPT_OFFICER/ORG_ADMIN whose org is an ancestor as well (best-effort: same org only here).
    if (orgId && user.organizationId && orgId === user.organizationId) return;
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
        status: 'PENDING'
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
  approve: ['PENDING'],
  reject: ['PENDING'],
  complete: ['ALLOCATED'],
  cancel: ['PENDING', 'ALLOCATED']
};

export async function applyTransferAction(user: SessionUser, id: string, action: { type: 'approve' | 'reject' | 'complete' | 'cancel'; reason?: string }, correlationId: string): Promise<TransferActionResult> {
  const transfer = await prisma.transferRequest.findUnique({ where: { id } });
  if (!transfer) throw new DomainError('Transfer not found.', 404);
  const allowedFrom = ALLOWED_FROM[action.type];
  if (allowedFrom && !allowedFrom.includes(transfer.status)) {
    throw new DomainError(`Cannot ${action.type} a transfer in status ${transfer.status}.`, 409);
  }
  switch (action.type) {
    case 'approve':
      return approveTransfer(user, transfer, correlationId);
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

async function approveTransfer(user: SessionUser, transfer: TransferRequest, correlationId: string): Promise<TransferActionResult> {
  await assertCanReviewSource(user, transfer);
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
    const result = await tx.transferRequest.update({ where: { id: transfer.id }, data: { status: 'ALLOCATED', reviewedBy: user.username, reviewedAt: new Date() } });
    await writeAudit(tx, { entityType: 'Transfer', entityId: transfer.id, action: 'TransferApproved', fieldName: 'status', oldValue: transfer.status, newValue: 'ALLOCATED', performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId });
    const stationRows = await loadStations(tx, [transfer.sourceStationId, transfer.destinationStationId]);
    return { updated: result, stations: stationRows };
  });

  await recordCloudEvent({ level: 'info', category: 'ops', action: 'transfer-approve', status: 'succeeded', message: 'Transfer allocated.', details: { transferId: transfer.id } });
  invalidate();
  return { transfer: mapTransfer(updated), stations: stations.map(mapStation) };
}

async function completeTransfer(user: SessionUser, transfer: TransferRequest, correlationId: string): Promise<TransferActionResult> {
  await assertCanReviewSource(user, transfer);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.transferRequest.update({ where: { id: transfer.id }, data: { status: 'COMPLETED', completedBy: user.username, completedAt: new Date() } });
    await writeAudit(tx, { entityType: 'Transfer', entityId: transfer.id, action: 'TransferCompleted', fieldName: 'status', oldValue: transfer.status, newValue: 'COMPLETED', performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId });
    return result;
  });
  await recordCloudEvent({ level: 'info', category: 'ops', action: 'transfer-complete', status: 'succeeded', message: 'Transfer completed.', details: { transferId: transfer.id } });
  invalidate();
  return { transfer: mapTransfer(updated) };
}

async function rejectTransfer(user: SessionUser, transfer: TransferRequest, reason: string, correlationId: string): Promise<TransferActionResult> {
  await assertCanReviewSource(user, transfer);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.transferRequest.update({ where: { id: transfer.id }, data: { status: 'REJECTED', reviewedBy: user.username, reviewedAt: new Date(), rejectionReason: reason } });
    await writeAudit(tx, { entityType: 'Transfer', entityId: transfer.id, action: 'TransferRejected', fieldName: 'status', oldValue: transfer.status, newValue: 'REJECTED', performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId, reason });
    return result;
  });
  await recordCloudEvent({ level: 'info', category: 'ops', action: 'transfer-reject', status: 'succeeded', message: 'Transfer rejected.', details: { transferId: transfer.id } });
  invalidate();
  return { transfer: mapTransfer(updated) };
}

async function cancelTransfer(user: SessionUser, transfer: TransferRequest, correlationId: string): Promise<TransferActionResult> {
  if (transfer.requestedBy !== user.username) await assertCanReviewSource(user, transfer);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.transferRequest.update({ where: { id: transfer.id }, data: { status: 'CANCELLED', reviewedBy: user.username, reviewedAt: new Date() } });
    await writeAudit(tx, { entityType: 'Transfer', entityId: transfer.id, action: 'TransferCancelled', fieldName: 'status', oldValue: transfer.status, newValue: 'CANCELLED', performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId });
    return result;
  });
  await recordCloudEvent({ level: 'info', category: 'ops', action: 'transfer-cancel', status: 'succeeded', message: 'Transfer cancelled.', details: { transferId: transfer.id } });
  invalidate();
  return { transfer: mapTransfer(updated) };
}
