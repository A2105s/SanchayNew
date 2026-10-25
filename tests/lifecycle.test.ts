import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSettings, createOrg, createStation, createUser, createVehicle, cleanupOrgs } from './helpers';
import { createRequest, approveRequest, submitRequest } from '@/lib/cloud/ops/requests';
import {
  recordHandover,
  recordReturn,
  inspect,
  prepareHandover,
  cancelAllocation,
  requestExtension,
  decideExtension
} from '@/lib/cloud/ops/allocations';
import { evaluateEligibility } from '@/lib/cloud/eligibility';
import { DomainError } from '@/lib/cloud/errors';

const CID = 'test-correlation';

async function futureWindow(startOffsetHours: number, durationHours: number) {
  const start = new Date(Date.now() + startOffsetHours * 3600000);
  const end = new Date(start.getTime() + durationHours * 3600000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

test('eligible vehicle full lifecycle: request -> approve -> handover -> return -> inspect -> closed', async () => {
  await ensureSettings({ allowSelfApproval: false, requireInspectionOnReturn: true });
  const org = await createOrg();
  try {
    const station = await createStation(org.id);
    const vehicleId = await createVehicle({ organizationId: org.id, stationId: station });
    const requester = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: station });
    const approver = await createUser({ role: 'DEPT_OFFICER', organizationId: org.id });

    const { startAt, endAt } = await futureWindow(24, 4);
    const req = await createRequest(requester, { vehicleId, requestedClass: 'VAN', purpose: 'Patrol', passengers: 2, startAt, endAt, accountableOfficer: 'Officer A', submit: true }, null, CID);
    assert.equal(req.state, 'SUBMITTED');

    const approved = await approveRequest(approver, req.id, 'ok', CID);
    assert.equal(approved.state, 'APPROVED');
    assert.ok(approved.allocationId, 'allocation created on approval');
    const allocId = approved.allocationId as string;

    let alloc = await prisma.allocation.findUniqueOrThrow({ where: { id: allocId } });
    assert.equal(alloc.lifecycle, 'RESERVED');

    await prepareHandover(approver, allocId, CID);
    await recordHandover(approver, allocId, { receivedBy: 'Driver', conditionNotes: 'ok', checklist: [{ item: 'tyre', present: true }] }, CID);
    alloc = await prisma.allocation.findUniqueOrThrow({ where: { id: allocId } });
    assert.equal(alloc.lifecycle, 'ACTIVE');

    await recordReturn(approver, allocId, { receivedBy: 'Officer', conditionNotes: 'returned' }, CID);
    alloc = await prisma.allocation.findUniqueOrThrow({ where: { id: allocId } });
    assert.equal(alloc.lifecycle, 'RETURNED_PENDING_INSPECTION');

    const inspected = await inspect(approver, allocId, 'ACCEPTED', 'clean', CID);
    assert.equal(inspected.lifecycle, 'COMPLETED');
  } finally {
    await cleanupOrgs([org.id]);
  }
});

test('approved does NOT mean handed over: allocation starts RESERVED, not ACTIVE', async () => {
  await ensureSettings();
  const org = await createOrg();
  try {
    const station = await createStation(org.id);
    const vehicleId = await createVehicle({ organizationId: org.id, stationId: station });
    const requester = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: station });
    const approver = await createUser({ role: 'DEPT_OFFICER', organizationId: org.id });
    const { startAt, endAt } = await futureWindow(24, 4);
    const req = await createRequest(requester, { vehicleId, requestedClass: 'VAN', purpose: 'Duty', passengers: 1, startAt, endAt, accountableOfficer: 'A', submit: true }, null, CID);
    const approved = await approveRequest(approver, req.id, undefined, CID);
    const alloc = await prisma.allocation.findUniqueOrThrow({ where: { id: approved.allocationId as string } });
    assert.equal(alloc.lifecycle, 'RESERVED');
    assert.notEqual(alloc.lifecycle, 'ACTIVE');
  } finally {
    await cleanupOrgs([org.id]);
  }
});

