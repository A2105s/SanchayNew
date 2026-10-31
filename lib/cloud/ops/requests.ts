import 'server-only';

import { Prisma, type AssetRequest } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { AssetRequestView, SessionUser, VehicleClass } from '@/types';
import { writeAudit } from '@/lib/cloud/audit';
import { recordCloudEvent } from '@/lib/cloud/backend-events';
import { CLOUD_CACHE_TAGS, invalidateCloudData } from '@/lib/cloud/cached-queries';
import { DomainError, DEFAULT_FLEET_SETTINGS, FLEET_SETTINGS_KEY, mergeFleetSettings } from '@/lib/cloud/errors';
import { mapApprovalStep, mapRequest, maskRegistration } from '@/lib/cloud/mappers';
import { nextAllocationCode, nextRequestCode } from '@/lib/cloud/codes';
import { computeAvailability, evaluateEligibility } from '@/lib/cloud/eligibility';
import { notify } from '@/lib/cloud/notifications';
import { orgTree, parentOrgId } from '@/lib/auth/scope';
import type { FleetSettings } from '@/types';
import type { RequestInputParsed } from '@/lib/validation/schemas';

type TxClient = Prisma.TransactionClient | typeof prisma;

function invalidate() {
  invalidateCloudData(CLOUD_CACHE_TAGS.ops, CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.all);
}

async function loadSettings(tx: TxClient = prisma): Promise<FleetSettings> {
  const row = await tx.appSetting.findUnique({ where: { key: FLEET_SETTINGS_KEY } });
  return row ? mergeFleetSettings(row.value) : { ...DEFAULT_FLEET_SETTINGS };
}

async function loadRequest(id: string): Promise<AssetRequest> {
  const request = await prisma.assetRequest.findUnique({ where: { id } });
  if (!request) throw new DomainError('Request not found.', 404);
  return request;
}

/** A request is visible when it was raised by the caller's org, or targets the caller's org for a decision. */
async function assertRequestAccess(user: SessionUser, request: AssetRequest): Promise<void> {
  const tree = await orgTree(user);
  if (tree === null) return; // ADMIN may read (but not decide)
  const inReq = tree.includes(request.requestingOrgId);
  const inApprover = request.approverOrgId ? tree.includes(request.approverOrgId) : false;
  if (!inReq && !inApprover) throw new DomainError('Request not found.', 404);
}

async function buildView(requestId: string, user: SessionUser, tx: TxClient = prisma): Promise<AssetRequestView> {
  const request = await tx.assetRequest.findUniqueOrThrow({ where: { id: requestId } });
  const [steps, allocation, requestingOrg, vehicle] = await Promise.all([
    tx.approvalStep.findMany({ where: { requestId }, orderBy: { stepOrder: 'asc' } }),
    tx.allocation.findUnique({ where: { requestId } }),
    tx.organization.findUnique({ where: { id: request.requestingOrgId }, select: { name: true } }),
    request.vehicleId ? tx.vehicle.findUnique({ where: { id: request.vehicleId }, select: { organizationId: true, displayName: true, registrationNumber: true } }) : Promise.resolve(null)
  ]);
  const orgIds = steps.map((s) => s.approverOrgId);
  const orgs = orgIds.length ? await tx.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [];
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

  const tree = await orgTree(user, tx);
  const isOwnVehicle = vehicle ? tree === null || tree.includes(vehicle.organizationId) : false;
  let vehicleOrgName: string | null = null;
  if (vehicle) {
    const vOrg = await tx.organization.findUnique({ where: { id: vehicle.organizationId }, select: { name: true } });
    vehicleOrgName = vOrg?.name ?? null;
  }
  const vehicleLabel = vehicle ? (isOwnVehicle ? `${vehicle.displayName} ${vehicle.registrationNumber}`.trim() : maskRegistration(vehicle.registrationNumber)) : null;

  return mapRequest(request, {
    requestingOrgName: requestingOrg?.name ?? 'Unknown',
    vehicleOrgName,
    vehicleLabel,
    steps: steps.map((s) => mapApprovalStep(s, orgNameById.get(s.approverOrgId) ?? 'Unknown')),
    allocationId: allocation?.id ?? null
  });
}

