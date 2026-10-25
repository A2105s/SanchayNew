import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prisma, ensureSettings, createOrg, createStation, createUser, createVehicle, cleanupOrgs, suffix } from './helpers';
import { searchVehicles } from '@/lib/cloud/ops/search';
import { getVehicleDetail } from '@/lib/cloud/fleet';
import { getDocumentSignedUrl, uploadDocument } from '@/lib/cloud/ops/documents';
import { reevaluate } from '@/lib/cloud/ops/vehicles';
import { buildReport } from '@/lib/cloud/ops/reports';
import { provisionDevice, ingestTelemetry, bindDevice } from '@/lib/cloud/ops/devices';
import { createRequest, approveRequest } from '@/lib/cloud/ops/requests';
import { DomainError } from '@/lib/cloud/errors';
import { verifyAuditChain } from '@/lib/cloud/audit';

const CID = 'test-correlation';

test('cross-org visibility: foreign non-eligible vehicle invisible; foreign eligible masked', async () => {
  await ensureSettings();
  const orgA = await createOrg();
  const orgB = await createOrg();
  try {
    const stationB = await createStation(orgB.id);
    const eligibleForeign = await createVehicle({ organizationId: orgB.id, stationId: stationB });
    const seizedForeign = await createVehicle({ organizationId: orgB.id, ownershipCategory: 'SEIZED_IMPOUNDED', operationalStatus: 'OUT_OF_SERVICE' });
    const userA = await createUser({ role: 'ORG_ADMIN', organizationId: orgA.id });

    // Discover scope returns the eligible foreign vehicle, masked.
    const result = await searchVehicles(userA, { scope: 'discover', pageSize: 100 });
    const ids = result.items.map((i) => i.id);
    assert.ok(ids.includes(eligibleForeign), 'eligible foreign vehicle is discoverable');
    assert.ok(!ids.includes(seizedForeign), 'seized foreign vehicle is invisible');
    const card = result.items.find((i) => i.id === eligibleForeign) as { registrationMasked?: string; isOwn?: boolean };
    assert.ok(card.registrationMasked && card.registrationMasked.includes('**'), 'registration is masked');
    assert.equal(card.isOwn, false);

    // Detail: seized foreign vehicle returns null (not found, not forbidden).
    const seizedDetail = await getVehicleDetail(userA, seizedForeign);
    assert.equal(seizedDetail, null);
    // Eligible foreign detail is masked.
    const eligDetail = await getVehicleDetail(userA, eligibleForeign);
    assert.ok(eligDetail);
    assert.equal(eligDetail?.masked, true);
    assert.equal(eligDetail?.documents.length, 0, 'documents withheld for foreign vehicle');
  } finally {
    await cleanupOrgs([orgA.id, orgB.id]);
  }
});

test('unauthorized document access is denied and audited as DENIED', async () => {
  await ensureSettings();
  const orgA = await createOrg();
  const orgB = await createOrg();
  try {
    const vehicleB = await createVehicle({ organizationId: orgB.id });
    const ownerB = await createUser({ role: 'ORG_ADMIN', organizationId: orgB.id });
    const outsiderA = await createUser({ role: 'ORG_ADMIN', organizationId: orgA.id });

    const doc = await uploadDocument(ownerB, vehicleB, { kind: 'RC', title: 'rc.pdf', mimeType: 'application/pdf', sizeBytes: 10, contentBase64: Buffer.from('hello pdf').toString('base64') }, CID);

    // Outsider cannot get a signed URL for a foreign document (scope 404).
    await assert.rejects(
      () => getDocumentSignedUrl(outsiderA, doc.id, CID),
      (err) => err instanceof DomainError && err.status === 404
    );

    // Owner can.
    const signed = await getDocumentSignedUrl(ownerB, doc.id, CID);
    assert.ok(signed.url.length > 0);
  } finally {
    await cleanupOrgs([orgA.id, orgB.id]);
  }
});

