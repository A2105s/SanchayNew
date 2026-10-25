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
// Explicit allocation transition table (spec 15/16). Illegal transition -> 409.
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<AllocationLifecycle, AllocationLifecycle[]> = {
  RESERVED: ['AWAITING_HANDOVER', 'ACTIVE', 'CANCELLED', 'INCIDENT_HOLD'],
  AWAITING_HANDOVER: ['ACTIVE', 'CANCELLED', 'INCIDENT_HOLD'],
  ACTIVE: ['RETURNED_PENDING_INSPECTION', 'COMPLETED', 'INCIDENT_HOLD'],
  RETURNED_PENDING_INSPECTION: ['COMPLETED', 'INCIDENT_HOLD'],
  INCIDENT_HOLD: ['ACTIVE', 'RESERVED', 'AWAITING_HANDOVER', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

function assertTransition(from: AllocationLifecycle, to: AllocationLifecycle): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new DomainError(`Illegal allocation transition ${from} -> ${to}.`, 409, 'ILLEGAL_TRANSITION');
  }
}

async function loadAllocation(id: string): Promise<Allocation> {
  const allocation = await prisma.allocation.findUnique({ where: { id } });
  if (!allocation) throw new DomainError('Allocation not found.', 404);
  return allocation;
}

/** Who may act on an allocation: the owning org (vehicle org) tree, or the requesting org. */
async function assertAllocationAccess(user: SessionUser, allocation: Allocation): Promise<{ vehicleOrgId: string; requestingOrgId: string }> {
  const [vehicle, request] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id: allocation.vehicleId }, select: { organizationId: true } }),
    prisma.assetRequest.findUnique({ where: { id: allocation.requestId }, select: { requestingOrgId: true } })
  ]);
  if (!vehicle || !request) throw new DomainError('Allocation not found.', 404);
  const tree = await orgTree(user);
  if (tree === null) return { vehicleOrgId: vehicle.organizationId, requestingOrgId: request.requestingOrgId };
  if (tree.includes(vehicle.organizationId) || tree.includes(request.requestingOrgId)) {
    return { vehicleOrgId: vehicle.organizationId, requestingOrgId: request.requestingOrgId };
  }
  throw new DomainError('Allocation not found.', 404);
}

async function buildView(allocationId: string, isOwn: boolean, tx: TxClient = prisma): Promise<AllocationView> {
  const allocation = await tx.allocation.findUniqueOrThrow({ where: { id: allocationId } });
  const [vehicle, handover, returnRec, extensions, settings] = await Promise.all([
    tx.vehicle.findUnique({ where: { id: allocation.vehicleId }, select: { registrationNumber: true, displayName: true } }),
    tx.handoverRecord.findUnique({ where: { allocationId } }),
    tx.returnRecord.findUnique({ where: { allocationId } }),
    tx.extensionRequest.findMany({ where: { allocationId }, orderBy: { createdAt: 'asc' } }),
    loadSettings(tx)
  ]);
  const label = isOwn ? `${vehicle?.displayName ?? ''} ${vehicle?.registrationNumber ?? ''}`.trim() : maskRegistration(vehicle?.registrationNumber ?? '');
  return mapAllocation(allocation, {
    vehicleLabel: label,
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
  });
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
  });
  invalidate();
  return buildView(id, true);
}

// ---------------------------------------------------------------------------
// Return + inspection
// ---------------------------------------------------------------------------

export async function recordReturn(user: SessionUser, id: string, args: { receivedBy: string; conditionNotes: string; odometerKm?: number; fuelPercent?: number; discrepancies?: string; evidenceRef?: string }, correlationId: string): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId } = await assertAllocationAccess(user, allocation);
  if (allocation.lifecycle !== 'ACTIVE') {
    throw new DomainError('Only an ACTIVE allocation can be returned.', 409, 'ILLEGAL_TRANSITION');
  }
  const settings = await loadSettings();
  const inspectionRequired = settings.requireInspectionOnReturn;

  await prisma.$transaction(async (tx) => {
    await tx.returnRecord.create({
      data: {
        allocationId: id,
        returnedBy: user.username,
        receivedBy: args.receivedBy,
        conditionNotes: args.conditionNotes,
        odometerKm: args.odometerKm ?? null,
        fuelPercent: args.fuelPercent ?? null,
        discrepancies: args.discrepancies ?? null,
        evidenceRef: args.evidenceRef ?? null,
        inspectionRequired,
        inspectionStatus: inspectionRequired ? 'PENDING' : 'NOT_REQUIRED'
      }
    });
    const nextLifecycle: AllocationLifecycle = inspectionRequired ? 'RETURNED_PENDING_INSPECTION' : 'COMPLETED';
    assertTransition('ACTIVE', nextLifecycle);
    await tx.allocation.update({ where: { id }, data: { lifecycle: nextLifecycle } });
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'ReturnRecorded', fieldName: 'lifecycle', oldValue: 'ACTIVE', newValue: nextLifecycle, performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId });
  });
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
    } else {
      // Disputed -> place on incident hold for escalation.
      assertTransition('RETURNED_PENDING_INSPECTION', 'INCIDENT_HOLD');
      await tx.allocation.update({ where: { id }, data: { lifecycle: 'INCIDENT_HOLD', holdReason: 'Return inspection disputed' } });
    }
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'ReturnInspected', fieldName: 'inspectionStatus', newValue: decision, performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId, reason: notes });
  });
  invalidate();
  return buildView(id, true);
}

