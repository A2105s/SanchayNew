import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSettings, createOrg, createStation, createUser, createVehicle, cleanupOrgs } from './helpers';
import { createTransfer, applyTransferAction } from '@/lib/cloud/ops/transfers';
import { createSpaceBooking, applySpaceBookingAction, listSpaceBookings } from '@/lib/cloud/ops/space-bookings';
import { searchSpaces } from '@/lib/cloud/ops/spaces';
import { DomainError } from '@/lib/cloud/errors';
import SPACES_JSON from '@/lib/data/gwalior-spaces.json';
import { NAV_ROUTE_ITEMS, SPACES_HREFS, SHARED_HREFS } from '@/lib/navigation/routes';
import { resolveModuleForPath } from '@/lib/client/useModule';
import { canAny } from '@/lib/client/permissions';

const CID = 'test-transfers-spaces';

test('Verified Gwalior Civic Spaces Data Integrity (20 Civic Spaces)', async () => {
  assert.equal(SPACES_JSON.length, 20, 'Catalog contains 20 verified civic spaces');

  const dbSpaces = await prisma.space.findMany({
    where: { assetCode: { in: SPACES_JSON.map((s) => s.assetCode) } },
    include: { organization: true }
  });
  assert.equal(dbSpaces.length, 20, 'All 20 verified civic spaces are present in the live database');

  const byCode = new Map(dbSpaces.map((s) => [s.assetCode, s]));

  // Verify coverage across key civic departments
  const orgCodes = new Set(dbSpaces.map((s) => s.organization.code));
  assert.ok(orgCodes.has('GWL-GMC'), 'Contains Nagar Nigam spaces');
  assert.ok(orgCodes.has('GWL-PWD'), 'Contains PWD civic facilities');
  assert.ok(orgCodes.has('GWL-HEALTH'), 'Contains Health department halls');
  assert.ok(orgCodes.has('GWL-DISTRICT'), 'Contains District Collectorate auditoriums');
  assert.ok(orgCodes.has('GWL-POLICE'), 'Contains Police auditorium / conference facilities');

  // Verify specific verified civic spaces
  const healthConf = byCode.get('SCH-SP-0001');
  assert.ok(healthConf, 'Conference Room 1 - Civil Hospital is present');
  assert.equal(healthConf?.capacity, 30);
  assert.equal(healthConf?.organization.code, 'GWL-HEALTH');

  const gmcHall = byCode.get('SCH-SP-0004');
  assert.ok(gmcHall, 'Samudayik Bhavan A - Lashkar (GMC) is present');
  assert.equal(gmcHall?.capacity, 200);
  assert.equal(gmcHall?.organization.code, 'GWL-GMC');

  const pwdMeeting = byCode.get('SCH-SP-0011');
  assert.ok(pwdMeeting, 'Meeting Room 1 - PWD Office Lashkar is present');
  assert.equal(pwdMeeting?.capacity, 20);
  assert.equal(pwdMeeting?.organization.code, 'GWL-PWD');

  for (const space of dbSpaces) {
    assert.ok(space.capacity > 0, `Space ${space.assetCode} has positive capacity`);
    assert.ok(space.lat !== null && space.lat > 25.0 && space.lat < 27.0, `Space ${space.assetCode} has valid Gwalior latitude`);
    assert.ok(space.lng !== null && space.lng > 77.0 && space.lng < 79.0, `Space ${space.assetCode} has valid Gwalior longitude`);
  }
});