test('seized, unverified and restricted vehicles are rejected by the backend', async () => {
  await ensureSettings();
  const org = await createOrg();
  try {
    const requester = await createUser({ role: 'STATION_OFFICER', organizationId: org.id });
    const { startAt, endAt } = await futureWindow(24, 4);

    const seized = await createVehicle({ organizationId: org.id, ownershipCategory: 'SEIZED_IMPOUNDED', operationalStatus: 'OUT_OF_SERVICE' });
    await assert.rejects(
      () => createRequest(requester, { vehicleId: seized, requestedClass: 'VAN', purpose: 'x', passengers: 1, startAt, endAt, accountableOfficer: 'A', submit: true }, null, CID),
      (err) => err instanceof DomainError && err.status === 409
    );
    const seizedElig = await evaluateEligibility(seized, prisma);
    assert.equal(seizedElig.state, 'INELIGIBLE');

    const unverified = await createVehicle({ organizationId: org.id, ownershipCategory: 'OTHER_UNVERIFIED', verifyOwnership: false });
    await assert.rejects(() => createRequest(requester, { vehicleId: unverified, requestedClass: 'VAN', purpose: 'x', passengers: 1, startAt, endAt, accountableOfficer: 'A', submit: true }, null, CID));

    const restricted = await createVehicle({ organizationId: org.id, restriction: { type: 'COURT_ORDER', reasonCode: 'HOLD', authority: 'Court' } });
    const restrictedElig = await evaluateEligibility(restricted, prisma);
    assert.equal(restrictedElig.state, 'RESTRICTED');
    await assert.rejects(() => createRequest(requester, { vehicleId: restricted, requestedClass: 'VAN', purpose: 'x', passengers: 1, startAt, endAt, accountableOfficer: 'A', submit: true }, null, CID));
  } finally {
    await cleanupOrgs([org.id]);
  }
});

test('two concurrent overlapping approvals race -> exactly one allocation', async () => {
  await ensureSettings();
  const org = await createOrg();
  try {
    const station = await createStation(org.id);
    const vehicleId = await createVehicle({ organizationId: org.id, stationId: station });
    const requesterA = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: station });
    const requesterB = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: station });
    const approver = await createUser({ role: 'DEPT_OFFICER', organizationId: org.id });

    const { startAt, endAt } = await futureWindow(48, 6);
    const reqA = await createRequest(requesterA, { vehicleId, requestedClass: 'VAN', purpose: 'A', passengers: 1, startAt, endAt, accountableOfficer: 'A', submit: true }, null, CID);
    const reqB = await createRequest(requesterB, { vehicleId, requestedClass: 'VAN', purpose: 'B', passengers: 1, startAt, endAt, accountableOfficer: 'B', submit: true }, null, CID);

    const results = await Promise.allSettled([
      approveRequest(approver, reqA.id, undefined, CID),
      approveRequest(approver, reqB.id, undefined, CID)
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;
    assert.equal(fulfilled, 1, 'exactly one approval succeeds');
    assert.equal(rejected, 1, 'the other is rejected');

    const allocs = await prisma.allocation.findMany({ where: { vehicleId, lifecycle: { notIn: ['CANCELLED', 'COMPLETED'] } } });
    assert.equal(allocs.length, 1, 'exactly one live allocation exists');
  } finally {
    await cleanupOrgs([org.id]);
  }
});

test('extension overlapping a later reservation is rejected', async () => {
  await ensureSettings();
  const org = await createOrg();
  try {
    const station = await createStation(org.id);
    const vehicleId = await createVehicle({ organizationId: org.id, stationId: station });
    const requester = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: station });
    const approver = await createUser({ role: 'DEPT_OFFICER', organizationId: org.id });

    // First allocation: hours 24-28.
    const w1 = await futureWindow(24, 4);
    const r1 = await createRequest(requester, { vehicleId, requestedClass: 'VAN', purpose: '1', passengers: 1, startAt: w1.startAt, endAt: w1.endAt, accountableOfficer: 'A', submit: true }, null, CID);
    const a1 = await approveRequest(approver, r1.id, undefined, CID);

    // Second allocation: hours 30-34 (later reservation).
    const w2 = await futureWindow(30, 4);
    const r2 = await createRequest(requester, { vehicleId, requestedClass: 'VAN', purpose: '2', passengers: 1, startAt: w2.startAt, endAt: w2.endAt, accountableOfficer: 'A', submit: true }, null, CID);
    await approveRequest(approver, r2.id, undefined, CID);

    // Extend first to hour 32 -> overlaps the second.
    const newEnd = new Date(Date.now() + 32 * 3600000).toISOString();
    await requestExtension(requester, a1.allocationId as string, newEnd, 'need more time', CID);
    const ext = await prisma.extensionRequest.findFirstOrThrow({ where: { allocationId: a1.allocationId as string } });
    await assert.rejects(
      () => decideExtension(approver, a1.allocationId as string, ext.id, 'APPROVED', undefined, CID),
      (err) => err instanceof DomainError && err.status === 409
    );
  } finally {
    await cleanupOrgs([org.id]);
  }
});