function validateWindow(startAt: Date, endAt: Date, settings: FleetSettings, now: Date): void {
  if (endAt <= startAt) throw new DomainError('End time must be after start time.', 400);
  if (startAt.getTime() < now.getTime() - 60_000) throw new DomainError('Start time cannot be in the past.', 400);
  const horizon = now.getTime() + settings.maxBookingHorizonDays * 86400000;
  if (startAt.getTime() > horizon) throw new DomainError(`Start time exceeds the ${settings.maxBookingHorizonDays}-day booking horizon.`, 400);
}

// ---------------------------------------------------------------------------
// Create / update / submit
// ---------------------------------------------------------------------------

export async function createRequest(user: SessionUser, input: RequestInputParsed, idempotencyKey: string | null, correlationId: string): Promise<AssetRequestView> {
  let effectiveOrgId = user.organizationId;
  if (!effectiveOrgId && user.role === 'ADMIN') {
    if (input.vehicleId) {
      const v = await prisma.vehicle.findUnique({ where: { id: input.vehicleId }, select: { organizationId: true } });
      effectiveOrgId = v?.organizationId ?? null;
    }
    if (!effectiveOrgId) {
      const firstOrg = await prisma.organization.findFirst({ select: { id: true } });
      effectiveOrgId = firstOrg?.id ?? null;
    }
  }
  if (!effectiveOrgId) throw new DomainError('You must belong to an organization to raise a request.', 403);
  const now = new Date();
  const settings = await loadSettings();
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  validateWindow(startAt, endAt, settings, now);

  if (idempotencyKey) {
    const existing = await prisma.assetRequest.findUnique({ where: { idempotencyKey } });
    if (existing) return buildView(existing.id, user);
  }

  // Resolve approver org from the vehicle's owning org (if a specific vehicle), else the requester's org.
  let approverOrgId: string | null = null;
  if (input.vehicleId) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } });
    if (!vehicle) throw new DomainError('Requested vehicle not found.', 404);
    // Visibility: must be own-org OR cross-org discoverable (eligible gov fleet).
    const tree = await orgTree(user);
    const isOwn = tree === null || tree.includes(vehicle.organizationId);
    const discoverable = vehicle.ownershipCategory === 'GOVERNMENT_FLEET' && vehicle.eligibilityState === 'ELIGIBLE' && vehicle.operationalStatus === 'ACTIVE';
    if (!isOwn && !discoverable) throw new DomainError('Requested vehicle not found.', 404);
    // Eligibility must hold at request time.
    const eligibility = await evaluateEligibility(vehicle.id, prisma, settings, now);
    if (eligibility.state !== 'ELIGIBLE') {
      throw new DomainError(`Vehicle is not eligible: ${eligibility.reasons.filter((r) => r.blocking).map((r) => r.message).join('; ') || eligibility.state}.`, 409, 'NOT_ELIGIBLE');
    }
    const availability = await computeAvailability(vehicle.id, startAt, endAt, prisma, settings, now);
    if (availability.state !== 'AVAILABLE') {
      throw new DomainError(`Vehicle is not available for the requested range: ${availability.state}.`, 409, 'NOT_AVAILABLE');
    }
    approverOrgId = vehicle.organizationId;
  } else {
    approverOrgId = effectiveOrgId;
  }

  const submit = input.submit === true;

  const request = await prisma.$transaction(async (tx) => {
    const requestCode = await nextRequestCode(tx);
    const created = await tx.assetRequest.create({
      data: {
        requestCode,
        requestingOrgId: effectiveOrgId as string,
        requesterUsername: user.username,
        requesterName: user.displayName,
        vehicleId: input.vehicleId ?? null,
        requestedClass: input.requestedClass,
        purpose: input.purpose,
        destination: input.destination ?? null,
        passengers: input.passengers,
        startAt,
        endAt,
        accountableOfficer: input.accountableOfficer,
        accountablePhone: input.accountablePhone ?? null,
        contactPhone: input.contactPhone ?? null,
        state: submit ? 'SUBMITTED' : 'DRAFT',
        approverOrgId,
        submittedAt: submit ? now : null,
        idempotencyKey: idempotencyKey ?? undefined
      }
    });
    if (submit && approverOrgId) {
      await tx.approvalStep.create({ data: { requestId: created.id, stepOrder: 1, approverOrgId, decision: 'PENDING' } });
    }
    await writeAudit(tx, { entityType: 'Request', entityId: created.id, action: submit ? 'RequestSubmitted' : 'RequestCreated', newValue: created.requestCode, performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId, reason: input.purpose });
    if (submit && approverOrgId) {
      await notify({ eventKey: `request:${created.id}:SUBMITTED`, kind: 'REQUEST_SUBMITTED', title: 'New vehicle request', body: `Request ${created.requestCode} needs your decision.`, href: `/requests`, recipientOrgId: approverOrgId, recipientRole: 'DEPT_OFFICER' }, tx);
    }
    return created;
  });

  await recordCloudEvent({ level: 'info', category: 'ops', action: 'create-request', status: 'succeeded', message: 'Request created.', details: { requestId: request.id } });
  invalidate();
  return buildView(request.id, user);
}

