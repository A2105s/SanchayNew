import 'server-only';

import { Prisma, type Allocation } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { AllocationLifecycle, AllocationView, SessionUser } from '@/types';
import { writeAudit } from '@/lib/cloud/audit';
import { recordCloudEvent } from '@/lib/cloud/backend-events';
import { CLOUD_CACHE_TAGS, invalidateCloudData } from '@/lib/cloud/cached-queries';
import { DomainError, DEFAULT_FLEET_SETTINGS, FLEET_SETTINGS_KEY, mergeFleetSettings } from '@/lib/cloud/errors';
import { mapAllocation, mapExtension, mapHandover, mapReturn, maskRegistration } from '@/lib/cloud/mappers';
import { notify } from '@/lib/cloud/notifications';
import { orgTree } from '@/lib/auth/scope';
import { recomputeStationInventory } from '@/lib/cloud/ops/transfers';
import type { AllocationActionParsed } from '@/lib/validation/schemas';
import type { FleetSettings } from '@/types';

type TxClient = Prisma.TransactionClient | typeof prisma;

function invalidate() {
  invalidateCloudData(CLOUD_CACHE_TAGS.ops, CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.all);
}

async function loadSettings(tx: TxClient = prisma): Promise<FleetSettings> {
  const row = await tx.appSetting.findUnique({ where: { key: FLEET_SETTINGS_KEY } });
  return row ? mergeFleetSettings(row.value) : { ...DEFAULT_FLEET_SETTINGS };
}

// ---------------------------------------------------------------------------
// Explicit allocation transition table (spec 15/16 + vehicle sharing).
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<AllocationLifecycle, AllocationLifecycle[]> = {
  RESERVED: ['AWAITING_HANDOVER', 'ACTIVE', 'CANCELLED', 'INCIDENT_HOLD'],
  AWAITING_HANDOVER: ['ACTIVE', 'CANCELLED', 'INCIDENT_HOLD'],
  ACTIVE: [
    'RETURNED_PENDING_INSPECTION',
    'COMPLETED',
    'INCIDENT_HOLD',
    'PARTIALLY_RETURNED',
    'RETURN_PENDING_CONFIRMATION',
    'RETURNED',
    'CLOSED',
    'OVERDUE'
  ],
  PARTIALLY_RETURNED: [
    'PARTIALLY_RETURNED',
    'RETURN_PENDING_CONFIRMATION',
    'RETURNED',
    'CLOSED',
    'INCIDENT_HOLD',
    'OVERDUE'
  ],
  RETURN_PENDING_CONFIRMATION: [
    'RETURNED',
    'CLOSED',
    'PARTIALLY_RETURNED',
    'INCIDENT_HOLD'
  ],
  RETURNED: ['CLOSED'],
  OVERDUE: [
    'PARTIALLY_RETURNED',
    'RETURN_PENDING_CONFIRMATION',
    'RETURNED',
    'CLOSED',
    'INCIDENT_HOLD'
  ],
  RETURNED_PENDING_INSPECTION: ['COMPLETED', 'INCIDENT_HOLD', 'RETURNED', 'CLOSED'],
  INCIDENT_HOLD: ['ACTIVE', 'RESERVED', 'AWAITING_HANDOVER', 'CANCELLED', 'PARTIALLY_RETURNED', 'RETURNED', 'CLOSED'],
  COMPLETED: [],
  CLOSED: [],
  CANCELLED: []
};

function assertTransition(from: AllocationLifecycle, to: AllocationLifecycle): void {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new DomainError(`Illegal allocation transition ${from} -> ${to}.`, 409, 'ILLEGAL_TRANSITION');
  }
}

async function loadAllocation(id: string): Promise<Allocation> {
  const allocation = await prisma.allocation.findUnique({ where: { id } });
  if (!allocation) throw new DomainError('Allocation not found.', 404);
  return allocation;
}