test('2-Step Police Vehicle Inter-Station Requisition Workflow', async () => {
  await ensureSettings({ allowSelfApproval: false });
  const org = await createOrg();
  try {
    const lenderStationId = await createStation(org.id);
    const borrowerStationId = await createStation(org.id);

    // Provide 2 patrol cars to lender station
    await createVehicle({ organizationId: org.id, stationId: lenderStationId, vehicleClass: 'PATROL_CAR' });
    await createVehicle({ organizationId: org.id, stationId: lenderStationId, vehicleClass: 'PATROL_CAR' });

    // Users
    const borrowerTI = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: borrowerStationId });
    const lenderTI = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: lenderStationId });
    const thirdPartyTI = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: borrowerStationId });
    const districtAdmin = await createUser({ role: 'ORG_ADMIN', organizationId: org.id });

    const startAt = new Date(Date.now() + 24 * 3600000).toISOString();
    const endAt = new Date(Date.now() + 48 * 3600000).toISOString();

    // 1. Borrowing station TI creates transfer request -> PENDING_LENDER_REVIEW
    const created = await createTransfer(borrowerTI, {
      sourceStationId: lenderStationId,
      destinationStationId: borrowerStationId,
      startAt,
      endAt,
      counts: { PATROL_CAR: 1, MOTORCYCLE: 0, VAN: 0, HEAVY: 0 },
      purpose: 'VIP Bandobast reinforcement at Gwalior Fort'
    }, CID);

    assert.equal(created.status, 'PENDING_LENDER_REVIEW', 'Initial transfer status is PENDING_LENDER_REVIEW');

    // 2a. Unauthorized station officer attempting station clearance fails (403)
    await assert.rejects(
      async () => {
        await applyTransferAction(thirdPartyTI, created.id, { type: 'grant_clearance' }, CID);
      },
      (err: unknown) => err instanceof DomainError && err.status === 403,
      'Third party station officer cannot grant clearance for lender station'
    );

    // 2b. District ORG_ADMIN attempting station clearance fails (403 - strictly lending station TI)
    await assert.rejects(
      async () => {
        await applyTransferAction(districtAdmin, created.id, { type: 'grant_clearance' }, CID);
      },
      (err: unknown) => err instanceof DomainError && err.status === 403,
      'District ORG_ADMIN cannot grant station clearance (strictly for lending station officer)'
    );

    // 3. Lender station officer grants Station Clearance -> PENDING_DISTRICT_SANCTION
    const cleared = await applyTransferAction(lenderTI, created.id, { type: 'grant_clearance' }, CID);
    assert.equal(cleared.transfer.status, 'PENDING_DISTRICT_SANCTION', 'Station clearance transitions to PENDING_DISTRICT_SANCTION');

    // 4a. Lender TI attempting district sanction fails (403)
    await assert.rejects(
      async () => {
        await applyTransferAction(lenderTI, created.id, { type: 'grant_sanction' }, CID);
      },
      (err: unknown) => err instanceof DomainError && err.status === 403,
      'Station officer cannot grant district sanction'
    );

    // 4b. Foreign ORG_ADMIN attempting district sanction fails (403)
    const foreignOrg = await createOrg();
    const foreignOrgAdmin = await createUser({ role: 'ORG_ADMIN', organizationId: foreignOrg.id });
    await assert.rejects(
      async () => {
        await applyTransferAction(foreignOrgAdmin, created.id, { type: 'grant_sanction' }, CID);
      },
      (err: unknown) => err instanceof DomainError && err.status === 403,
      'Foreign org admin cannot sanction police transfers'
    );
    await cleanupOrgs([foreignOrg.id]);

    // 5. District SP Fleet Desk / Admin issues District Movement Sanction -> ALLOCATED
    const sanctioned = await applyTransferAction(districtAdmin, created.id, { type: 'grant_sanction' }, CID);
    assert.equal(sanctioned.transfer.status, 'ALLOCATED', 'District sanction transitions to ALLOCATED');

    // 6. Confirm Handover (Departure) -> ACTIVE
    const handedOver = await applyTransferAction(lenderTI, created.id, { type: 'handover' }, CID);
    assert.equal(handedOver.transfer.status, 'ACTIVE', 'Handover transitions to ACTIVE in transit');

    // 7. Inbound Return Inspection -> COMPLETED
    const completed = await applyTransferAction(borrowerTI, created.id, { type: 'complete' }, CID);
    assert.equal(completed.transfer.status, 'COMPLETED', 'Inbound return completion transitions to COMPLETED');
  } finally {
    const stations = await prisma.station.findMany({ where: { organizationId: org.id }, select: { id: true } });
    const sIds = stations.map((s) => s.id);
    await prisma.transferRequest.deleteMany({ where: { OR: [{ sourceStationId: { in: sIds } }, { destinationStationId: { in: sIds } }] } });
    await cleanupOrgs([org.id]);
  }
});