export async function updateRequest(user: SessionUser, id: string, patch: Partial<Omit<RequestInputParsed, 'submit'>>, correlationId: string): Promise<AssetRequestView> {
  const request = await loadRequest(id);
  await assertRequestAccess(user, request);
  if (request.requesterUsername !== user.username) throw new DomainError('Only the requester may edit this request.', 403);
  if (!['DRAFT', 'CHANGES_REQUESTED'].includes(request.state)) throw new DomainError('Only draft or changes-requested requests can be edited.', 409);

  const data: Prisma.AssetRequestUpdateInput = {};
  if (patch.purpose !== undefined) data.purpose = patch.purpose;
  if (patch.destination !== undefined) data.destination = patch.destination ?? null;
  if (patch.passengers !== undefined) data.passengers = patch.passengers;
  if (patch.requestedClass !== undefined) data.requestedClass = patch.requestedClass;
  if (patch.accountableOfficer !== undefined) data.accountableOfficer = patch.accountableOfficer;
  if (patch.accountablePhone !== undefined) data.accountablePhone = patch.accountablePhone ?? null;
  if (patch.contactPhone !== undefined) data.contactPhone = patch.contactPhone ?? null;
  if (patch.startAt !== undefined) data.startAt = new Date(patch.startAt);
  if (patch.endAt !== undefined) data.endAt = new Date(patch.endAt);

  await prisma.$transaction(async (tx) => {
    await tx.assetRequest.update({ where: { id }, data });
    await writeAudit(tx, { entityType: 'Request', entityId: id, action: 'RequestUpdated', performedBy: user.username, performedByRole: user.role, organizationId: request.requestingOrgId, correlationId });
  });
  invalidate();
  return buildView(id, user);
}

export async function submitRequest(user: SessionUser, id: string, correlationId: string): Promise<AssetRequestView> {
  const request = await loadRequest(id);
  await assertRequestAccess(user, request);
  if (request.requesterUsername !== user.username) throw new DomainError('Only the requester may submit this request.', 403);
  if (!['DRAFT', 'CHANGES_REQUESTED'].includes(request.state)) throw new DomainError('Only draft or changes-requested requests can be submitted.', 409);
  if (!request.approverOrgId) throw new DomainError('Request has no resolved approver organization.', 409);

  await prisma.$transaction(async (tx) => {
    await tx.assetRequest.update({ where: { id }, data: { state: 'SUBMITTED', submittedAt: new Date() } });
    const existingStep = await tx.approvalStep.findFirst({ where: { requestId: id, decision: 'PENDING' } });
    if (!existingStep) {
      const count = await tx.approvalStep.count({ where: { requestId: id } });
      await tx.approvalStep.create({ data: { requestId: id, stepOrder: count + 1, approverOrgId: request.approverOrgId as string, decision: 'PENDING' } });
    }
    await writeAudit(tx, { entityType: 'Request', entityId: id, action: 'RequestSubmitted', performedBy: user.username, performedByRole: user.role, organizationId: request.requestingOrgId, correlationId });
    await notify({ eventKey: `request:${id}:SUBMITTED:${Date.now()}`, kind: 'REQUEST_SUBMITTED', title: 'Vehicle request submitted', body: `Request ${request.requestCode} needs your decision.`, href: `/requests`, recipientOrgId: request.approverOrgId, recipientRole: 'DEPT_OFFICER' }, tx);
  });
  invalidate();
  return buildView(id, user);
}