/** Who may act on an allocation: the owning station, borrowing station, or authorized tree. */
async function assertAllocationAccess(
  user: SessionUser,
  allocation: Allocation
): Promise<{ vehicleOrgId: string; requestingOrgId: string }> {
  if (user.role === 'STATION_OFFICER' && user.stationId) {
    if (
      allocation.borrowingStationId === user.stationId ||
      allocation.lendingStationId === user.stationId
    ) {
      return {
        vehicleOrgId: user.organizationId || 'GWL-POLICE',
        requestingOrgId: user.organizationId || 'GWL-POLICE'
      };
    }
    throw new DomainError('Allocation not found.', 404);
  }

  const [vehicle, request] = await Promise.all([
    allocation.vehicleId
      ? prisma.vehicle.findUnique({ where: { id: allocation.vehicleId }, select: { organizationId: true } })
      : null,
    prisma.assetRequest.findUnique({ where: { id: allocation.requestId }, select: { requestingOrgId: true } })
  ]);

  const vehicleOrgId = vehicle?.organizationId || user.organizationId || 'GWL-POLICE';
  const requestingOrgId = request?.requestingOrgId || user.organizationId || 'GWL-POLICE';

  const tree = await orgTree(user);
  if (tree === null) return { vehicleOrgId, requestingOrgId };
  if (tree.includes(vehicleOrgId) || tree.includes(requestingOrgId)) {
    return { vehicleOrgId, requestingOrgId };
  }
  throw new DomainError('Allocation not found.', 404);
}

async function buildView(allocationId: string, isOwn: boolean, tx: TxClient = prisma): Promise<AllocationView> {
  const allocation = await tx.allocation.findUniqueOrThrow({ where: { id: allocationId } });
  const [vehicle, handover, returnRec, extensions, settings, borrowingStation, lendingStation] = await Promise.all([
    allocation.vehicleId
      ? tx.vehicle.findUnique({ where: { id: allocation.vehicleId }, select: { registrationNumber: true, displayName: true } })
      : null,
    tx.handoverRecord.findUnique({ where: { allocationId } }),
    tx.returnRecord.findUnique({ where: { allocationId } }),
    tx.extensionRequest.findMany({ where: { allocationId }, orderBy: { createdAt: 'asc' } }),
    loadSettings(tx),
    allocation.borrowingStationId
      ? tx.station.findUnique({ where: { id: allocation.borrowingStationId }, select: { name: true } })
      : null,
    allocation.lendingStationId
      ? tx.station.findUnique({ where: { id: allocation.lendingStationId }, select: { name: true } })
      : null
  ]);

  let label = '';
  if (vehicle) {
    label = isOwn
      ? `${vehicle.displayName ?? ''} ${vehicle.registrationNumber ?? ''}`.trim()
      : maskRegistration(vehicle.registrationNumber ?? '');
  } else if (allocation.quantity && allocation.quantity > 1) {
    label = `${allocation.quantity} vehicles allocated`;
  } else {
    label = 'Allocated vehicle';
  }

  return mapAllocation(allocation, {
    vehicleLabel: label,
    borrowingStationName: borrowingStation?.name ?? null,
    lendingStationName: lendingStation?.name ?? null,
    handover: handover ? mapHandover(handover) : null,
    returnRecord: returnRec ? mapReturn(returnRec) : null,
    extensions: extensions.map(mapExtension),
    graceMinutes: settings.returnGraceMinutes
  });
}

// ---------------------------------------------------------------------------
// Handover
// ---------------------------------------------------------------------------

export async function prepareHandover(user: SessionUser, id: string, correlationId: string): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId } = await assertAllocationAccess(user, allocation);
  assertTransition(allocation.lifecycle as AllocationLifecycle, 'AWAITING_HANDOVER');
  await prisma.$transaction(async (tx) => {
    await tx.allocation.update({ where: { id }, data: { lifecycle: 'AWAITING_HANDOVER' } });
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'HandoverPrepared', fieldName: 'lifecycle', oldValue: allocation.lifecycle, newValue: 'AWAITING_HANDOVER', performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId });
  }, { timeout: 30000, maxWait: 15000 });
  invalidate();
  return buildView(id, true);
}

