import 'server-only';

import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';
import { getSpacePhotos } from '@/lib/fleet/space-photos';
import type { SpaceCategory } from '@/types';

export const POINT15_PASSWORD = 'Sanchay@Demo1';

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export interface Point15SpacesSeedSummary {
  organizationsCount: number;
  spacesCount: number;
  operatorsCount: number;
  bookingsCount: number;
}

export async function seedPoint15Spaces(prisma: PrismaClient): Promise<Point15SpacesSeedSummary> {
  console.log('[Point 15] Seeding government spaces and organizations...');

  // 1. Root District Organization
  let districtOrg = await prisma.organization.findUnique({ where: { code: 'GWL-DISTRICT' } });
  if (!districtOrg) {
    districtOrg = await prisma.organization.create({
      data: {
        code: 'GWL-DISTRICT',
        name: 'Gwalior District Administration',
        kind: 'DISTRICT'
      }
    });
  }

  // 2. Demo Organization 1: Government Model Higher Secondary School, Gwalior
  const schoolOrg = await prisma.organization.upsert({
    where: { code: 'GWL-GMHSS' },
    update: {
      name: 'Government Model Higher Secondary School, Gwalior',
      kind: 'EDUCATION',
      parentId: districtOrg.id,
      active: true
    },
    create: {
      code: 'GWL-GMHSS',
      name: 'Government Model Higher Secondary School, Gwalior',
      kind: 'EDUCATION',
      parentId: districtOrg.id,
      active: true
    }
  });

  // 3. Demo Organization 2: Government Administrative Training Centre, Gwalior
  const gatcOrg = await prisma.organization.upsert({
    where: { code: 'GWL-GATC' },
    update: {
      name: 'Government Administrative Training Centre, Gwalior',
      kind: 'ADMINISTRATIVE',
      parentId: districtOrg.id,
      active: true
    },
    create: {
      code: 'GWL-GATC',
      name: 'Government Administrative Training Centre, Gwalior',
      kind: 'ADMINISTRATIVE',
      parentId: districtOrg.id,
      active: true
    }
  });

  // 4. Authenticated Operators with Password Hash
  const passwordHash = await hashPassword(POINT15_PASSWORD);
  let operatorsCount = 0;

  // School Principal (Requester account)
  await prisma.operator.upsert({
    where: { username: 'school.gmhss' },
    update: {
      displayName: 'Principal, Govt Model HSS Gwalior (Dr. Sunita Sharma)',
      role: 'ORG_ADMIN',
      organizationId: schoolOrg.id,
      phone: '+91 75124 55101',
      active: true
    },
    create: {
      username: 'school.gmhss',
      displayName: 'Principal, Govt Model HSS Gwalior (Dr. Sunita Sharma)',
      email: 'principal.gmhss@sanchay.gov.in',
      phone: '+91 75124 55101',
      role: 'ORG_ADMIN',
      organizationId: schoolOrg.id,
      passwordHash,
      active: true
    }
  });
  operatorsCount++;

  // Alternate school login alias
  await prisma.operator.upsert({
    where: { username: 'principal.gmhss' },
    update: {
      displayName: 'Dr. Sunita Sharma (Principal, Govt Model HSS)',
      role: 'DEPT_OFFICER',
      organizationId: schoolOrg.id,
      phone: '+91 75124 55101',
      active: true
    },
    create: {
      username: 'principal.gmhss',
      displayName: 'Dr. Sunita Sharma (Principal, Govt Model HSS)',
      email: 'principal@gmhss-gwl.gov.in',
      phone: '+91 75124 55101',
      role: 'DEPT_OFFICER',
      organizationId: schoolOrg.id,
      passwordHash,
      active: true
    }
  });
  operatorsCount++;

  // GATC Estate & Training Officer (Provider account)
  await prisma.operator.upsert({
    where: { username: 'admin.gatc' },
    update: {
      displayName: 'Estate Officer, Govt Admin Training Centre (Rajesh Saxena)',
      role: 'ORG_ADMIN',
      organizationId: gatcOrg.id,
      phone: '+91 75124 55201',
      active: true
    },
    create: {
      username: 'admin.gatc',
      displayName: 'Estate Officer, Govt Admin Training Centre (Rajesh Saxena)',
      email: 'estate.officer@gatc-gwl.gov.in',
      phone: '+91 75124 55201',
      role: 'ORG_ADMIN',
      organizationId: gatcOrg.id,
      passwordHash,
      active: true
    }
  });
  operatorsCount++;

  // GATC Alternate login alias
  await prisma.operator.upsert({
    where: { username: 'estate.gatc' },
    update: {
      displayName: 'Facility Manager, GATC (Vikram Tomar)',
      role: 'DEPT_OFFICER',
      organizationId: gatcOrg.id,
      phone: '+91 75124 55202',
      active: true
    },
    create: {
      username: 'estate.gatc',
      displayName: 'Facility Manager, GATC (Vikram Tomar)',
      email: 'facility@gatc-gwl.gov.in',
      phone: '+91 75124 55202',
      role: 'DEPT_OFFICER',
      organizationId: gatcOrg.id,
      passwordHash,
      active: true
    }
  });
  operatorsCount++;

  // 5. Seed Spaces Properties
  const standardHours = {
    mon: ['09:00', '18:00'],
    tue: ['09:00', '18:00'],
    wed: ['09:00', '18:00'],
    thu: ['09:00', '18:00'],
    fri: ['09:00', '18:00'],
    sat: ['09:00', '18:00']
  };

  const propertiesToSeed = [
    {
      assetCode: 'SCH-SP-GATC-01',
      name: 'Sardar Patel Administrative Training Hall A',
      category: 'TRAINING_HALL',
      orgId: gatcOrg.id,
      buildingOrCampus: 'Administrative Training Centre Campus',
      addressLine: 'GATC Complex, MLB Road, City Centre, Gwalior',
      district: 'City Centre',
      lat: 26.2084,
      lng: 78.1882,
      capacity: 60,
      areaSqft: 1800,
      operationalState: 'AVAILABLE',
      description: 'Premier government training hall equipped with tiered seating, dual projection systems, wireless collar microphones, and central climate control for state capacity building programs.',
      contactOfficerName: 'Rajesh Saxena (Estate Officer)',
      contactPhone: '+91 75124 55201',
      amenities: ['High-Definition Projector', 'Central Air Conditioning', 'PA System with Collar Mics', 'Gigabit Wi-Fi', 'Interactive Whiteboard', 'Tiered Seating', 'Podium'],
      accessibility: ['Wheelchair Ramp', 'Elevator Access', 'Accessible Restroom', 'Braille Signage'],
      operatingHours: standardHours,
      minBookingHours: 2,
      maxBookingHours: 8,
      bookingLeadDays: 30
    },
    {
      assetCode: 'SCH-SP-GATC-02',
      name: 'Atal Bihari Vajpayee Conference Room B',
      category: 'MEETING_ROOM',
      orgId: gatcOrg.id,
      buildingOrCampus: 'GATC Secretariat Block, 2nd Floor',
      addressLine: 'GATC Complex, MLB Road, City Centre, Gwalior',
      district: 'City Centre',
      lat: 26.2085,
      lng: 78.1883,
      capacity: 28,
      areaSqft: 950,
      operationalState: 'AVAILABLE',
      description: 'High-level inter-departmental conference room with U-shaped executive table, 4K video conferencing display, Cisco Webex integration, and acoustic sound dampening.',
      contactOfficerName: 'Rajesh Saxena (Estate Officer)',
      contactPhone: '+91 75124 55201',
      amenities: ['4K Video Conferencing Display', 'Cisco Webex / Zoom Terminal', 'Acoustic Wall Panelling', 'Central Table Boundary Mics', 'Executive Leather Chairs', 'Air Conditioning', 'Wi-Fi'],
      accessibility: ['Elevator Access', 'Wide Doorways', 'Accessible Restroom'],
      operatingHours: standardHours,
      minBookingHours: 1,
      maxBookingHours: 8,
      bookingLeadDays: 30
    },
    {
      assetCode: 'SCH-SP-GATC-03',
      name: 'Vikramaditya State Auditorium',
      category: 'AUDITORIUM',
      orgId: gatcOrg.id,
      buildingOrCampus: 'GATC Auditorium Wing',
      addressLine: 'GATC Complex, MLB Road, City Centre, Gwalior',
      district: 'City Centre',
      lat: 26.2086,
      lng: 78.1884,
      capacity: 350,
      areaSqft: 4500,
      operationalState: 'AVAILABLE',
      description: 'Full-scale civic auditorium featuring proscenium stage with motorized drapery, surround acoustics, stage lighting truss, dual green rooms, and dedicated audio-visual control booth.',
      contactOfficerName: 'Vikram Tomar (Facility Manager)',
      contactPhone: '+91 75124 55202',
      amenities: ['Proscenium Stage', 'Motorized Drapery', 'Digital Surround Sound System', 'Stage Lighting Truss', 'Air Conditioning', 'Green Rooms (2)', 'AV Control Booth', 'VIP Green Lounge'],
      accessibility: ['Stage Access Ramp', 'Wheelchair Designated Seating', 'Tactile Paving', 'Accessible Washrooms'],
      operatingHours: {
        mon: ['08:30', '20:30'],
        tue: ['08:30', '20:30'],
        wed: ['08:30', '20:30'],
        thu: ['08:30', '20:30'],
        fri: ['08:30', '20:30'],
        sat: ['08:30', '20:30']
      },
      minBookingHours: 3,
      maxBookingHours: 10,
      bookingLeadDays: 30
    },
    {
      assetCode: 'SCH-SP-GATC-04',
      name: 'Kautilya Computer & IT Training Lab',
      category: 'TRAINING_HALL',
      orgId: gatcOrg.id,
      buildingOrCampus: 'GATC Technology Wing, Ground Floor',
      addressLine: 'GATC Complex, MLB Road, City Centre, Gwalior',
      district: 'City Centre',
      lat: 26.2083,
      lng: 78.1881,
      capacity: 40,
      areaSqft: 1200,
      operationalState: 'AVAILABLE',
      description: 'Fully networked IT laboratory with 40 desktop workstations, gigabit local network, online UPS power backup, master instructor screen broadcasting, and dual projection units.',
      contactOfficerName: 'Rajesh Saxena (Estate Officer)',
      contactPhone: '+91 75124 55201',
      amenities: ['40 Workstations (Core i7, 16GB)', 'Gigabit LAN', 'Central Online UPS (30kVA)', 'Instructor Master Broadcast Console', 'Dual Projectors', 'Air Conditioning', 'Wi-Fi'],
      accessibility: ['Ground Floor Step-Free Entrance', 'Ergonomic Chairs'],
      operatingHours: {
        mon: ['09:30', '17:30'],
        tue: ['09:30', '17:30'],
        wed: ['09:30', '17:30'],
        thu: ['09:30', '17:30'],
        fri: ['09:30', '17:30']
      },
      minBookingHours: 2,
      maxBookingHours: 8,
      bookingLeadDays: 30
    },
    {
      assetCode: 'SCH-SP-GATC-05',
      name: 'Maharaja Mansingh Seminar Hall C',
      category: 'MEETING_ROOM',
      orgId: gatcOrg.id,
      buildingOrCampus: 'GATC West Wing, 1st Floor',
      addressLine: 'GATC Complex, MLB Road, City Centre, Gwalior',
      district: 'City Centre',
      lat: 26.2082,
      lng: 78.1880,
      capacity: 80,
      areaSqft: 2100,
      operationalState: 'AVAILABLE',
      description: 'Versatile seminar hall with theater-style writing tablet seating, motorized ceiling projector, wireless microphones, and dedicated registration foyer.',
      contactOfficerName: 'Vikram Tomar (Facility Manager)',
      contactPhone: '+91 75124 55202',
      amenities: ['Theater Seating with Writing Tablets', 'Podium with Gooseneck Mic', 'Dual Wireless Lapel Mics', 'Ceiling Projector', 'Surround Speakers', 'Air Conditioning'],
      accessibility: ['Elevator Access', 'Ramped Entrance'],
      operatingHours: standardHours,
      minBookingHours: 2,
      maxBookingHours: 8,
      bookingLeadDays: 30
    },
    {
      assetCode: 'SCH-SP-GATC-06',
      name: 'Administrative Committee Lounge D',
      category: 'MEETING_ROOM',
      orgId: gatcOrg.id,
      buildingOrCampus: 'GATC Secretariat Block, 3rd Floor',
      addressLine: 'GATC Complex, MLB Road, City Centre, Gwalior',
      district: 'City Centre',
      lat: 26.2087,
      lng: 78.1885,
      capacity: 16,
      areaSqft: 600,
      operationalState: 'AVAILABLE',
      description: 'Confidential committee lounge designed for official interview panels, visiting government delegations, and inter-departmental advisory discussions.',
      contactOfficerName: 'Rajesh Saxena (Estate Officer)',
      contactPhone: '+91 75124 55201',
      amenities: ['Oval Teakwood Table', '65-inch Smart TV', 'Lounge Sofas', 'Pantry Counter', 'En-Suite Restroom', 'Wi-Fi', 'Air Conditioning'],
      accessibility: ['Elevator Access'],
      operatingHours: standardHours,
      minBookingHours: 1,
      maxBookingHours: 6,
      bookingLeadDays: 30
    },
    {
      assetCode: 'SCH-SP-GMHSS-01',
      name: 'Saraswati Examination & Multi-Purpose Hall',
      category: 'COMMUNITY_HALL',
      orgId: schoolOrg.id,
      buildingOrCampus: 'Government Model HSS Main Campus',
      addressLine: 'Phoolbagh Road, Lashkar, Gwalior',
      district: 'Lashkar',
      lat: 26.2062,
      lng: 78.1624,
      capacity: 200,
      areaSqft: 3000,
      operationalState: 'AVAILABLE',
      description: 'Spacious examination and cultural activity hall with modular writing desks, public address audio, high ceilings with natural cross-ventilation, and CCTV evaluation monitoring.',
      contactOfficerName: 'Dr. Sunita Sharma (Principal)',
      contactPhone: '+91 75124 55101',
      amenities: ['Modular Exam Desks', 'Public Address System', 'Natural High-Ceiling Ventilation', 'CCTV Surveillance', 'Backup Power Generator', 'Water Cooler'],
      accessibility: ['Ground Floor Entrance', 'Wide Veranda Ramp'],
      operatingHours: {
        mon: ['08:00', '17:00'],
        tue: ['08:00', '17:00'],
        wed: ['08:00', '17:00'],
        thu: ['08:00', '17:00'],
        fri: ['08:00', '17:00'],
        sat: ['08:00', '17:00']
      },
      minBookingHours: 2,
      maxBookingHours: 8,
      bookingLeadDays: 30
    }
  ];

  const spaceIdByCode = new Map<string, string>();
  let spacesCount = 0;

  for (const p of propertiesToSeed) {
    const photos = getSpacePhotos({ assetCode: p.assetCode, category: p.category as SpaceCategory });
    const space = await prisma.space.upsert({
      where: { assetCode: p.assetCode },
      update: {
        name: p.name,
        category: p.category,
        organizationId: p.orgId,
        buildingOrCampus: p.buildingOrCampus,
        addressLine: p.addressLine,
        district: p.district,
        city: 'Gwalior',
        lat: p.lat,
        lng: p.lng,
        capacity: p.capacity,
        areaSqft: p.areaSqft,
        operationalState: p.operationalState,
        description: p.description,
        contactOfficerName: p.contactOfficerName,
        contactPhone: p.contactPhone,
        amenities: p.amenities,
        accessibility: p.accessibility,
        photos,
        operatingHours: p.operatingHours,
        minBookingHours: p.minBookingHours,
        maxBookingHours: p.maxBookingHours,
        bookingLeadDays: p.bookingLeadDays
      },
      create: {
        assetCode: p.assetCode,
        name: p.name,
        category: p.category,
        organizationId: p.orgId,
        buildingOrCampus: p.buildingOrCampus,
        addressLine: p.addressLine,
        district: p.district,
        city: 'Gwalior',
        lat: p.lat,
        lng: p.lng,
        capacity: p.capacity,
        areaSqft: p.areaSqft,
        operationalState: p.operationalState,
        description: p.description,
        contactOfficerName: p.contactOfficerName,
        contactPhone: p.contactPhone,
        amenities: p.amenities,
        accessibility: p.accessibility,
        photos,
        operatingHours: p.operatingHours,
        minBookingHours: p.minBookingHours,
        maxBookingHours: p.maxBookingHours,
        bookingLeadDays: p.bookingLeadDays,
        createdBy: 'seed-point15'
      }
    });
    spaceIdByCode.set(p.assetCode, space.id);
    spacesCount++;
  }

  // 6. Clean up old Point 15 demo booking records for idempotent re-runs
  await prisma.spaceBooking.deleteMany({
    where: { bookingCode: { startsWith: 'SCH-SB-2026-' } }
  });

  // 7. Seed Realistic Booking Requests & Allocations
  console.log('[Point 15] Seeding realistic booking requests and confirmed allocations...');
  let bookingsCount = 0;

  const hallAId = spaceIdByCode.get('SCH-SP-GATC-01')!;
  const confBId = spaceIdByCode.get('SCH-SP-GATC-02')!;
  const audId = spaceIdByCode.get('SCH-SP-GATC-03')!;
  const labId = spaceIdByCode.get('SCH-SP-GATC-04')!;
  const semCId = spaceIdByCode.get('SCH-SP-GATC-05')!;

  // BOOKING 1: PENDING Request from School for Training Hall A
  await prisma.spaceBooking.create({
    data: {
      bookingCode: 'SCH-SB-2026-0001',
      spaceId: hallAId,
      requestedBy: 'school.gmhss',
      requestedForOrgId: schoolOrg.id,
      purpose: 'State Secondary Teacher Digital Pedagogy & STEM Curriculum Training Workshop',
      attendees: 45,
      startAt: daysFromNow(3),
      endAt: new Date(daysFromNow(3).getTime() + 6 * 60 * 60 * 1000), // 6 hours
      status: 'PENDING'
    }
  });
  bookingsCount++;

  // BOOKING 2: CONFIRMED Upcoming Booking from School for State Auditorium
  await prisma.spaceBooking.create({
    data: {
      bookingCode: 'SCH-SB-2026-0002',
      spaceId: audId,
      requestedBy: 'school.gmhss',
      requestedForOrgId: schoolOrg.id,
      purpose: 'District Inter-School Science Congress & Innovation Award Ceremony',
      attendees: 280,
      startAt: daysFromNow(6),
      endAt: new Date(daysFromNow(6).getTime() + 6 * 60 * 60 * 1000), // 6 hours
      status: 'CONFIRMED',
      approvedBy: 'admin.gatc',
      approvedAt: daysFromNow(-1),
      reviewNote: 'Approved. Auditorium sound engineer and stage assistance team assigned for the event.'
    }
  });
  bookingsCount++;

  // BOOKING 3: CONFIRMED In-Progress / Today's Live Booking for Conference Room B
  // Active right now: started 2 hours ago, ends in 4 hours
  await prisma.spaceBooking.create({
    data: {
      bookingCode: 'SCH-SB-2026-0003',
      spaceId: confBId,
      requestedBy: 'school.gmhss',
      requestedForOrgId: schoolOrg.id,
      purpose: 'State Board Examination Coordination & Center Superintendent Review Meeting',
      attendees: 20,
      startAt: hoursFromNow(-2),
      endAt: hoursFromNow(4),
      status: 'CONFIRMED',
      approvedBy: 'admin.gatc',
      approvedAt: daysFromNow(-2),
      reviewNote: 'Approved. Secure video conferencing link and projection setup activated.'
    }
  });
  bookingsCount++;

  // BOOKING 4: COMPLETED Historical Booking for Computer Lab
  await prisma.spaceBooking.create({
    data: {
      bookingCode: 'SCH-SB-2026-0004',
      spaceId: labId,
      requestedBy: 'school.gmhss',
      requestedForOrgId: schoolOrg.id,
      purpose: 'Student Cyber Security Awareness & Online Coding Practical Evaluation',
      attendees: 38,
      startAt: daysFromNow(-4),
      endAt: new Date(daysFromNow(-4).getTime() + 4 * 60 * 60 * 1000),
      status: 'COMPLETED',
      approvedBy: 'admin.gatc',
      approvedAt: daysFromNow(-5),
      completedAt: new Date(daysFromNow(-4).getTime() + 4.2 * 60 * 60 * 1000),
      reviewNote: 'Completed successfully. All 38 workstations operated satisfactorily without incident.'
    }
  });
  bookingsCount++;

  // BOOKING 5: REJECTED Booking Request with Capacity Conflict Reason
  await prisma.spaceBooking.create({
    data: {
      bookingCode: 'SCH-SB-2026-0005',
      spaceId: confBId,
      requestedBy: 'school.gmhss',
      requestedForOrgId: schoolOrg.id,
      purpose: 'School Student Council General Assembly & Policy Debate',
      attendees: 35, // Exceeds capacity of 28
      startAt: daysFromNow(-2),
      endAt: new Date(daysFromNow(-2).getTime() + 2 * 60 * 60 * 1000),
      status: 'REJECTED',
      rejectionReason: 'Requested attendees (35) exceeds conference room maximum capacity of 28. Please request Seminar Hall C or Training Hall A.'
    }
  });
  bookingsCount++;

  // BOOKING 6: CANCELLED Booking Request with Official Reason
  await prisma.spaceBooking.create({
    data: {
      bookingCode: 'SCH-SB-2026-0006',
      spaceId: semCId,
      requestedBy: 'school.gmhss',
      requestedForOrgId: schoolOrg.id,
      purpose: 'Parent-Teacher Advisory Committee Orientation Session',
      attendees: 55,
      startAt: daysFromNow(10),
      endAt: new Date(daysFromNow(10).getTime() + 3 * 60 * 60 * 1000),
      status: 'CANCELLED',
      cancelledBy: 'school.gmhss',
      cancelledAt: daysFromNow(-1),
      cancellationReason: 'Session postponed following rescheduling of district educational inspection.'
    }
  });
  bookingsCount++;

  console.log('[Point 15] Spaces seed completed successfully!');
  return {
    organizationsCount: 2,
    spacesCount,
    operatorsCount,
    bookingsCount
  };
}