export async function startReview(user: SessionUser, id: string, correlationId: string): Promise<AssetRequestView> {
  const request = await loadRequest(id);
  await assertDecider(user, request);
  if (request.state !== 'SUBMITTED') throw new DomainError('Only a submitted request can move to review.', 409);
  await prisma.$transaction(async (tx) => {
    await tx.assetRequest.update({ where: { id }, data: { state: 'UNDER_REVIEW' } });
    await writeAudit(tx, { entityType: 'Request', entityId: id, action: 'RequestUnderReview', performedBy: user.username, performedByRole: user.role, organizationId: request.approverOrgId, correlationId });
  });
  invalidate();
  return buildView(id, user);
}

/** The caller must be a DEPT_OFFICER of the approver org (and not the requester unless self-approval allowed). */
async function assertDecider(user: SessionUser, request: AssetRequest): Promise<void> {
  if (user.role !== 'DEPT_OFFICER') throw new DomainError('Only a department officer may decide requests.', 403);
  if (!request.approverOrgId) throw new DomainError('Request has no resolved approver organization.', 409);
  const tree = await orgTree(user);
  if (tree !== null && !tree.includes(request.approverOrgId)) {
    throw new DomainError('Request not found.', 404);
  }
}

// ---------------------------------------------------------------------------
// Approve (transaction: lock vehicle, re-check, insert Allocation, idempotent)
// ---------------------------------------------------------------------------

export async function approveRequest(user: SessionUser, id: string, comment: string | undefined, correlationId: string): Promise<AssetRequestView> {
  const request = await loadRequest(id);
  await assertDecider(user, request);

  const settings = await loadSettings();
  if (!settings.allowSelfApproval && request.requesterUsername === user.username) {
    throw new DomainError('You cannot approve your own request.', 403, 'SELF_APPROVAL');
  }
  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(request.state)) {
    // Idempotent: a repeat approve on an already-APPROVED request returns the same allocation.
    if (request.state === 'APPROVED') return buildView(id, user);
    throw new DomainError(`Cannot approve a request in state ${request.state}.`, 409);
  }
  if (!request.vehicleId) throw new DomainError('A specific vehicle must be chosen before approval.', 409);

  const now = new Date();
  const vehicleId = request.vehicleId;

  try {
    await prisma.$transaction(async (tx) => {
      // Idempotency inside the transaction: re-read under lock.
      const fresh = await tx.assetRequest.findUniqueOrThrow({ where: { id } });
      if (fresh.state === 'APPROVED') return;

      // Row-lock the vehicle to serialise concurrent approvals.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Vehicle" WHERE id = ${vehicleId} FOR UPDATE`);

      // Re-run eligibility + availability inside the transaction.
      const eligibility = await evaluateEligibility(vehicleId, tx, settings, now);
      if (eligibility.state !== 'ELIGIBLE') {
        throw new DomainError(`Vehicle is no longer eligible: ${eligibility.state}.`, 409, 'NOT_ELIGIBLE');
      }
      const availability = await computeAvailability(vehicleId, fresh.startAt, fresh.endAt, tx, settings, now);
      if (availability.state !== 'AVAILABLE') {
        throw new DomainError('Vehicle is no longer available.', 409, 'NOT_AVAILABLE');
      }

      const allocationCode = await nextAllocationCode(tx);
      // The DB EXCLUDE constraint is the final guard; a violation surfaces as P2010/23P01.
      await tx.allocation.create({
        data: { allocationCode, requestId: id, vehicleId, startAt: fresh.startAt, endAt: fresh.endAt, lifecycle: 'RESERVED', createdBy: user.username }
      });

      await tx.assetRequest.update({ where: { id }, data: { state: 'APPROVED', decidedAt: now, decisionReason: comment ?? null } });
      await tx.approvalStep.updateMany({ where: { requestId: id, decision: 'PENDING' }, data: { decision: 'APPROVED', decidedBy: user.username, decidedByRole: user.role, comment: comment ?? null, decidedAt: now } });

      await writeAudit(tx, { entityType: 'Request', entityId: id, action: 'RequestApproved', fieldName: 'state', oldValue: fresh.state, newValue: 'APPROVED', performedBy: user.username, performedByRole: user.role, organizationId: request.approverOrgId, correlationId, reason: comment });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2010' || error.code === 'P2002' || String(error.message).includes('allocation_no_overlap'))
    ) {
      throw new DomainError('Vehicle is no longer available.', 409, 'NOT_AVAILABLE');
    }
    if (error instanceof Prisma.PrismaClientUnknownRequestError && String(error.message).includes('allocation_no_overlap')) {
      throw new DomainError('Vehicle is no longer available.', 409, 'NOT_AVAILABLE');
    }
    throw error;
  }

  // Notifications after commit.
  await notify({ eventKey: `request:${id}:APPROVED`, kind: 'REQUEST_APPROVED', title: 'Request approved', body: `Request ${request.requestCode} was approved and reserved.`, href: `/requests`, recipientUsername: request.requesterUsername });
  await recordCloudEvent({ level: 'info', category: 'ops', action: 'approve-request', status: 'succeeded', message: 'Request approved.', details: { requestId: id } });
  invalidate();
  return buildView(id, user);
}