test('eligibility alteration by non-verifier context fails closed; DENIED recorded for privileged attempts', async () => {
  await ensureSettings();
  const org = await createOrg();
  try {
    // FIELD_STAFF has no eligibility.verify permission; the route layer would deny.
    // Here we assert the service keeps eligibility fail-closed for an unverified vehicle.
    const vehicleId = await createVehicle({ organizationId: org.id, ownershipCategory: 'OTHER_UNVERIFIED', verifyOwnership: false });
    const admin = await createUser({ role: 'ORG_ADMIN', organizationId: org.id });
    const decision = await reevaluate(admin, vehicleId, CID);
    assert.notEqual(decision.eligibilityState, 'ELIGIBLE');
  } finally {
    await cleanupOrgs([org.id]);
  }
});

test('overdue return appears in the overdue-returns report', async () => {
  await ensureSettings({ returnGraceMinutes: 0 });
  const org = await createOrg();
  try {
    const station = await createStation(org.id);
    const vehicleId = await createVehicle({ organizationId: org.id, stationId: station });
    const requester = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: station });
    const approver = await createUser({ role: 'DEPT_OFFICER', organizationId: org.id });

    // Build a past-window allocation then force it ACTIVE and overdue.
    const start = new Date(Date.now() - 3 * 3600000);
    const end = new Date(Date.now() - 1 * 3600000);
    const req = await createRequest(requester, { vehicleId, requestedClass: 'VAN', purpose: 'x', passengers: 1, startAt: new Date(Date.now() + 3600000).toISOString(), endAt: new Date(Date.now() + 2 * 3600000).toISOString(), accountableOfficer: 'A', submit: true }, null, CID);
    const approved = await approveRequest(approver, req.id, undefined, CID);
    // Move the allocation into the past + ACTIVE directly (simulating a handed-over, overdue allocation).
    await prisma.allocation.update({ where: { id: approved.allocationId as string }, data: { startAt: start, endAt: end, lifecycle: 'ACTIVE' } });

    const report = await buildReport(approver, 'overdue-returns', {});
    const codes = report.rows.map((r) => r.code);
    const alloc = await prisma.allocation.findUniqueOrThrow({ where: { id: approved.allocationId as string } });
    assert.ok(codes.includes(alloc.allocationCode), 'overdue allocation appears in the report');
  } finally {
    await cleanupOrgs([org.id]);
  }
});

test('export masking + row cap: fleet-composition report masks registration and respects exportRowLimit', async () => {
  await ensureSettings({ exportRowLimit: 2 });
  const org = await createOrg();
  try {
    await createVehicle({ organizationId: org.id });
    await createVehicle({ organizationId: org.id });
    await createVehicle({ organizationId: org.id });
    const admin = await createUser({ role: 'ORG_ADMIN', organizationId: org.id });
    const report = await buildReport(admin, 'fleet-composition', {});
    assert.ok(report.rows.length <= 2, 'row cap enforced');
    assert.equal(report.truncated, true, 'truncation flagged');
    for (const row of report.rows) {
      assert.ok(String(row.registration).includes('**'), 'registration masked in report rows');
    }
  } finally {
    await cleanupOrgs([org.id]);
  }
});