export async function recordHandover(user: SessionUser, id: string, args: { receivedBy: string; conditionNotes: string; odometerKm?: number; fuelPercent?: number; checklist: { item: string; present: boolean }[]; evidenceRef?: string }, correlationId: string): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId, requestingOrgId } = await assertAllocationAccess(user, allocation);
  const from = allocation.lifecycle as AllocationLifecycle;
  if (from !== 'RESERVED' && from !== 'AWAITING_HANDOVER') {
    throw new DomainError(`Handover can only be recorded from RESERVED or AWAITING_HANDOVER (current ${from}).`, 409, 'ILLEGAL_TRANSITION');
  }
  await prisma.$transaction(async (tx) => {
    await tx.handoverRecord.create({
      data: { allocationId: id, handedOverBy: user.username, receivedBy: args.receivedBy, conditionNotes: args.conditionNotes, odometerKm: args.odometerKm ?? null, fuelPercent: args.fuelPercent ?? null, checklist: args.checklist as unknown as Prisma.InputJsonValue, evidenceRef: args.evidenceRef ?? null }
    });
    await tx.allocation.update({ where: { id }, data: { lifecycle: 'ACTIVE' } });
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'HandoverRecorded', fieldName: 'lifecycle', oldValue: from, newValue: 'ACTIVE', performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId });
    await notify({ eventKey: `allocation:${id}:ACTIVE`, kind: 'ALLOCATION_ACTIVE', title: 'Vehicle handed over', body: `Allocation ${allocation.allocationCode} is now active.`, href: `/allocations`, recipientOrgId: requestingOrgId }, tx);
  }, { timeout: 30000, maxWait: 15000 });
  invalidate();
  return buildView(id, true);
}

// ---------------------------------------------------------------------------
// Return & Return Confirmation Workflows (13.10 & 13.11)
// ---------------------------------------------------------------------------

export async function recordReturn(
  user: SessionUser,
  id: string,
  args: {
    receivedBy: string;
    conditionNotes: string;
    returnQuantity?: number;
    odometerKm?: number;
    fuelPercent?: number;
    discrepancies?: string;
    evidenceRef?: string;
    damagedVehicleIds?: string[];
    damageNotes?: string;
  },
  correlationId: string
): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId } = await assertAllocationAccess(user, allocation);

  const allowedLifecycles: AllocationLifecycle[] = [
    'ACTIVE',
    'PARTIALLY_RETURNED',
    'OVERDUE',
    'AWAITING_HANDOVER',
    'RESERVED',
    'RETURN_PENDING_CONFIRMATION'
  ];
  if (!allowedLifecycles.includes(allocation.lifecycle as AllocationLifecycle)) {
    throw new DomainError(
      `Only an active or overdue allocation can be returned (current: ${allocation.lifecycle}).`,
      409,
      'ILLEGAL_TRANSITION'
    );
  }

  const allocQty = allocation.quantity ?? 1;
  const alreadyReturned = allocation.returnedQuantity ?? 0;
  const remaining = Math.max(1, allocQty - alreadyReturned);
  const returnQty = Math.min(remaining, Math.max(1, args.returnQuantity ?? remaining));

  const isProviderOrAdmin =
    user.role === 'ADMIN' || (user.stationId && user.stationId === allocation.lendingStationId);

  // If borrowing station initiates:
  if (!isProviderOrAdmin && allocation.borrowingStationId && user.stationId === allocation.borrowingStationId) {
    await prisma.$transaction(async (tx) => {
      const returnDetails = {
        initiatedBy: user.username,
        initiatedAt: new Date().toISOString(),
        pendingReturnQuantity: returnQty,
        receivedBy: args.receivedBy,
        conditionNotes: args.conditionNotes,
        odometerKm: args.odometerKm ?? null,
        fuelPercent: args.fuelPercent ?? null,
        discrepancies: args.discrepancies ?? null,
        damagedVehicleIds: args.damagedVehicleIds ?? [],
        damageNotes: args.damageNotes ?? null
      };

      await tx.allocation.update({
        where: { id },
        data: {
          lifecycle: 'RETURN_PENDING_CONFIRMATION',
          returnDetails: returnDetails as unknown as Prisma.InputJsonValue
        }
      });

      await writeAudit(tx, {
        entityType: 'Allocation',
        entityId: id,
        action: 'ReturnInitiated',
        fieldName: 'lifecycle',
        oldValue: allocation.lifecycle,
        newValue: 'RETURN_PENDING_CONFIRMATION',
        performedBy: user.username,
        performedByRole: user.role,
        organizationId: vehicleOrgId,
        correlationId,
        reason: `Initiated return of ${returnQty} vehicle(s)`
      });
    }, { timeout: 30000, maxWait: 15000 });

    invalidate();
    return buildView(id, true);
  }

  // Direct confirmation by provider station or admin
  return executeConfirmReturn(
    user,
    allocation,
    {
      receivedBy: args.receivedBy,
      notes: args.conditionNotes,
      returnQuantity: returnQty,
      damagedVehicleIds: args.damagedVehicleIds,
      damageNotes: args.damageNotes
    },
    correlationId,
    vehicleOrgId
  );
}