export async function rejectRequest(user: SessionUser, id: string, reason: string, correlationId: string): Promise<AssetRequestView> {
  const request = await loadRequest(id);
  await assertDecider(user, request);
  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(request.state)) throw new DomainError(`Cannot reject a request in state ${request.state}.`, 409);
  await prisma.$transaction(async (tx) => {
    await tx.assetRequest.update({ where: { id }, data: { state: 'REJECTED', decidedAt: new Date(), decisionReason: reason } });
    await tx.approvalStep.updateMany({ where: { requestId: id, decision: 'PENDING' }, data: { decision: 'REJECTED', decidedBy: user.username, decidedByRole: user.role, comment: reason, decidedAt: new Date() } });
    await writeAudit(tx, { entityType: 'Request', entityId: id, action: 'RequestRejected', fieldName: 'state', oldValue: request.state, newValue: 'REJECTED', performedBy: user.username, performedByRole: user.role, organizationId: request.approverOrgId, correlationId, reason });
    await notify({ eventKey: `request:${id}:REJECTED`, kind: 'REQUEST_REJECTED', title: 'Request rejected', body: `Request ${request.requestCode} was rejected.`, href: `/requests`, recipientUsername: request.requesterUsername }, tx);
  });
  invalidate();
  return buildView(id, user);
}

export async function requestChanges(user: SessionUser, id: string, comment: string, correlationId: string): Promise<AssetRequestView> {
  const request = await loadRequest(id);
  await assertDecider(user, request);
  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(request.state)) throw new DomainError(`Cannot request changes on a request in state ${request.state}.`, 409);
  await prisma.$transaction(async (tx) => {
    await tx.assetRequest.update({ where: { id }, data: { state: 'CHANGES_REQUESTED', decisionReason: comment } });
    await tx.approvalStep.updateMany({ where: { requestId: id, decision: 'PENDING' }, data: { decision: 'CHANGES_REQUESTED', decidedBy: user.username, decidedByRole: user.role, comment, decidedAt: new Date() } });
    await writeAudit(tx, { entityType: 'Request', entityId: id, action: 'RequestChangesRequested', performedBy: user.username, performedByRole: user.role, organizationId: request.approverOrgId, correlationId, reason: comment });
    await notify({ eventKey: `request:${id}:CHANGES:${Date.now()}`, kind: 'REQUEST_CHANGES', title: 'Changes requested', body: `Changes requested on ${request.requestCode}.`, href: `/requests`, recipientUsername: request.requesterUsername }, tx);
  });
  invalidate();
  return buildView(id, user);
}

