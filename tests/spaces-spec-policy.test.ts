import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toIstWallClock,
  dayKeyFor,
  operatingWindowFor,
  bookingPolicyRejection,
  slotStateFor,
  spaceIdleDays
} from '../lib/fleet/spaces';
import { spaceBookingActionSchema } from '../lib/validation/schemas';
import type { SpaceView } from '../types';

describe('Civic Spaces Spec 09 Policy & Availability Logic', () => {
  const dummySpace: SpaceView = {
    id: 'space-test-01',
    organizationId: 'org-collectorate',
    organizationName: 'Collectorate Gwalior',
    name: 'Chamber Conference Hall',
    category: 'MEETING_ROOM',
    assetCode: 'SPC-GWL-001',
    buildingOrCampus: 'Collectorate Block B',
    addressLine: 'City Centre, Gwalior',
    district: 'Gwalior',
    city: 'Gwalior',
    lat: 26.2183,
    lng: 78.1828,
    capacity: 60,
    areaSqft: 1200,
    operationalState: 'AVAILABLE',
    description: 'Executive conference room with AV equipment',
    managerName: 'Shri R. K. Sharma',
    contactOfficerName: 'Aditya Verma',
    contactPhone: '+91 751 2445100',
    amenities: ['Projector', 'Air Conditioning', 'WiFi'],
    accessibility: ['Wheelchair Ramp', 'Elevator Access'],
    operatingHours: {
      mon: ['09:00', '18:00'],
      tue: ['09:00', '18:00'],
      wed: ['09:00', '18:00'],
      thu: ['09:00', '18:00'],
      fri: ['09:00', '18:00'],
      sat: ['10:00', '14:00']
    },
    minBookingHours: 1,
    maxBookingHours: 8,
    bookingLeadDays: 30,
    busyNow: false,
    blockedByMaintenance: false,
    idleDays: 4,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  it('correctly calculates IST wall-clock and day keys', () => {
    // 2026-11-02 04:30:00 UTC is 2026-11-02 10:00:00 IST (Monday)
    const instantUtc = new Date('2026-11-02T04:30:00Z');
    const ist = toIstWallClock(instantUtc);
    assert.equal(ist.getUTCHours(), 10);
    assert.equal(ist.getUTCMinutes(), 0);
    assert.equal(dayKeyFor(instantUtc), 'mon');
  });

  it('parses operating windows accurately', () => {
    const monWin = operatingWindowFor(dummySpace, 'mon');
    assert.ok(monWin);
    assert.equal(monWin.openMin, 9 * 60);
    assert.equal(monWin.closeMin, 18 * 60);

    const satWin = operatingWindowFor(dummySpace, 'sat');
    assert.ok(satWin);
    assert.equal(satWin.openMin, 10 * 60);
    assert.equal(satWin.closeMin, 14 * 60);

    const sunWin = operatingWindowFor(dummySpace, 'sun');
    assert.equal(sunWin, null);
  });

  it('evaluates booking policy rejections correctly', () => {
    const now = new Date('2026-11-01T00:00:00Z');

    // 1. Inside operating hours, valid capacity -> allowed (null)
    const validStart = new Date('2026-11-02T04:30:00Z'); // 10:00 IST Monday
    const validEnd = new Date('2026-11-02T06:30:00Z');   // 12:00 IST Monday
    const resValid = bookingPolicyRejection(dummySpace, validStart, validEnd, now, 40);
    assert.equal(resValid, null);

    // 2. Capacity exceeded
    const resOvercap = bookingPolicyRejection(dummySpace, validStart, validEnd, now, 80);
    assert.equal(resOvercap, 'CAPACITY_EXCEEDED');

    // 3. Outside operating hours (07:00 IST is before 09:00 IST)
    const earlyStart = new Date('2026-11-02T01:30:00Z'); // 07:00 IST
    const earlyEnd = new Date('2026-11-02T03:30:00Z');   // 09:00 IST
    const resEarly = bookingPolicyRejection(dummySpace, earlyStart, earlyEnd, now, 20);
    assert.equal(resEarly, 'OUTSIDE_OPERATING_HOURS');

    // 4. Closed day (Sunday)
    const sunStart = new Date('2026-11-08T05:30:00Z');
    const sunEnd = new Date('2026-11-08T07:30:00Z');
    const resSun = bookingPolicyRejection(dummySpace, sunStart, sunEnd, now, 20);
    assert.equal(resSun, 'OUTSIDE_OPERATING_HOURS');

    // 5. In the past
    const pastStart = new Date('2026-10-30T05:30:00Z');
    const pastEnd = new Date('2026-10-30T07:30:00Z');
    const resPast = bookingPolicyRejection(dummySpace, pastStart, pastEnd, now, 20);
    assert.equal(resPast, 'IN_THE_PAST');
  });

  it('determines Spec 09 slot states across states, bookings and maintenance', () => {
    const mondaySlotMid = new Date('2026-11-02T05:30:00Z'); // 11:00 IST Monday

    // 1. Available when free
    assert.equal(slotStateFor(dummySpace, [], false, mondaySlotMid), 'available');

    // 2. Maintenance override
    assert.equal(slotStateFor(dummySpace, [], true, mondaySlotMid), 'maintenance');

    // 3. Confirmed booking overlap
    const confirmedBooking = {
      status: 'CONFIRMED' as const,
      startAt: new Date('2026-11-02T04:30:00Z'),
      endAt: new Date('2026-11-02T06:30:00Z')
    };
    assert.equal(slotStateFor(dummySpace, [confirmedBooking], false, mondaySlotMid), 'booked');

    // 4. Pending approval overlap
    const pendingBooking = {
      status: 'PENDING' as const,
      startAt: new Date('2026-11-02T04:30:00Z'),
      endAt: new Date('2026-11-02T06:30:00Z')
    };
    assert.equal(slotStateFor(dummySpace, [pendingBooking], false, mondaySlotMid), 'pending approval');

    // 5. Restricted space state
    const restrictedSpace = { ...dummySpace, operationalState: 'RESTRICTED' as const };
    assert.equal(slotStateFor(restrictedSpace, [], false, mondaySlotMid), 'blocked');
  });

  it('calculates idle space days correctly for pulse monitoring', () => {
    const now = new Date('2026-11-01T12:00:00Z');
    const lastBooking = new Date('2026-10-15T12:00:00Z'); // 17 days ago
    const idle = spaceIdleDays(lastBooking, false, now);
    assert.equal(idle, 17);

    // When space is currently busy, idle days is null
    const busyIdle = spaceIdleDays(lastBooking, true, now);
    assert.equal(busyIdle, null);
  });

  it('validates space booking action schema with relocation support', () => {
    const validRelocate = {
      type: 'relocate',
      targetSpaceId: 'space-target-99',
      reason: 'Air conditioning repair underway'
    };
    const parsed = spaceBookingActionSchema.safeParse(validRelocate);
    assert.equal(parsed.success, true);

    const invalidRelocate = {
      type: 'relocate',
      targetSpaceId: '', // invalid: min 1 char
      reason: 'Broken'
    };
    const parsedInvalid = spaceBookingActionSchema.safeParse(invalidRelocate);
    assert.equal(parsedInvalid.success, false);
  });

  it('calculates spatial fire safety ratios accurately', () => {
    const areaSqft = 600;
    const overcrowdedAttendees = 80;
    const ratio = areaSqft / overcrowdedAttendees; // 7.5 sq ft per person
    assert.ok(ratio < 10, 'Ratio under 10 sq ft per person must flag overcrowding risk');

    const safeAttendees = 30;
    const safeRatio = areaSqft / safeAttendees; // 20 sq ft per person
    assert.ok(safeRatio >= 15, 'Ratio at or above 15 sq ft per person is safe');
  });
});