export async function confirmReturn(
  user: SessionUser,
  id: string,
  args: {
    receivedBy?: string;
    notes?: string;
    returnQuantity?: number;
    damagedVehicleIds?: string[];
    damageNotes?: string;
  },
  correlationId: string
): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId } = await assertAllocationAccess(user, allocation);

  // Only providing police station or admin can verify and confirm return
  if (
    user.role === 'STATION_OFFICER' &&
    user.stationId &&
    allocation.lendingStationId &&
    user.stationId !== allocation.lendingStationId
  ) {
    throw new DomainError('Only the providing police station can verify and confirm vehicle returns.', 403);
  }

  return executeConfirmReturn(user, allocation, args, correlationId, vehicleOrgId);
}

async function executeConfirmReturn(
  user: SessionUser,
  allocation: Allocation,
  args: {
    receivedBy?: string;
    notes?: string;
    returnQuantity?: number;
    damagedVehicleIds?: string[];
    damageNotes?: string;
  },
  correlationId: string,
  vehicleOrgId: string
): Promise<AllocationView> {
  const id = allocation.id;
  const allocQty = allocation.quantity ?? 1;
  const alreadyReturned = allocation.returnedQuantity ?? 0;
  const remaining = Math.max(0, allocQty - alreadyReturned);

  const prevReturnDetails = (allocation.returnDetails as Record<string, unknown> | null) ?? {};
  const pendingQty =
    typeof prevReturnDetails.pendingReturnQuantity === 'number'
      ? prevReturnDetails.pendingReturnQuantity
      : remaining;
  const qtyToReturn = Math.min(remaining, Math.max(1, args.returnQuantity ?? pendingQty));
  const newReturnedQty = alreadyReturned + qtyToReturn;
  const isFullReturn = newReturnedQty >= allocQty;
  const nextLifecycle: AllocationLifecycle = isFullReturn ? 'CLOSED' : 'PARTIALLY_RETURNED';

  const damagedIds = Array.isArray(args.damagedVehicleIds)
    ? args.damagedVehicleIds
    : Array.isArray(prevReturnDetails.damagedVehicleIds)
      ? (prevReturnDetails.damagedVehicleIds as string[])
      : [];

  const damageNotes =
    args.damageNotes ||
    (typeof prevReturnDetails.damageNotes === 'string' ? prevReturnDetails.damageNotes : null);

  await prisma.$transaction(async (tx) => {
    // 1. Mark damaged vehicles as MAINTENANCE & INELIGIBLE
    if (damagedIds.length > 0) {
      for (const vid of damagedIds) {
        if (typeof vid === 'string' && vid) {
          await tx.vehicle.update({
            where: { id: vid },
            data: {
              operationalStatus: 'MAINTENANCE',
              eligibilityState: 'INELIGIBLE',
              eligibilityReasons: [damageNotes ?? 'Vehicle returned with damages; routed to maintenance.']
            }
          });
          await writeAudit(tx, {
            entityType: 'Vehicle',
            entityId: vid,
            action: 'VehicleDamagedOnReturn',
            fieldName: 'operationalStatus',
            oldValue: 'ACTIVE',
            newValue: 'MAINTENANCE',
            performedBy: user.username,
            performedByRole: user.role,
            organizationId: vehicleOrgId,
            correlationId,
            reason: damageNotes ?? 'Vehicle returned with damage requiring maintenance'
          });
        }
      }
    }

    // 2. Compute which vehicle IDs are returned
    const existingReturnedIds = Array.isArray(prevReturnDetails.returnedVehicleIds)
      ? (prevReturnDetails.returnedVehicleIds as string[])
      : [];
    const assignedIds = Array.isArray(allocation.assignedVehicleIds)
      ? (allocation.assignedVehicleIds as string[])
      : allocation.vehicleId
        ? [allocation.vehicleId]
        : [];

    const newlyReturnedIds: string[] = [];
    for (const vid of assignedIds) {
      if (!existingReturnedIds.includes(vid) && newlyReturnedIds.length < qtyToReturn) {
        newlyReturnedIds.push(vid);
      }
    }
    const allReturnedIds = Array.from(new Set([...existingReturnedIds, ...newlyReturnedIds]));

    // 3. Create or update ReturnRecord
    await tx.returnRecord.upsert({
      where: { allocationId: id },
      create: {
        allocationId: id,
        returnedBy: (prevReturnDetails.initiatedBy as string) ?? user.username,
        receivedBy: args.receivedBy ?? (prevReturnDetails.receivedBy as string) ?? user.username,
        conditionNotes: args.notes ?? (prevReturnDetails.conditionNotes as string) ?? 'Returned and verified',
        odometerKm: typeof prevReturnDetails.odometerKm === 'number' ? prevReturnDetails.odometerKm : null,
        fuelPercent: typeof prevReturnDetails.fuelPercent === 'number' ? prevReturnDetails.fuelPercent : null,
        discrepancies: typeof prevReturnDetails.discrepancies === 'string' ? prevReturnDetails.discrepancies : null,
        evidenceRef: typeof prevReturnDetails.evidenceRef === 'string' ? prevReturnDetails.evidenceRef : null,
        inspectionRequired: false,
        inspectionStatus: 'ACCEPTED'
      },
      update: {
        returnedBy: (prevReturnDetails.initiatedBy as string) ?? user.username,
        receivedBy: args.receivedBy ?? (prevReturnDetails.receivedBy as string) ?? user.username,
        conditionNotes: args.notes ?? (prevReturnDetails.conditionNotes as string) ?? 'Returned and verified',
        odometerKm: typeof prevReturnDetails.odometerKm === 'number' ? prevReturnDetails.odometerKm : null,
        fuelPercent: typeof prevReturnDetails.fuelPercent === 'number' ? prevReturnDetails.fuelPercent : null,
        discrepancies: typeof prevReturnDetails.discrepancies === 'string' ? prevReturnDetails.discrepancies : null,
        evidenceRef: typeof prevReturnDetails.evidenceRef === 'string' ? prevReturnDetails.evidenceRef : null,
        inspectionStatus: 'ACCEPTED'
      }
    });

    // 4. Update Allocation
    await tx.allocation.update({
      where: { id },
      data: {
        lifecycle: nextLifecycle,
        returnedQuantity: newReturnedQty,
        returnDetails: {
          ...prevReturnDetails,
          confirmedBy: user.username,
          confirmedAt: new Date().toISOString(),
          returnedVehicleIds: allReturnedIds,
          damagedVehicleIds: damagedIds,
          damageNotes: damageNotes ?? null
        } as unknown as Prisma.InputJsonValue
      }
    });

    // 5. Update lending station inventory atomically
    if (allocation.lendingStationId) {
      await recomputeStationInventory(tx, allocation.lendingStationId);
    }
    if (allocation.borrowingStationId && allocation.borrowingStationId !== allocation.lendingStationId) {
      await recomputeStationInventory(tx, allocation.borrowingStationId);
    }

    await writeAudit(tx, {
      entityType: 'Allocation',
      entityId: id,
      action: isFullReturn ? 'ReturnConfirmedFull' : 'ReturnConfirmedPartial',
      fieldName: 'lifecycle',
      oldValue: allocation.lifecycle,
      newValue: nextLifecycle,
      performedBy: user.username,
      performedByRole: user.role,
      organizationId: vehicleOrgId,
      correlationId,
      reason: `Confirmed return of ${qtyToReturn} vehicle(s). Total returned: ${newReturnedQty}/${allocQty}`
    });
  }, { timeout: 30000, maxWait: 15000 });

  invalidate();
  return buildView(id, true);
}