test('illegal transitions rejected: return of never-handed-over allocation, activate cancelled', async () => {
  await ensureSettings();
  const org = await createOrg();
  try {
    const station = await createStation(org.id);
    const vehicleId = await createVehicle({ organizationId: org.id, stationId: station });
    const requester = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: station });
    const approver = await createUser({ role: 'DEPT_OFFICER', organizationId: org.id });
    const { startAt, endAt } = await futureWindow(24, 4);
    const req = await createRequest(requester, { vehicleId, requestedClass: 'VAN', purpose: 'x', passengers: 1, startAt, endAt, accountableOfficer: 'A', submit: true }, null, CID);
    const approved = await approveRequest(approver, req.id, undefined, CID);
    const allocId = approved.allocationId as string;

    // Return of a RESERVED (never handed over) allocation must fail.
    await assert.rejects(
      () => recordReturn(approver, allocId, { receivedBy: 'x', conditionNotes: 'x' }, CID),
      (err) => err instanceof DomainError && err.status === 409
    );

    // Cancel it, then any further transition fails.
    await cancelAllocation(approver, allocId, 'test cancel', CID);
    await assert.rejects(
      () => prepareHandover(approver, allocId, CID),
      (err) => err instanceof DomainError && err.status === 409
    );
  } finally {
    await cleanupOrgs([org.id]);
  }
});

test('requester cannot approve own request (separation of duties)', async () => {
  await ensureSettings({ allowSelfApproval: false });
  const org = await createOrg();
  try {
    const station = await createStation(org.id);
    const vehicleId = await createVehicle({ organizationId: org.id, stationId: station });
    // A DEPT_OFFICER who is also the requester.
    const officer = await createUser({ role: 'DEPT_OFFICER', organizationId: org.id });
    const { startAt, endAt } = await futureWindow(24, 4);
    const req = await createRequest(officer, { vehicleId, requestedClass: 'VAN', purpose: 'x', passengers: 1, startAt, endAt, accountableOfficer: 'A', submit: true }, null, CID);
    await assert.rejects(
      () => approveRequest(officer, req.id, undefined, CID),
      (err) => err instanceof DomainError && err.status === 403 && err.code === 'SELF_APPROVAL'
    );
  } finally {
    await cleanupOrgs([org.id]);
  }
});

test('idempotent approve returns the same allocation', async () => {
  await ensureSettings();
  const org = await createOrg();
  try {
    const station = await createStation(org.id);
    const vehicleId = await createVehicle({ organizationId: org.id, stationId: station });
    const requester = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: station });
    const approver = await createUser({ role: 'DEPT_OFFICER', organizationId: org.id });
    const { startAt, endAt } = await futureWindow(24, 4);
    const req = await createRequest(requester, { vehicleId, requestedClass: 'VAN', purpose: 'x', passengers: 1, startAt, endAt, accountableOfficer: 'A', submit: true }, null, CID);
    const first = await approveRequest(approver, req.id, undefined, CID);
    const second = await approveRequest(approver, req.id, undefined, CID);
    assert.equal(first.allocationId, second.allocationId);
    const allocs = await prisma.allocation.findMany({ where: { requestId: req.id } });
    assert.equal(allocs.length, 1);
  } finally {
    await cleanupOrgs([org.id]);
  }
});

test('submit lazily requires requester; startReview requires DEPT_OFFICER of approver org', async () => {
  await ensureSettings();
  const org = await createOrg();
  try {
    const station = await createStation(org.id);
    const vehicleId = await createVehicle({ organizationId: org.id, stationId: station });
    const requester = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: station });
    const { startAt, endAt } = await futureWindow(24, 4);
    const draft = await createRequest(requester, { vehicleId, requestedClass: 'VAN', purpose: 'x', passengers: 1, startAt, endAt, accountableOfficer: 'A' }, null, CID);
    assert.equal(draft.state, 'DRAFT');
    const submitted = await submitRequest(requester, draft.id, CID);
    assert.equal(submitted.state, 'SUBMITTED');
  } finally {
    await cleanupOrgs([org.id]);
  }
});