export async function escalateRequest(user: SessionUser, id: string, comment: string | undefined, correlationId: string): Promise<AssetRequestView> {
  const request = await loadRequest(id);
  await assertDecider(user, request);
  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(request.state)) throw new DomainError(`Cannot escalate a request in state ${request.state}.`, 409);
  if (!request.approverOrgId) throw new DomainError('Request has no approver organization.', 409);
  const parent = await parentOrgId(request.approverOrgId);
  if (!parent) throw new DomainError('No parent organization to escalate to.', 409);

  await prisma.$transaction(async (tx) => {
    const count = await tx.approvalStep.count({ where: { requestId: id } });
    await tx.approvalStep.updateMany({ where: { requestId: id, decision: 'PENDING' }, data: { decision: 'ESCALATED', decidedBy: user.username, decidedByRole: user.role, comment: comment ?? null, decidedAt: new Date() } });
    await tx.approvalStep.create({ data: { requestId: id, stepOrder: count + 1, approverOrgId: parent, decision: 'PENDING' } });
    await tx.assetRequest.update({ where: { id }, data: { state: 'SUBMITTED', approverOrgId: parent } });
    await writeAudit(tx, { entityType: 'Request', entityId: id, action: 'RequestEscalated', fieldName: 'approverOrgId', oldValue: request.approverOrgId, newValue: parent, performedBy: user.username, performedByRole: user.role, organizationId: request.approverOrgId, correlationId, reason: comment });
    await notify({ eventKey: `request:${id}:ESCALATED:${parent}`, kind: 'REQUEST_ESCALATED', title: 'Request escalated', body: `Request ${request.requestCode} escalated to the parent organization.`, href: `/requests`, recipientOrgId: parent, recipientRole: 'DEPT_OFFICER' }, tx);
  });
  invalidate();
  return buildView(id, user);
}

export async function cancelRequest(user: SessionUser, id: string, reason: string | undefined, correlationId: string): Promise<AssetRequestView> {
  const request = await loadRequest(id);
  await assertRequestAccess(user, request);
  const isRequester = request.requesterUsername === user.username;
  if (!isRequester && user.role !== 'DEPT_OFFICER' && user.role !== 'ORG_ADMIN') {
    throw new DomainError('You cannot cancel this request.', 403);
  }
  if (['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(request.state)) {
    throw new DomainError(`Cannot cancel a request in state ${request.state}.`, 409);
  }
  await prisma.$transaction(async (tx) => {
    await tx.assetRequest.update({ where: { id }, data: { state: 'CANCELLED', decidedAt: new Date(), decisionReason: reason ?? null } });
    await tx.approvalStep.updateMany({ where: { requestId: id, decision: 'PENDING' }, data: { decision: 'SKIPPED', decidedAt: new Date() } });
    await writeAudit(tx, { entityType: 'Request', entityId: id, action: 'RequestCancelled', fieldName: 'state', oldValue: request.state, newValue: 'CANCELLED', performedBy: user.username, performedByRole: user.role, organizationId: request.requestingOrgId, correlationId, reason });
  });
  invalidate();
  return buildView(id, user);
}

// ---------------------------------------------------------------------------
// Expiry (sync job + lazy check)
// ---------------------------------------------------------------------------

export async function expireStaleRequests(now: Date = new Date(), tx: TxClient = prisma): Promise<number> {
  const settings = await loadSettings(tx);
  const cutoff = new Date(now.getTime() - settings.requestExpiryHours * 3600000);
  const stale = await tx.assetRequest.findMany({
    where: {
      state: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
      OR: [{ submittedAt: { lt: cutoff } }, { startAt: { lt: now } }]
    },
    select: { id: true, requestingOrgId: true }
  });
  let count = 0;
  for (const r of stale) {
    await tx.assetRequest.update({ where: { id: r.id }, data: { state: 'EXPIRED', decidedAt: now, decisionReason: 'Expired (unreviewed or start time passed)' } });
    await tx.approvalStep.updateMany({ where: { requestId: r.id, decision: 'PENDING' }, data: { decision: 'SKIPPED', decidedAt: now } });
    await writeAudit(tx, { entityType: 'Request', entityId: r.id, action: 'RequestExpired', newValue: 'EXPIRED', performedBy: 'system', performedByRole: 'ADMIN', organizationId: r.requestingOrgId, reason: 'Request expiry job' });
    count += 1;
  }
  if (count) invalidate();
  return count;
}

// ---------------------------------------------------------------------------
// Dispatcher + reads
// ---------------------------------------------------------------------------

export async function getRequestView(user: SessionUser, id: string): Promise<AssetRequestView> {
  const request = await loadRequest(id);
  await assertRequestAccess(user, request);
  return buildView(id, user);
}

export { buildView as buildRequestView };

// Referenced for typing only.
export type { VehicleClass };