export async function inspect(user: SessionUser, id: string, decision: 'ACCEPTED' | 'DISPUTED', notes: string | undefined, correlationId: string): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId } = await assertAllocationAccess(user, allocation);
  if (allocation.lifecycle !== 'RETURNED_PENDING_INSPECTION') {
    throw new DomainError('Only a RETURNED_PENDING_INSPECTION allocation can be inspected.', 409, 'ILLEGAL_TRANSITION');
  }
  const ret = await prisma.returnRecord.findUnique({ where: { allocationId: id } });
  if (!ret) throw new DomainError('Return record not found.', 404);

  await prisma.$transaction(async (tx) => {
    await tx.returnRecord.update({ where: { allocationId: id }, data: { inspectionStatus: decision, inspectedBy: user.username, inspectedAt: new Date(), inspectionNotes: notes ?? null } });
    if (decision === 'ACCEPTED') {
      assertTransition('RETURNED_PENDING_INSPECTION', 'COMPLETED');
      await tx.allocation.update({ where: { id }, data: { lifecycle: 'COMPLETED' } });
      if (allocation.lendingStationId) {
        await recomputeStationInventory(tx, allocation.lendingStationId);
      }
    } else {
      assertTransition('RETURNED_PENDING_INSPECTION', 'INCIDENT_HOLD');
      await tx.allocation.update({ where: { id }, data: { lifecycle: 'INCIDENT_HOLD', holdReason: 'Return inspection disputed' } });
    }
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'ReturnInspected', fieldName: 'inspectionStatus', newValue: decision, performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId, reason: notes });
  }, { timeout: 30000, maxWait: 15000 });
  invalidate();
  return buildView(id, true);
}