test('Police Vehicle Requisition Rejection Paths (Lender and Admin Rejection)', async () => {
  await ensureSettings({ allowSelfApproval: false });
  const org = await createOrg();
  try {
    const lenderStationId = await createStation(org.id);
    const borrowerStationId = await createStation(org.id);

    await createVehicle({ organizationId: org.id, stationId: lenderStationId, vehicleClass: 'PATROL_CAR' });

    const borrowerTI = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: borrowerStationId });
    const lenderTI = await createUser({ role: 'STATION_OFFICER', organizationId: org.id, stationId: lenderStationId });
    const admin = await createUser({ role: 'ADMIN', organizationId: null });

    const startAt = new Date(Date.now() + 24 * 3600000).toISOString();
    const endAt = new Date(Date.now() + 48 * 3600000).toISOString();

    // Rejection at lender clearance stage
    const req1 = await createTransfer(borrowerTI, {
      sourceStationId: lenderStationId,
      destinationStationId: borrowerStationId,
      startAt,
      endAt,
      counts: { PATROL_CAR: 1, MOTORCYCLE: 0, VAN: 0, HEAVY: 0 },
      purpose: 'Local patrol'
    }, CID);

    const rej1 = await applyTransferAction(lenderTI, req1.id, { type: 'reject', reason: 'Insufficient local reserves' }, CID);
    assert.equal(rej1.transfer.status, 'REJECTED_BY_LENDER', 'Lender rejection sets REJECTED_BY_LENDER');

    // Rejection at district sanction stage
    const req2 = await createTransfer(borrowerTI, {
      sourceStationId: lenderStationId,
      destinationStationId: borrowerStationId,
      startAt,
      endAt,
      counts: { PATROL_CAR: 1, MOTORCYCLE: 0, VAN: 0, HEAVY: 0 },
      purpose: 'Special bandobast'
    }, CID);

    await applyTransferAction(lenderTI, req2.id, { type: 'grant_clearance' }, CID);
    const rej2 = await applyTransferAction(admin, req2.id, { type: 'reject', reason: 'District priority clash' }, CID);
    assert.equal(rej2.transfer.status, 'REJECTED_BY_ADMIN', 'Admin rejection sets REJECTED_BY_ADMIN');
  } finally {
    const stations = await prisma.station.findMany({ where: { organizationId: org.id }, select: { id: true } });
    const sIds = stations.map((s) => s.id);
    await prisma.transferRequest.deleteMany({ where: { OR: [{ sourceStationId: { in: sIds } }, { destinationStationId: { in: sIds } }] } });
    await cleanupOrgs([org.id]);
  }
});

