import test from 'node:test';
import assert from 'node:assert/strict';
import { can } from '@/lib/auth/roles';
import { createSessionToken } from '@/lib/auth/session';
import { GET as getTriage } from '@/app/api/ai/vehicles/readiness-triage/route';
import { POST as postDispatch } from '@/app/api/ai/vehicles/auto-dispatch/route';
import { GET as getStationProfile } from '@/app/api/cloud/station/profile/route';
import { POST as postRequest } from '@/app/api/cloud/requests/route';
import { POST as postVehicleAction } from '@/app/api/cloud/vehicles/[id]/actions/route';
import { NextRequest } from 'next/server';
import { prisma, createOrg, createStation, createUser, createVehicle, cleanupOrgs, disconnect, ensureSettings } from './helpers';

test('AI Fleet Automation & Executive Manager Triage', async (t) => {
  const createdOrgIds: string[] = [];

  t.before(async () => {
    await ensureSettings();
  });

  t.after(async () => {
    await cleanupOrgs(createdOrgIds);
    await disconnect();
  });

  await t.test('verifies strict role permissions: STATION_OFFICER cannot perform restriction.manage', () => {
    // STATION_OFFICER can perform managerial fleet actions: edit, log trip/fuel, raise maintenance, create request
    assert.equal(can('STATION_OFFICER', 'fleet.read'), true);
    assert.equal(can('STATION_OFFICER', 'vehicle.edit'), true);
    assert.equal(can('STATION_OFFICER', 'trip.write'), true);
    assert.equal(can('STATION_OFFICER', 'maintenance.write'), true);
    assert.equal(can('STATION_OFFICER', 'request.create'), true);

    // STATION_OFFICER strictly CANNOT manage restrictions (legal holds, court orders, impounds)
    assert.equal(can('STATION_OFFICER', 'restriction.manage'), false);

    // ADMIN can inspect and manage platform restrictions
    assert.equal(can('ADMIN', 'fleet.read'), true);
    assert.equal(can('ADMIN', 'restriction.manage'), true);
  });

  await t.test('GET /api/ai/vehicles/readiness-triage classifies fleet into mission lanes and generates 1-click action cards', async () => {
    const org = await createOrg();
    createdOrgIds.push(org.id);
    const stationId = await createStation(org.id);

    // 1. Ready vehicle (100% compliant, active, fueled)
    const readyVehId = await createVehicle({
      organizationId: org.id,
      stationId,
      ownershipCategory: 'GOVERNMENT_FLEET',
      operationalStatus: 'ACTIVE',
      eligibleCompliance: true,
      vehicleClass: 'PATROL_CAR'
    });
    await prisma.vehicle.update({
      where: { id: readyVehId },
      data: { fuelPercent: 85, lastSeenAt: new Date() }
    });

    // 2. Attention vehicle (low fuel: 25%)
    const attentionVehId = await createVehicle({
      organizationId: org.id,
      stationId,
      ownershipCategory: 'GOVERNMENT_FLEET',
      operationalStatus: 'ACTIVE',
      eligibleCompliance: true,
      vehicleClass: 'PATROL_CAR'
    });
    await prisma.vehicle.update({
      where: { id: attentionVehId },
      data: { fuelPercent: 25, lastSeenAt: new Date() }
    });

    // 3. Grounded vehicle (expired PUC)
    const groundedVehId = await createVehicle({
      organizationId: org.id,
      stationId,
      ownershipCategory: 'GOVERNMENT_FLEET',
      operationalStatus: 'ACTIVE',
      eligibleCompliance: false, // Expired docs
      vehicleClass: 'PATROL_CAR'
    });

    // Create a STATION_OFFICER attached to this station
    const officer = await createUser({
      role: 'STATION_OFFICER',
      organizationId: org.id,
      stationId
    });
    const officerToken = await createSessionToken(officer);

    // Invoke GET /api/ai/vehicles/readiness-triage as STATION_OFFICER
    const officerReq = new Request('http://localhost:3000/api/ai/vehicles/readiness-triage?refresh=1', {
      headers: { cookie: `sanchay-session=${officerToken}` }
    });
    const officerRes = await getTriage(officerReq);
    assert.equal(officerRes.status, 200);

    const officerJson = await officerRes.json();
    assert.equal(officerJson.success, true);
    const triageData = officerJson.data;

    // Assert 3 visual mission lanes
    assert.ok(triageData.lanes.ready.vehicleIds.includes(readyVehId), 'Ready vehicle placed in Ready lane');
    assert.ok(triageData.lanes.attention.vehicleIds.includes(attentionVehId), 'Low-fuel vehicle placed in Attention lane');
    assert.ok(triageData.lanes.grounded.vehicleIds.includes(groundedVehId), 'Expired vehicle placed in Grounded lane');
    assert.equal(triageData.lanes.ready.count >= 1, true);
    assert.equal(triageData.lanes.attention.count >= 1, true);
    assert.equal(triageData.lanes.grounded.count >= 1, true);

    // Assert 1-click managerial action recommendations generated
    assert.ok(Array.isArray(triageData.actions));
    assert.ok(triageData.actions.length > 0, 'Generates at least one managerial action');
    const compAction = triageData.actions.find((a: { type: string }) => a.type === 'COMPLIANCE_RENEWAL');
    const fuelAction = triageData.actions.find((a: { type: string }) => a.type === 'FUEL_ROUTING');
    assert.ok(compAction || fuelAction, 'Surfaces compliance or fuel 1-click action');

    // Also test ADMIN inspection with explicit stationId
    const admin = await createUser({ role: 'ADMIN', organizationId: null });
    const adminToken = await createSessionToken(admin);
    const adminReq = new Request(`http://localhost:3000/api/ai/vehicles/readiness-triage?stationId=${stationId}&refresh=1`, {
      headers: { cookie: `sanchay-session=${adminToken}` }
    });
    const adminRes = await getTriage(adminReq);
    assert.equal(adminRes.status, 200);
    const adminJson = await adminRes.json();
    assert.equal(adminJson.success, true);
    assert.equal(adminJson.data.stationId, stationId);
  });

  await t.test('POST /api/ai/vehicles/auto-dispatch evaluates candidates and scores suitability for patrol missions', async () => {
    const org = await createOrg();
    createdOrgIds.push(org.id);
    const stationId = await createStation(org.id);

    // Candidate 1: Ideal 7-seater Patrol Car with 90% fuel and assigned driver
    const idealVehId = await createVehicle({
      organizationId: org.id,
      stationId,
      ownershipCategory: 'GOVERNMENT_FLEET',
      operationalStatus: 'ACTIVE',
      eligibleCompliance: true,
      vehicleClass: 'PATROL_CAR'
    });
    await prisma.vehicle.update({
      where: { id: idealVehId },
      data: { seating: 7, fuelPercent: 90, driverName: 'SI Sharma', lastSeenAt: new Date() }
    });

    // Candidate 2: 2-seater Motorcycle
    const bikeVehId = await createVehicle({
      organizationId: org.id,
      stationId,
      ownershipCategory: 'GOVERNMENT_FLEET',
      operationalStatus: 'ACTIVE',
      eligibleCompliance: true,
      vehicleClass: 'MOTORCYCLE'
    });
    await prisma.vehicle.update({
      where: { id: bikeVehId },
      data: { seating: 2, fuelPercent: 50, lastSeenAt: new Date() }
    });

    const officer = await createUser({
      role: 'STATION_OFFICER',
      organizationId: org.id,
      stationId
    });
    const officerToken = await createSessionToken(officer);

    // Invoke POST /api/ai/vehicles/auto-dispatch
    const dispatchReq = new Request('http://localhost:3000/api/ai/vehicles/auto-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `sanchay-session=${officerToken}`
      },
      body: JSON.stringify({
        intent: 'Need 4-person patrol for Sarafa Bazaar festival duty'
      })
    });

    const res = await postDispatch(dispatchReq);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);

    const dispatchData = json.data;
    assert.equal(dispatchData.parsedRequirements.classNeeded, 'PATROL_CAR');
    assert.equal(dispatchData.parsedRequirements.passengerCount, 4);

    // Candidate ranking
    assert.ok(dispatchData.recommendations.length >= 2);
    const topCandidate = dispatchData.recommendations[0];
    assert.equal(topCandidate.vehicleId, idealVehId, 'Ideal patrol car ranked as top recommendation');
    assert.ok(topCandidate.suitabilityScore >= 80, 'Top candidate achieves high suitability score (>= 80)');

    const bikeCandidate = dispatchData.recommendations.find((c: { vehicleId: string }) => c.vehicleId === bikeVehId);
    if (bikeCandidate) {
      assert.ok(topCandidate.suitabilityScore > bikeCandidate.suitabilityScore, '7-seater patrol car scores higher than 2-seater motorcycle');
    }

    // Suggested 1-click action
    assert.ok(dispatchData.suggestedAction !== null);
    assert.equal(dispatchData.suggestedAction?.vehicleId, idealVehId);
    assert.equal(dispatchData.suggestedAction?.dispatchPayload.passengers, 4);
  });

  await t.test('GET /api/cloud/station/profile allows ADMIN to inspect any station and STATION_OFFICER to view own', async () => {
    const org = await createOrg();
    createdOrgIds.push(org.id);
    const stationId = await createStation(org.id);

    // Admin user (no station attached)
    const admin = await createUser({ role: 'ADMIN', organizationId: null });
    const adminToken = await createSessionToken(admin);

    // Admin query with ?stationId=...
    const adminReq = new Request(`http://localhost:3000/api/cloud/station/profile?stationId=${stationId}`, {
      headers: { cookie: `sanchay-session=${adminToken}` }
    });
    const adminRes = await getStationProfile(adminReq);
    assert.equal(adminRes.status, 200);
    const adminJson = await adminRes.json();
    assert.equal(adminJson.success, true);
    assert.equal(adminJson.data.station.district, 'Gwalior');

    // Station officer query (implicitly uses user.stationId)
    const officer = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId });
    const officerToken = await createSessionToken(officer);
    const officerReq = new Request('http://localhost:3000/api/cloud/station/profile', {
      headers: { cookie: `sanchay-session=${officerToken}` }
    });
    const officerRes = await getStationProfile(officerReq);
    assert.equal(officerRes.status, 200);
    const officerJson = await officerRes.json();
    assert.equal(officerJson.success, true);
    assert.equal(officerJson.data.station.code, adminJson.data.station.code);
  });

  await t.test('1-Click deployment: ADMIN and STATION_OFFICER can deploy missions and execute managerial actions', async () => {
    const org = await createOrg();
    createdOrgIds.push(org.id);
    const stationId = await createStation(org.id);

    const vehId = await createVehicle({
      organizationId: org.id,
      stationId,
      ownershipCategory: 'GOVERNMENT_FLEET',
      operationalStatus: 'ACTIVE',
      eligibleCompliance: true,
      vehicleClass: 'PATROL_CAR'
    });
    await prisma.vehicle.update({
      where: { id: vehId },
      data: { fuelPercent: 20, lastSeenAt: new Date() }
    });

    const officer = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId });
    const officerToken = await createSessionToken(officer);

    // 1-Click refuel action execution
    const refuelReq = new Request(`http://localhost:3000/api/cloud/vehicles/${vehId}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `sanchay-session=${officerToken}` },
      body: JSON.stringify({ type: 'logFuel', liters: 40, costInr: 3800 })
    });
    const refuelRes = await postVehicleAction(refuelReq, { params: Promise.resolve({ id: vehId }) });
    assert.equal(refuelRes.status, 200);

    // Verify vehicle fuelPercent was upgraded to healthy level (>= 80)
    const updatedVeh = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehId } });
    assert.ok((updatedVeh.fuelPercent ?? 0) >= 80, 'Fuel logging lifted fuelPercent to healthy mission-ready level');

    // 1-Click deploy mission as ADMIN (verifies ADMIN organization resolution)
    const admin = await createUser({ role: 'ADMIN', organizationId: null });
    const adminToken = await createSessionToken(admin);

    const now = new Date();
    const startAt = new Date(now.getTime() + 3600_000).toISOString();
    const endAt = new Date(now.getTime() + 9 * 3600_000).toISOString();

    const deployReq = new NextRequest('http://localhost:3000/api/cloud/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `sanchay-session=${adminToken}` },
      body: JSON.stringify({
        vehicleId: vehId,
        requestedClass: 'PATROL_CAR',
        purpose: 'Patrol duty for Sarafa Bazaar festival',
        passengers: 4,
        startAt,
        endAt,
        accountableOfficer: 'Admin Incharge',
        submit: true
      })
    });

    const deployRes = await postRequest(deployReq);
    assert.equal(deployRes.status, 200);
    const deployJson = await deployRes.json();
    assert.equal(deployJson.success, true);
    assert.ok(deployJson.data.requestCode.startsWith('REQ-'));
    assert.equal(deployJson.data.vehicleId, vehId);
  });
});