// ---------------------------------------------------------------------------
// Extensions (conflict re-check against later reservations)
// ---------------------------------------------------------------------------

export async function requestExtension(user: SessionUser, id: string, newEndAt: string, reason: string, correlationId: string): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId, requestingOrgId } = await assertAllocationAccess(user, allocation);
  if (!['RESERVED', 'AWAITING_HANDOVER', 'ACTIVE', 'PARTIALLY_RETURNED'].includes(allocation.lifecycle)) {
    throw new DomainError('Only an open allocation can be extended.', 409);
  }
  const newEnd = new Date(newEndAt);
  if (newEnd <= allocation.endAt) throw new DomainError('The new end must be after the current end.', 400);

  await prisma.$transaction(async (tx) => {
    const ext = await tx.extensionRequest.create({ data: { allocationId: id, requestedBy: user.username, newEndAt: newEnd, reason, status: 'PENDING' } });
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'ExtensionRequested', newValue: newEnd.toISOString(), performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId, reason });
    await notify({ eventKey: `extension:${ext.id}:REQUESTED`, kind: 'EXTENSION_REQUESTED', title: 'Extension requested', body: `Extension requested for allocation ${allocation.allocationCode}.`, href: `/allocations`, recipientOrgId: vehicleOrgId, recipientRole: 'DEPT_OFFICER' }, tx);
  }, { timeout: 30000, maxWait: 15000 });
  invalidate();
  void requestingOrgId;
  return buildView(id, true);
}

export async function decideExtension(user: SessionUser, id: string, extensionId: string, decision: 'APPROVED' | 'REJECTED', note: string | undefined, correlationId: string): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId } = await assertAllocationAccess(user, allocation);
  const ext = await prisma.extensionRequest.findUnique({ where: { id: extensionId } });
  if (!ext || ext.allocationId !== id) throw new DomainError('Extension not found.', 404);
  if (ext.status !== 'PENDING') throw new DomainError('Extension already decided.', 409);

  await prisma.$transaction(async (tx) => {
    if (decision === 'APPROVED') {
      if (allocation.vehicleId) {
        const conflict = await tx.allocation.findFirst({
          where: {
            vehicleId: allocation.vehicleId,
            id: { not: allocation.id },
            lifecycle: { in: ['RESERVED', 'AWAITING_HANDOVER', 'ACTIVE', 'RETURNED_PENDING_INSPECTION', 'INCIDENT_HOLD'] },
            startAt: { lt: ext.newEndAt },
            endAt: { gt: allocation.endAt }
          },
          select: { id: true, startAt: true, endAt: true }
        });
        if (conflict) {
          throw new DomainError(`Extension overlaps a later reservation (${conflict.startAt.toISOString()} - ${conflict.endAt.toISOString()}).`, 409, 'EXTENSION_CONFLICT');
        }
      }
      await tx.allocation.update({ where: { id }, data: { endAt: ext.newEndAt } });
    }
    await tx.extensionRequest.update({ where: { id: extensionId }, data: { status: decision, decidedBy: user.username, decidedAt: new Date(), decisionNote: note ?? null } });
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'ExtensionDecided', fieldName: 'extension', newValue: decision, performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId, reason: note });
  }, { timeout: 30000, maxWait: 15000 }).catch((error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.message.includes('allocation_no_overlap')) {
      throw new DomainError('Extension overlaps another allocation (database guard).', 409, 'EXTENSION_CONFLICT');
    }
    throw error;
  });
  invalidate();
  return buildView(id, true);
}