test('Civic Spaces Chain of Approvals & Oversight', async () => {
  // Find GMC space (SCH-SP-0004 capacity 200) and PWD space (SCH-SP-0011 capacity 20)
  const gmcSpace = await prisma.space.findFirstOrThrow({ where: { assetCode: 'SCH-SP-0004' } });
  const pwdSpace = await prisma.space.findFirstOrThrow({ where: { assetCode: 'SCH-SP-0011' } });

  // Operators
  const spacesAdmin = {
    username: 'spaces.admin',
    displayName: 'Civic Spaces Administrator',
    role: 'ORG_ADMIN' as const,
    organizationId: gmcSpace.organizationId,
    stationId: null
  };

  const gmcEstateOfficer = {
    username: 'dept.spaces',
    displayName: 'Estate Officer GMC',
    role: 'DEPT_OFFICER' as const,
    organizationId: gmcSpace.organizationId,
    stationId: null
  };

  const pwdEstateOfficer = {
    username: 'spaces.pwd',
    displayName: 'PWD Executive Engineer',
    role: 'DEPT_OFFICER' as const,
    organizationId: pwdSpace.organizationId,
    stationId: null
  };

  const dmGwalior = {
    username: 'dm.gwalior',
    displayName: 'District Magistrate Gwalior',
    role: 'ADMIN' as const,
    organizationId: null,
    stationId: null
  };

  const requestingDeptUser = {
    username: 'dept.health.demo',
    displayName: 'Health Dept Requester',
    role: 'DEPT_OFFICER' as const,
    organizationId: gmcSpace.organizationId,
    stationId: null
  };

  // Set approvalThresholdHours to 0 so requests require manual approval by estate officers
  await prisma.appSetting.upsert({
    where: { key: 'space_settings' },
    update: { value: { approvalThresholdHours: 0, bookingWindowDays: 30, idleAlertDays: 14 } },
    create: { key: 'space_settings', value: { approvalThresholdHours: 0, bookingWindowDays: 30, idleAlertDays: 14 } }
  });

  // 1. spaces.admin can search and see all civic spaces across GMC and PWD
  const searchResult = await searchSpaces(spacesAdmin, {});
  assert.ok(searchResult.spaces.some((s) => s.assetCode === 'SCH-SP-0004'), 'spaces.admin sees GMC space');
  assert.ok(searchResult.spaces.some((s) => s.assetCode === 'SCH-SP-0011'), 'spaces.admin sees PWD space');

  // Next Tuesday 11:00-13:00 IST (valid weekday within operating hours for both GMC and PWD)
  const d = new Date();
  d.setDate(d.getDate() + 3);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  // 11:00 IST = 05:30 UTC
  d.setUTCHours(5, 30, 0, 0);
  const startAt = d.toISOString();
  const endAt = new Date(d.getTime() + 2 * 3600000).toISOString();

  // 2. Create booking for GMC space (attendees 50 <= capacity 200)
  const bookingGmc = await createSpaceBooking(requestingDeptUser, {
    spaceId: gmcSpace.id,
    startAt,
    endAt,
    purpose: 'Health immunization seminar',
    attendees: 50
  }, CID);

  assert.equal(bookingGmc.status, 'PENDING');

  // 3. Requester cannot approve their own booking
  await assert.rejects(
    async () => {
      await applySpaceBookingAction(requestingDeptUser, bookingGmc.id, { type: 'approve' }, CID);
    },
    (err: unknown) => err instanceof DomainError && err.status === 403,
    'Requester cannot approve their own booking'
  );

  // 4. Owning estate officer (GMC) can approve
  const approvedByGmc = await applySpaceBookingAction(gmcEstateOfficer, bookingGmc.id, { type: 'approve' }, CID);
  assert.equal(approvedByGmc.status, 'CONFIRMED');

  // 5. Create booking for PWD space (attendees 10 <= capacity 20)
  const bookingPwd = await createSpaceBooking(requestingDeptUser, {
    spaceId: pwdSpace.id,
    startAt,
    endAt,
    purpose: 'District public infrastructure workshop',
    attendees: 10
  }, CID);

  assert.equal(bookingPwd.status, 'PENDING');

  // 6. spaces.admin can review PWD space booking
  const spacesAdminList = await listSpaceBookings(spacesAdmin, { scope: 'review' });
  assert.ok(spacesAdminList.bookings.some((b) => b.id === bookingPwd.id), 'spaces.admin sees PWD booking in review scope');

  // 7. Owning PWD estate officer can approve PWD space booking
  const approvedByPwd = await applySpaceBookingAction(pwdEstateOfficer, bookingPwd.id, { type: 'approve' }, CID);
  assert.equal(approvedByPwd.status, 'CONFIRMED');

  // 8. DM Gwalior (role ADMIN) can complete any confirmed booking
  const completedByDm = await applySpaceBookingAction(dmGwalior, bookingPwd.id, { type: 'complete' }, CID);
  assert.equal(completedByDm.status, 'COMPLETED');

  // Cleanup test bookings and restore space settings
  await prisma.spaceBooking.deleteMany({ where: { id: { in: [bookingGmc.id, bookingPwd.id] } } });
  await prisma.appSetting.upsert({
    where: { key: 'space_settings' },
    update: { value: { approvalThresholdHours: 4, bookingWindowDays: 30, idleAlertDays: 14 } },
    create: { key: 'space_settings', value: { approvalThresholdHours: 4, bookingWindowDays: 30, idleAlertDays: 14 } }
  });
});