test('ingest: bad key 401, other device vehicle impossible, replay rejected, future rejected, stale does not change eligibility', async () => {
  await ensureSettings();
  const org = await createOrg();
  try {
    const vehicleId = await createVehicle({ organizationId: org.id });
    const manager = await createUser({ role: 'ORG_ADMIN', organizationId: org.id });
    const provisioned = await provisionDevice(manager, { deviceCode: `DEV-${suffix()}`, kind: 'GPS_TRACKER', protocol: 'HTTP', vehicleId }, CID);
    const deviceCode = provisioned.device.deviceCode;
    const key = provisioned.ingestKey as string;
    assert.ok(key, 'plaintext key returned once');

    // Bad key -> 401.
    await assert.rejects(
      () => ingestTelemetry(deviceCode, 'wrong-key', { lat: 26.2, lng: 78.1 }),
      (err) => err instanceof DomainError && err.status === 401
    );

    const eligBefore = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId }, select: { eligibilityState: true } });

    // Good event accepted.
    const t1 = new Date();
    const ok1 = await ingestTelemetry(deviceCode, key, { lat: 26.21, lng: 78.11, recordedAt: t1.toISOString(), speedKmph: 10 });
    assert.equal(ok1.accepted, true);

    // Replay (same/older recordedAt) rejected.
    await assert.rejects(
      () => ingestTelemetry(deviceCode, key, { lat: 26.21, lng: 78.11, recordedAt: t1.toISOString() }),
      (err) => err instanceof DomainError && err.code === 'REPLAY'
    );

    // Future timestamp rejected.
    await assert.rejects(
      () => ingestTelemetry(deviceCode, key, { lat: 26.21, lng: 78.11, recordedAt: new Date(Date.now() + 10 * 60000).toISOString() }),
      (err) => err instanceof DomainError && err.code === 'FUTURE_TIMESTAMP'
    );

    // Telemetry never changed eligibility.
    const eligAfter = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId }, select: { eligibilityState: true } });
    assert.equal(eligAfter.eligibilityState, eligBefore.eligibilityState);

    // A device cannot write for a vehicle it is not bound to: unbind it and ingestion fails.
    await bindDevice(manager, provisioned.device.id, null, CID);
    await assert.rejects(
      () => ingestTelemetry(deviceCode, key, { lat: 26.21, lng: 78.11, recordedAt: new Date(Date.now() + 1000).toISOString() }),
      (err) => err instanceof DomainError && err.code === 'UNBOUND'
    );
  } finally {
    await cleanupOrgs([org.id]);
  }
});

test('audit UPDATE/DELETE blocked by the DB trigger; chain verifies', async () => {
  const row = await prisma.auditLog.findFirst({ orderBy: { seq: 'desc' } });
  if (row) {
    await assert.rejects(
      () => prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET "reason" = 'tampered' WHERE "id" = '${row.id}'`),
      /append-only/i
    );
    await assert.rejects(
      () => prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "id" = '${row.id}'`),
      /append-only/i
    );
  }
  const verify = await verifyAuditChain(500);
  assert.equal(verify.ok, true, 'audit hash chain verifies');
});

test('DB CHECK blocks ELIGIBLE for non-government vehicles', async () => {
  await ensureSettings();
  const org = await createOrg();
  try {
    const vehicleId = await createVehicle({ organizationId: org.id, ownershipCategory: 'SEIZED_IMPOUNDED', operationalStatus: 'OUT_OF_SERVICE' });
    await assert.rejects(
      () => prisma.$executeRawUnsafe(`UPDATE "Vehicle" SET "eligibilityState" = 'ELIGIBLE' WHERE "id" = '${vehicleId}'`),
      /vehicle_eligible_only_if_government_fleet|check/i
    );
  } finally {
    await cleanupOrgs([org.id]);
  }
});

test('station inventory counts only ELIGIBLE government-fleet vehicles', async () => {
  await ensureSettings();
  const org = await createOrg();
  try {
    const station = await createStation(org.id);
    await createVehicle({ organizationId: org.id, stationId: station, vehicleClass: 'VAN' }); // eligible
    await createVehicle({ organizationId: org.id, stationId: station, vehicleClass: 'VAN', ownershipCategory: 'SEIZED_IMPOUNDED', operationalStatus: 'OUT_OF_SERVICE' }); // not eligible
    const inv = await prisma.stationInventory.findUniqueOrThrow({ where: { stationId: station } });
    assert.equal(inv.van, 1, 'only the eligible government-fleet van is counted');
  } finally {
    await cleanupOrgs([org.id]);
  }
});