// ---------------------------------------------------------------------------
// Hold / release / cancel
// ---------------------------------------------------------------------------

export async function hold(user: SessionUser, id: string, reason: string, correlationId: string): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId } = await assertAllocationAccess(user, allocation);
  assertTransition(allocation.lifecycle as AllocationLifecycle, 'INCIDENT_HOLD');
  await prisma.$transaction(async (tx) => {
    await tx.allocation.update({ where: { id }, data: { lifecycle: 'INCIDENT_HOLD', holdReason: reason } });
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'AllocationHeld', fieldName: 'lifecycle', oldValue: allocation.lifecycle, newValue: 'INCIDENT_HOLD', performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId, reason });
  }, { timeout: 30000, maxWait: 15000 });
  invalidate();
  return buildView(id, true);
}

export async function releaseHold(user: SessionUser, id: string, correlationId: string): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId } = await assertAllocationAccess(user, allocation);
  if (allocation.lifecycle !== 'INCIDENT_HOLD') throw new DomainError('Allocation is not on hold.', 409);
  const handover = await prisma.handoverRecord.findUnique({ where: { allocationId: id } });
  const next: AllocationLifecycle = handover ? 'ACTIVE' : 'RESERVED';
  await prisma.$transaction(async (tx) => {
    await tx.allocation.update({ where: { id }, data: { lifecycle: next, holdReason: null } });
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'AllocationHoldReleased', fieldName: 'lifecycle', oldValue: 'INCIDENT_HOLD', newValue: next, performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId });
  }, { timeout: 30000, maxWait: 15000 });
  invalidate();
  return buildView(id, true);
}

export async function cancelAllocation(user: SessionUser, id: string, reason: string, correlationId: string): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId } = await assertAllocationAccess(user, allocation);
  if (!['RESERVED', 'AWAITING_HANDOVER', 'INCIDENT_HOLD'].includes(allocation.lifecycle)) {
    throw new DomainError('An allocation can only be cancelled before handover.', 409, 'ILLEGAL_TRANSITION');
  }
  await prisma.$transaction(async (tx) => {
    await tx.allocation.update({ where: { id }, data: { lifecycle: 'CANCELLED', cancelReason: reason } });
    if (allocation.lendingStationId) {
      await recomputeStationInventory(tx, allocation.lendingStationId);
    }
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'AllocationCancelled', fieldName: 'lifecycle', oldValue: allocation.lifecycle, newValue: 'CANCELLED', performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId, reason });
  }, { timeout: 30000, maxWait: 15000 });
  invalidate();
  return buildView(id, true);
}

// ---------------------------------------------------------------------------
// Dispatcher + reads
// ---------------------------------------------------------------------------

export async function applyAllocationAction(user: SessionUser, id: string, action: AllocationActionParsed, correlationId: string): Promise<AllocationView> {
  switch (action.type) {
    case 'prepareHandover':
      return prepareHandover(user, id, correlationId);
    case 'recordHandover':
      return recordHandover(user, id, action, correlationId);
    case 'recordReturn':
      return recordReturn(user, id, action, correlationId);
    case 'confirmReturn':
      return confirmReturn(user, id, action, correlationId);
    case 'inspect':
      return inspect(user, id, action.decision, action.notes, correlationId);
    case 'requestExtension':
      return requestExtension(user, id, action.newEndAt, action.reason, correlationId);
    case 'decideExtension':
      return decideExtension(user, id, action.extensionId, action.decision, action.note, correlationId);
    case 'hold':
      return hold(user, id, action.reason, correlationId);
    case 'releaseHold':
      return releaseHold(user, id, correlationId);
    case 'cancel':
      return cancelAllocation(user, id, action.reason, correlationId);
    default: {
      const _exhaustive: never = action;
      throw new DomainError('Unsupported allocation action.', 400);
    }
  }
}

export async function getAllocationView(user: SessionUser, id: string): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId } = await assertAllocationAccess(user, allocation);
  const tree = await orgTree(user);
  const isOwn =
    tree === null ||
    tree.includes(vehicleOrgId) ||
    (user.stationId !== null &&
      (user.stationId === allocation.lendingStationId || user.stationId === allocation.borrowingStationId));
  return buildView(id, isOwn);
}