test('Spaces Isolation & Module-Aware Navigation Logic', () => {
  const SPACES_ROUTES = ['/spaces', '/spaces/bookings', '/spaces/requests', '/spaces/settings'];
  const VEHICLE_ROUTES = [
    '/vehicles',
    '/vehicles/discover',
    '/vehicles/map',
    '/requests',
    '/allocations',
    '/transfers',
    '/operations',
    '/compliance',
    '/maintenance',
    '/idle',
    '/incidents',
    '/iot'
  ];

  // 1. Verify path resolution in resolveModuleForPath
  for (const r of SPACES_ROUTES) {
    assert.equal(resolveModuleForPath(r), 'spaces', `Spaces route ${r} resolves to spaces`);
  }
  for (const r of VEHICLE_ROUTES) {
    assert.equal(resolveModuleForPath(r), 'vehicles', `Vehicle route ${r} resolves to vehicles`);
  }

  // Dashboard and shared routes follow active cookie
  assert.equal(resolveModuleForPath('/dashboard', 'spaces'), 'spaces');
  assert.equal(resolveModuleForPath('/dashboard', 'vehicles'), 'vehicles');
  assert.equal(resolveModuleForPath('/reports', 'spaces'), 'spaces');
  assert.equal(resolveModuleForPath('/reports', 'vehicles'), 'vehicles');

  // 2. Spaces mode sidebar items: strictly spaces + shared items, hides all 9 vehicle items
  const spacesVisible = NAV_ROUTE_ITEMS.filter((item) => {
    if (!SPACES_HREFS.has(item.href) && !SHARED_HREFS.has(item.href)) return false;
    if (item.requiresAny && !canAny('ORG_ADMIN', item.requiresAny)) return false;
    return true;
  }).map((i) => i.href);

  assert.ok(spacesVisible.includes('/spaces'));
  assert.ok(spacesVisible.includes('/spaces/bookings'));
  assert.ok(spacesVisible.includes('/spaces/requests'));
  assert.ok(spacesVisible.includes('/spaces/settings'));
  assert.ok(spacesVisible.includes('/reports'));
  assert.ok(spacesVisible.includes('/audit'));
  assert.ok(spacesVisible.includes('/settings'), '/settings is visible in spaces mode');

  for (const v of VEHICLE_ROUTES) {
    assert.ok(!spacesVisible.includes(v), `Vehicle route ${v} is strictly hidden in spaces mode`);
  }

  // 3. Vehicles mode sidebar items: hides all spaces items
  const hasStation = true;
  const vehiclesVisible = NAV_ROUTE_ITEMS.filter((item) => {
    if (SPACES_HREFS.has(item.href)) return false;
    if (item.showIfStation && !hasStation) return false;
    if (item.requiresAny && !canAny('STATION_OFFICER', item.requiresAny)) return false;
    return true;
  }).map((i) => i.href);

  for (const s of SPACES_ROUTES) {
    assert.ok(!vehiclesVisible.includes(s), `Spaces route ${s} is strictly hidden in vehicles mode`);
  }

  // 4. Settings visibility for spaces operators
  for (const role of ['ORG_ADMIN', 'DEPT_OFFICER'] as const) {
    const visible = NAV_ROUTE_ITEMS.filter((item) => {
      if (!SPACES_HREFS.has(item.href) && !SHARED_HREFS.has(item.href)) return false;
      if (item.requiresAny && !canAny(role, item.requiresAny)) return false;
      return true;
    }).map((i) => i.href);
    assert.ok(visible.includes('/settings'), `/settings is visible to ${role} in spaces mode`);
  }
});