// ---------------------------------------------------------------------------
// Extensions (conflict re-check against later reservations)
// ---------------------------------------------------------------------------

export async function requestExtension(user: SessionUser, id: string, newEndAt: string, reason: string, correlationId: string): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId, requestingOrgId } = await assertAllocationAccess(user, allocation);
  if (!['RESERVED', 'AWAITING_HANDOVER', 'ACTIVE'].includes(allocation.lifecycle)) {
    throw new DomainError('Only an open allocation can be extended.', 409);
  }
  const newEnd = new Date(newEndAt);
  if (newEnd <= allocation.endAt) throw new DomainError('The new end must be after the current end.', 400);

  await prisma.$transaction(async (tx) => {
    const ext = await tx.extensionRequest.create({ data: { allocationId: id, requestedBy: user.username, newEndAt: newEnd, reason, status: 'PENDING' } });
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'ExtensionRequested', newValue: newEnd.toISOString(), performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId, reason });
    await notify({ eventKey: `extension:${ext.id}:REQUESTED`, kind: 'EXTENSION_REQUESTED', title: 'Extension requested', body: `Extension requested for allocation ${allocation.allocationCode}.`, href: `/allocations`, recipientOrgId: vehicleOrgId, recipientRole: 'DEPT_OFFICER' }, tx);
  });
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
      // Conflict re-check: any other live allocation overlapping the extended window => 409.
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
      // The DB exclusion constraint is the final guard against races.
      await tx.allocation.update({ where: { id }, data: { endAt: ext.newEndAt } });
    }
    await tx.extensionRequest.update({ where: { id: extensionId }, data: { status: decision, decidedBy: user.username, decidedAt: new Date(), decisionNote: note ?? null } });
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'ExtensionDecided', fieldName: 'extension', newValue: decision, performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId, reason: note });
  }).catch((error) => {
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
  });
  invalidate();
  return buildView(id, true);
}

export async function releaseHold(user: SessionUser, id: string, correlationId: string): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId } = await assertAllocationAccess(user, allocation);
  if (allocation.lifecycle !== 'INCIDENT_HOLD') throw new DomainError('Allocation is not on hold.', 409);
  // Return to ACTIVE if it had been handed over, else RESERVED.
  const handover = await prisma.handoverRecord.findUnique({ where: { allocationId: id } });
  const next: AllocationLifecycle = handover ? 'ACTIVE' : 'RESERVED';
  await prisma.$transaction(async (tx) => {
    await tx.allocation.update({ where: { id }, data: { lifecycle: next, holdReason: null } });
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'AllocationHoldReleased', fieldName: 'lifecycle', oldValue: 'INCIDENT_HOLD', newValue: next, performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId });
  });
  invalidate();
  return buildView(id, true);
}

export async function cancelAllocation(user: SessionUser, id: string, reason: string, correlationId: string): Promise<AllocationView> {
  const allocation = await loadAllocation(id);
  const { vehicleOrgId } = await assertAllocationAccess(user, allocation);
  // Cancel allowed only before handover (RESERVED / AWAITING_HANDOVER) or from hold.
  if (!['RESERVED', 'AWAITING_HANDOVER', 'INCIDENT_HOLD'].includes(allocation.lifecycle)) {
    throw new DomainError('An allocation can only be cancelled before handover.', 409, 'ILLEGAL_TRANSITION');
  }
  await prisma.$transaction(async (tx) => {
    await tx.allocation.update({ where: { id }, data: { lifecycle: 'CANCELLED', cancelReason: reason } });
    // Also move the request back out of APPROVED (its vehicle is freed).
    await writeAudit(tx, { entityType: 'Allocation', entityId: id, action: 'AllocationCancelled', fieldName: 'lifecycle', oldValue: allocation.lifecycle, newValue: 'CANCELLED', performedBy: user.username, performedByRole: user.role, organizationId: vehicleOrgId, correlationId, reason });
  });
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
  const isOwn = tree === null || tree.includes(vehicleOrgId);
  return buildView(id, isOwn);
}
