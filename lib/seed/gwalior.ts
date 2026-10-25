import 'server-only';

import type { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';
import { writeAudit } from '@/lib/cloud/audit';
import { DEFAULT_FLEET_SETTINGS, FLEET_SETTINGS_KEY } from '@/lib/cloud/errors';
import { reevaluateEligibility } from '@/lib/cloud/eligibility';
import { recomputeStationInventory } from '@/lib/cloud/ops/transfers';
import { normalizeRegistration } from '@/lib/cloud/context';
import type { Role, Sector, VehicleClass } from '@/types';

export const DEMO_PASSWORD = 'Sanchay@Demo1';

export const DEMO_OPERATORS: Array<{ username: string; displayName: string; role: Role; orgCode: string | null; stationCode: string | null }> = [
  { username: 'admin', displayName: 'Platform Administrator', role: 'ADMIN', orgCode: null, stationCode: null },
  { username: 'org.police', displayName: 'Police Org Admin', role: 'ORG_ADMIN', orgCode: 'GWL-POLICE', stationCode: null },
  { username: 'dept.officer', displayName: 'Police Dept Officer', role: 'DEPT_OFFICER', orgCode: 'GWL-POLICE', stationCode: null },
  { username: 'dept.health', displayName: 'Health Dept Officer', role: 'DEPT_OFFICER', orgCode: 'GWL-HEALTH', stationCode: null },
  { username: 'org.health', displayName: 'Health Org Admin', role: 'ORG_ADMIN', orgCode: 'GWL-HEALTH', stationCode: null },
  { username: 'station.kotwali', displayName: 'Kotwali Station Officer', role: 'STATION_OFFICER', orgCode: 'GWL-POLICE', stationCode: 'kotwali-police-station' },
  { username: 'driver.demo', displayName: 'Demo Field Driver', role: 'FIELD_STAFF', orgCode: 'GWL-POLICE', stationCode: 'kotwali-police-station' },
  { username: 'auditor.demo', displayName: 'Demo Auditor', role: 'AUDITOR', orgCode: 'GWL-DISTRICT', stationCode: null }
];

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  jitter(value: number, spread: number): number {
    return value + (this.next() - 0.5) * 2 * spread;
  }
}

const CITY_CENTER = { lat: 26.2183, lng: 78.1828 };

interface StationSeed {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

const STATIONS: StationSeed[] = [
  { id: 'kotwali-police-station', name: 'Kotwali Police Station', lat: 26.2183, lng: 78.1828 },
  { id: 'madhoganj-police-station', name: 'Madhoganj Police Station', lat: 26.215, lng: 78.176 },
  { id: 'janakganj-police-station', name: 'Janakganj Police Station', lat: 26.221, lng: 78.19 },
  { id: 'university-police-station', name: 'University Police Station', lat: 26.231, lng: 78.168 },
  { id: 'kampoo-police-station', name: 'Kampoo Police Station', lat: 26.205, lng: 78.195 },
  { id: 'tighra-police-station', name: 'Tighra Police Station', lat: 26.28, lng: 78.22 },
  { id: 'inderganj-police-station', name: 'Inderganj Police Station', lat: 26.212, lng: 78.181 },
  { id: 'jhansi-road-police-station', name: 'Jhansi Road Police Station', lat: 26.195, lng: 78.17 },
  { id: 'padav-police-station', name: 'Padav Police Station', lat: 26.209, lng: 78.205 },
  { id: 'gwalior-police-station', name: 'Gwalior Police Station', lat: 26.2183, lng: 78.1828 },
  { id: 'bahodapur-police-station', name: 'Bahodapur Police Station', lat: 26.19, lng: 78.21 },
  { id: 'purani-chhawni-police-station', name: 'Purani Chhawni Police Station', lat: 26.23, lng: 78.2 },
  { id: 'mahila-thana-police-station', name: 'Mahila Thana Police Station', lat: 26.217, lng: 78.185 },
  { id: 'morar-police-station', name: 'Morar Police Station', lat: 26.24, lng: 78.23 },
  { id: 'thatipur-police-station', name: 'Thatipur Police Station', lat: 26.2, lng: 78.16 },
  { id: 'maharajpura-police-station', name: 'Maharajpura Police Station', lat: 26.26, lng: 78.26 },
  { id: 'hazira-police-station', name: 'Hazira Police Station', lat: 26.18, lng: 78.2 },
  { id: 'gola-ka-mandir-police-station', name: 'Gola Ka Mandir Police Station', lat: 26.205, lng: 78.19 },
  { id: 'dabra-city-police-station', name: 'Dabra City Police Station', lat: 25.89, lng: 78.33 },
  { id: 'dabra-dehat-police-station', name: 'Dabra Dehat Police Station', lat: 25.88, lng: 78.34 },
  { id: 'antri-police-station', name: 'Antri Police Station', lat: 26.06, lng: 78.07 },
  { id: 'pichhore-police-station', name: 'Pichhore Police Station', lat: 25.98, lng: 78.38 },
  { id: 'bilaua-police-station', name: 'Bilaua Police Station', lat: 25.92, lng: 78.4 },
  { id: 'gijorra-police-station', name: 'Gijorra Police Station', lat: 25.95, lng: 78.36 },
  { id: 'bhitarwar-police-station', name: 'Bhitarwar Police Station', lat: 25.8, lng: 78.12 },
  { id: 'karahiya-police-station', name: 'Karahiya Police Station', lat: 25.78, lng: 78.15 },
  { id: 'chinor-police-station', name: 'Chinor Police Station', lat: 25.76, lng: 78.09 },
  { id: 'belgada-police-station', name: 'Belgada Police Station', lat: 25.74, lng: 78.06 },
  { id: 'ghatigaon-police-station', name: 'Ghatigaon Police Station', lat: 26.0, lng: 78.47 },
  { id: 'panihar-police-station', name: 'Panihar Police Station', lat: 26.03, lng: 78.52 },
  { id: 'aron-police-station', name: 'Aron Police Station', lat: 25.96, lng: 78.55 },
  { id: 'mohana-police-station', name: 'Mohana Police Station', lat: 26.01, lng: 78.58 },
  { id: 'bhawarpura-police-station', name: 'Bhawarpura Police Station', lat: 25.98, lng: 78.51 },
  { id: 'behat-police-station', name: 'Behat Police Station', lat: 26.27, lng: 78.42 },
  { id: 'bijoli-police-station', name: 'Bijoli Police Station', lat: 26.3, lng: 78.45 },
  { id: 'utila-police-station', name: 'Utila Police Station', lat: 26.32, lng: 78.48 },
  { id: 'hastinapur-police-station', name: 'Hastinapur Police Station', lat: 26.29, lng: 78.4 }
];

function zoneFor(lat: number, lng: number): string {
  const dLat = lat - CITY_CENTER.lat;
  const dLng = lng - CITY_CENTER.lng;
  if (Math.abs(dLat) < 0.015 && Math.abs(dLng) < 0.015) return 'Central';
  const ns = dLat >= 0 ? 'North' : 'South';
  const ew = dLng >= 0 ? 'East' : 'West';
  return `${ns}-${ew}`;
}

const FIRST_NAMES = ['Rajesh', 'Suresh', 'Anil', 'Vikram', 'Deepak', 'Manoj', 'Sunil', 'Ramesh', 'Pradeep', 'Arun', 'Sanjay', 'Mukesh', 'Rakesh', 'Dinesh', 'Naresh', 'Ashok', 'Vinod', 'Pramod', 'Kailash', 'Harish', 'Pooja', 'Anita', 'Sunita', 'Rekha', 'Meena', 'Kavita', 'Neha', 'Priya'];
const LAST_NAMES = ['Sharma', 'Verma', 'Yadav', 'Singh', 'Gupta', 'Tomar', 'Rathore', 'Chouhan', 'Jadon', 'Shrivastava', 'Dixit', 'Tiwari', 'Pandey', 'Rajawat', 'Kushwaha', 'Parihar', 'Bhadauria', 'Sikarwar'];

function fakeName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}
function fakePhone(rng: Rng): string {
  const start = rng.pick(['9', '8', '7']);
  let rest = '';
  for (let i = 0; i < 9; i += 1) rest += String(rng.int(0, 9));
  return `+91 ${start}${rest.slice(0, 4)} ${rest.slice(4)}`;
}

const PATROL_CLASSES: VehicleClass[] = ['PATROL_CAR', 'MOTORCYCLE', 'VAN'];
const VEHICLE_TYPE_BY_CLASS: Record<VehicleClass, string[]> = {
  PATROL_CAR: ['Interceptor Sedan', 'Patrol SUV', 'Pilot Car'],
  MOTORCYCLE: ['Patrol Motorcycle', 'Highway Rider'],
  VAN: ['Police Van', 'Prisoner Transport', 'Command Van'],
  HEAVY: ['Water Cannon', 'Riot Control Truck', 'Recovery Truck']
};
const MAKE_MODEL_BY_CLASS: Record<VehicleClass, string[]> = {
  PATROL_CAR: ['Mahindra Scorpio', 'Toyota Innova', 'Maruti Ciaz', 'Tata Safari'],
  MOTORCYCLE: ['Royal Enfield Bullet 350', 'Bajaj Pulsar 150', 'Hero Splendor'],
  VAN: ['Force Traveller', 'Mahindra Bolero Camper', 'Tata Winger'],
  HEAVY: ['Ashok Leyland 2518', 'Tata LPT 1613', 'BharatBenz 1617']
};

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export interface SeedResult {
  organizations: number;
  stations: number;
  vehicles: number;
  operators: number;
  devices: number;
  trips: number;
  maintenance: number;
  legal: number;
  incidents: number;
  requests: number;
  allocations: number;
  notifications: number;
  documents: number;
}

export async function seedDemoData(prisma: PrismaClient): Promise<SeedResult> {
  const rng = new Rng(0x53414e43);

  // 1. Organizations (District root with children) -----------------------------
  const district = await prisma.organization.create({ data: { code: 'GWL-DISTRICT', name: 'District Administration Gwalior', kind: 'DISTRICT', parentId: null } });
  const police = await prisma.organization.create({ data: { code: 'GWL-POLICE', name: 'Gwalior Police', kind: 'POLICE', parentId: district.id } });
  const health = await prisma.organization.create({ data: { code: 'GWL-HEALTH', name: 'Health Department', kind: 'HEALTH', parentId: district.id } });
  const gmc = await prisma.organization.create({ data: { code: 'GWL-GMC', name: 'Municipal Corporation (GMC)', kind: 'MUNICIPAL', parentId: district.id } });
  const pwd = await prisma.organization.create({ data: { code: 'GWL-PWD', name: 'Public Works Department', kind: 'PWD', parentId: district.id } });
  const election = await prisma.organization.create({ data: { code: 'GWL-ELECTION', name: 'Election Office', kind: 'ELECTION', parentId: district.id } });
  const orgByCode = new Map([
    ['GWL-DISTRICT', district.id],
    ['GWL-POLICE', police.id],
    ['GWL-HEALTH', health.id],
    ['GWL-GMC', gmc.id],
    ['GWL-PWD', pwd.id],
    ['GWL-ELECTION', election.id]
  ]);

  // 2. Stations (under Police) + empty inventory ------------------------------
  const stationIdByCode = new Map<string, string>();
  for (const s of STATIONS) {
    const station = await prisma.station.create({
      data: { code: s.id, name: s.name, organizationId: police.id, zone: zoneFor(s.lat, s.lng), district: 'Gwalior', lat: s.lat, lng: s.lng, inchargeName: fakeName(rng), phone: fakePhone(rng), inventory: { create: { patrolCar: 0, motorcycle: 0, van: 0, heavy: 0 } } }
    });
    stationIdByCode.set(s.id, station.id);
  }
  const policeStationIds = [...stationIdByCode.values()];

  // 3. Operators ---------------------------------------------------------------
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  let operatorCount = 0;
  for (const op of DEMO_OPERATORS) {
    const organizationId = op.orgCode ? orgByCode.get(op.orgCode) ?? null : null;
    const stationId = op.stationCode ? stationIdByCode.get(op.stationCode) ?? null : null;
    await prisma.operator.upsert({
      where: { username: op.username },
      update: { organizationId, stationId, role: op.role, displayName: op.displayName },
      create: { username: op.username, displayName: op.displayName, email: `${op.username}@sanchay.demo`, phone: fakePhone(rng), role: op.role, organizationId, stationId, passwordHash, active: true }
    });
    operatorCount += 1;
  }

  // 4. Vehicles ----------------------------------------------------------------
  const createdVehicles: Array<{ id: string; organizationId: string; stationId: string | null; ownershipCategory: string; operationalStatus: string }> = [];
  let assetSeq = 0;
  const usedRegs = new Set<string>();
  const makeReg = (): string => {
    for (;;) {
      const reg = `MP07-${rng.pick(['AA', 'AB', 'BC', 'CD', 'DG', 'GA', 'HR', 'KL', 'ZA', 'ZX'])}-${String(rng.int(1, 9999)).padStart(4, '0')}`;
      if (!usedRegs.has(reg)) {
        usedRegs.add(reg);
        return reg;
      }
    }
  };
  const complianceExpiry = (): Date => {
    const roll = rng.float();
    if (roll < 0.15) return daysFromNow(-rng.int(5, 400));
    if (roll < 0.3) return daysFromNow(rng.int(0, 7));
    if (roll < 0.5) return daysFromNow(rng.int(8, 30));
    return daysFromNow(rng.int(60, 540));
  };

  interface VehicleSpec {
    sector: Sector;
    vehicleClass: VehicleClass;
    organizationId: string;
    stationId: string | null;
    ownershipCategory: 'GOVERNMENT_FLEET' | 'SEIZED_IMPOUNDED' | 'OTHER_UNVERIFIED';
    operationalStatus: 'ACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE' | 'RETIRED';
    verifyOwnership: boolean;
    restriction?: { type: string; reasonCode: string; authority: string; expiresAt?: Date };
    maintenanceWindow?: boolean;
    goodCompliance?: boolean;
  }

  async function createVehicle(spec: VehicleSpec): Promise<string> {
    assetSeq += 1;
    const assetCode = `SCH-V-${String(assetSeq).padStart(4, '0')}`;
    const station = spec.stationId ? STATIONS.find((s) => stationIdByCode.get(s.id) === spec.stationId) : undefined;
    const baseLat = station ? station.lat : CITY_CENTER.lat;
    const baseLng = station ? station.lng : CITY_CENTER.lng;
    const lat = rng.jitter(baseLat, 0.01);
    const lng = rng.jitter(baseLng, 0.01);
    const seized = spec.ownershipCategory === 'SEIZED_IMPOUNDED';
    const active = spec.operationalStatus === 'ACTIVE';
    const moving = active && !seized && rng.chance(0.3);
    const reg = makeReg();

    const puc = spec.goodCompliance ? daysFromNow(rng.int(90, 540)) : seized ? daysFromNow(-rng.int(30, 500)) : complianceExpiry();
    const ins = spec.goodCompliance ? daysFromNow(rng.int(90, 540)) : seized ? daysFromNow(-rng.int(30, 500)) : complianceExpiry();
    const fit = spec.goodCompliance ? daysFromNow(rng.int(90, 540)) : seized ? daysFromNow(-rng.int(30, 500)) : complianceExpiry();

    const vehicle = await prisma.vehicle.create({
      data: {
        assetCode,
        registrationNumber: reg,
        registrationNormalized: normalizeRegistration(reg),
        displayName: `${spec.sector.replace(/_/gu, ' ')} ${assetCode}`,
        sector: spec.sector,
        vehicleClass: spec.vehicleClass,
        vehicleType: rng.pick(VEHICLE_TYPE_BY_CLASS[spec.vehicleClass]),
        organizationId: spec.organizationId,
        stationId: spec.stationId,
        driverName: active && !seized ? fakeName(rng) : null,
        driverPhone: active && !seized ? fakePhone(rng) : null,
        status: moving ? 'MOVING' : 'IDLE',
        operationalStatus: spec.operationalStatus,
        ownershipCategory: spec.ownershipCategory,
        eligibilityState: 'PENDING_VERIFICATION',
        makeModel: rng.pick(MAKE_MODEL_BY_CLASS[spec.vehicleClass]),
        year: rng.int(2012, 2024),
        fuelType: rng.pick(['Diesel', 'Petrol', 'CNG']),
        seating: spec.vehicleClass === 'MOTORCYCLE' ? 2 : rng.pick([5, 7, 12]),
        color: rng.pick(['White', 'White/Blue', 'Khaki', 'Silver']),
        chassisNumber: `CH${rng.int(100000, 999999)}${rng.int(100, 999)}`,
        engineNumber: `EN${rng.int(100000, 999999)}${rng.int(100, 999)}`,
        odometerKm: rng.int(2000, 180000),
        gpsSource: 'SIMULATED',
        lat,
        lng,
        speedKmph: moving ? rng.range(8, 65) : 0,
        heading: rng.range(0, 359),
        ignition: moving,
        fuelPercent: rng.range(8, 100),
        lastSeenAt: daysFromNow(-rng.range(0, 0.4)),
        pucExpiry: puc,
        insuranceExpiry: ins,
        fitnessExpiry: fit,
        maintenanceRisk: rng.int(0, 100),
        hoursWeek: rng.range(0, 60),
        createdBy: 'seed'
      }
    });

    // Ownership verification record (verified when requested, through the service semantics).
    await prisma.vehicleOwnershipVerification.create({
      data: {
        vehicleId: vehicle.id,
        category: spec.ownershipCategory,
        status: spec.verifyOwnership ? 'VERIFIED' : 'PENDING',
        evidenceRef: seized ? 'FIR custody record' : 'RTO registration record',
        submittedBy: 'seed',
        verifiedBy: spec.verifyOwnership ? 'org.police' : null,
        verifiedAt: spec.verifyOwnership ? daysFromNow(-rng.int(10, 200)) : null
      }
    });

    if (spec.restriction) {
      await prisma.vehicleRestriction.create({
        data: { vehicleId: vehicle.id, type: spec.restriction.type, reasonCode: spec.restriction.reasonCode, description: 'Seeded restriction', authority: spec.restriction.authority, decidedBy: 'seed', expiresAt: spec.restriction.expiresAt ?? null }
      });
    }
    if (spec.maintenanceWindow) {
      await prisma.maintenanceRecord.create({
        data: { ticketCode: `MT-SEED-${assetSeq}`, vehicleId: vehicle.id, title: 'Scheduled service', severity: 'HIGH', status: 'IN_PROGRESS', windowStart: daysFromNow(-1), windowEnd: daysFromNow(2), blocksAvailability: true, raisedBy: 'seed' }
      });
    }
    if (seized) {
      await prisma.legalRecord.create({
        data: { vehicleId: vehicle.id, type: 'SEIZURE', referenceNo: `FIR/${rng.int(100, 999)}/${new Date().getFullYear() - rng.int(0, 3)}`, date: daysFromNow(-rng.int(30, 800)), description: 'Seized pending investigation', status: 'ACTIVE', authority: 'District Court Gwalior', nextActionAt: daysFromNow(rng.int(5, 120)) }
      });
    }

    // Evaluate + persist eligibility through the real service (respects DB CHECKs).
    await reevaluateEligibility(vehicle.id, prisma);
    createdVehicles.push({ id: vehicle.id, organizationId: spec.organizationId, stationId: spec.stationId, ownershipCategory: spec.ownershipCategory, operationalStatus: spec.operationalStatus });
    return vehicle.id;
  }

  // Police patrol fleet (~100): mostly verified eligible, some pending, a few restricted/maintenance/retired.
  for (let i = 0; i < 100; i += 1) {
    const stationId = rng.pick(policeStationIds);
    const roll = rng.float();
    let operationalStatus: VehicleSpec['operationalStatus'] = 'ACTIVE';
    let restriction: VehicleSpec['restriction'] | undefined;
    let maintenanceWindow = false;
    let verifyOwnership = true;
    let goodCompliance = true;
    if (roll < 0.12) {
      verifyOwnership = false; // pending verification
      goodCompliance = false;
    } else if (roll < 0.17) {
      restriction = { type: 'COURT_ORDER', reasonCode: 'COURT_HOLD', authority: 'CJM Court Gwalior' };
    } else if (roll < 0.2) {
      restriction = { type: 'SAFETY', reasonCode: 'BRAKE_FAULT', authority: 'Fleet Safety Cell' };
    } else if (roll < 0.28) {
      operationalStatus = 'MAINTENANCE';
      maintenanceWindow = true;
    } else if (roll < 0.31) {
      operationalStatus = 'RETIRED';
      verifyOwnership = false;
    }
    await createVehicle({ sector: 'POLICE_PATROL', vehicleClass: rng.pick(PATROL_CLASSES), organizationId: police.id, stationId, ownershipCategory: 'GOVERNMENT_FLEET', operationalStatus, verifyOwnership, restriction, maintenanceWindow, goodCompliance });
  }

  // ~25 seized/impounded yard vehicles with LEGAL_CUSTODY restriction (INELIGIBLE forever).
  for (let i = 0; i < 25; i += 1) {
    await createVehicle({ sector: 'POLICE_PATROL', vehicleClass: rng.pick(PATROL_CLASSES), organizationId: police.id, stationId: rng.pick(policeStationIds), ownershipCategory: 'SEIZED_IMPOUNDED', operationalStatus: 'OUT_OF_SERVICE', verifyOwnership: false, restriction: { type: 'LEGAL_CUSTODY', reasonCode: 'SEIZED', authority: 'District Court Gwalior' } });
  }

  // Other departments.
  const OTHER: Array<{ sector: Sector; org: string; cls: VehicleClass; count: number }> = [
    { sector: 'AMBULANCE_108', org: 'GWL-HEALTH', cls: 'VAN', count: 6 },
    { sector: 'HEALTH_VAN', org: 'GWL-HEALTH', cls: 'VAN', count: 4 },
    { sector: 'GMC_WASTE', org: 'GWL-GMC', cls: 'HEAVY', count: 5 },
    { sector: 'PWD_HEAVY', org: 'GWL-PWD', cls: 'HEAVY', count: 4 },
    { sector: 'ELECTION_REQUISITION', org: 'GWL-ELECTION', cls: 'VAN', count: 4 }
  ];
  for (const spec of OTHER) {
    for (let i = 0; i < spec.count; i += 1) {
      await createVehicle({ sector: spec.sector, vehicleClass: spec.cls, organizationId: orgByCode.get(spec.org) as string, stationId: null, ownershipCategory: 'GOVERNMENT_FLEET', operationalStatus: 'ACTIVE', verifyOwnership: true, goodCompliance: true });
    }
  }

  // 5. Recompute station inventories (ELIGIBLE gov-fleet only). ----------------
  for (const stationId of policeStationIds) {
    await recomputeStationInventory(prisma, stationId);
  }

  // 6. Devices (~70% of active gov-fleet vehicles) + unprovisioned spares. ------
  const eligibleVehicles = await prisma.vehicle.findMany({ where: { eligibilityState: 'ELIGIBLE' }, select: { id: true, organizationId: true } });
  let deviceSeq = 0;
  let deviceCount = 0;
  for (const v of eligibleVehicles) {
    if (!rng.chance(0.7)) continue;
    deviceSeq += 1;
    await prisma.iotDevice.create({
      data: { deviceCode: `GPS-${String(deviceSeq).padStart(5, '0')}`, kind: 'GPS_TRACKER', vehicleId: v.id, organizationId: v.organizationId, protocol: 'AIS_140', status: 'ONLINE', simulated: true, firmware: `v${rng.int(1, 4)}.${rng.int(0, 9)}.${rng.int(0, 9)}`, batteryPct: rng.int(40, 100), signalDbm: -rng.int(55, 110), lastSeenAt: daysFromNow(-rng.range(0, 0.2)), provisionedAt: daysFromNow(-rng.int(30, 400)) }
    });
    deviceCount += 1;
  }
  for (let i = 0; i < 6; i += 1) {
    deviceSeq += 1;
    await prisma.iotDevice.create({ data: { deviceCode: `GPS-${String(deviceSeq).padStart(5, '0')}`, kind: 'GPS_TRACKER', protocol: 'AIS_140', status: 'UNPROVISIONED', simulated: true, vehicleId: null } });
    deviceCount += 1;
  }

  // 7. Trips, maintenance history, incidents. ----------------------------------
  const activeVehicles = await prisma.vehicle.findMany({ where: { operationalStatus: 'ACTIVE' }, select: { id: true, lat: true, lng: true } });
  const year = new Date().getFullYear();
  let tripSeq = 0;
  let tripCount = 0;
  for (const v of activeVehicles.slice(0, 50)) {
    const n = rng.int(1, 3);
    for (let t = 0; t < n; t += 1) {
      tripSeq += 1;
      const startedAt = daysFromNow(-rng.range(1, 90));
      const durationMin = rng.int(20, 300);
      const startOdo = rng.int(1000, 150000);
      const distance = rng.range(3, 120);
      await prisma.trip.create({
        data: { tripCode: `TRIP-${year}-${String(tripSeq).padStart(5, '0')}`, vehicleId: v.id, driverName: fakeName(rng), purpose: rng.pick(['Patrol duty', 'VIP escort', 'Prisoner transport', 'Night rounds']), status: 'COMPLETED', startedAt, endedAt: new Date(startedAt.getTime() + durationMin * 60000), startAddress: rng.pick(['Kotwali', 'Phoolbagh', 'Lashkar', 'Morar']), endAddress: rng.pick(['Gola Ka Mandir', 'Hazira', 'Maharajpura']), startOdometer: startOdo, endOdometer: startOdo + Math.round(distance), distanceKm: Math.round(distance * 10) / 10, durationMin, fuelLiters: Math.round(distance * rng.range(0.08, 0.16) * 10) / 10 }
      });
      tripCount += 1;
    }
  }

  let ticketSeq = 0;
  let maintenanceCount = 0;
  for (const v of createdVehicles) {
    if (!rng.chance(0.2)) continue;
    ticketSeq += 1;
    const statusRoll = rng.float();
    const status = statusRoll < 0.4 ? 'COMPLETED' : statusRoll < 0.6 ? 'SCHEDULED' : 'OVERDUE';
    await prisma.maintenanceRecord.create({
      data: { ticketCode: `MT-${year}-${String(ticketSeq).padStart(5, '0')}`, vehicleId: v.id, title: rng.pick(['Engine service', 'Brake pad replacement', 'Tyre rotation', 'Battery replacement']), severity: rng.pick(['LOW', 'MEDIUM', 'HIGH']), status, blocksAvailability: false, dueDate: daysFromNow(rng.int(-30, 45)), completedAt: status === 'COMPLETED' ? daysFromNow(-rng.int(1, 40)) : null, costInr: rng.int(800, 60000), vendor: rng.pick(['Sagar Motors', 'City Garage']), raisedBy: 'seed' }
    });
    maintenanceCount += 1;
  }

  let incidentSeq = 0;
  let incidentCount = 0;
  for (const v of activeVehicles.slice(0, 10)) {
    if (!rng.chance(0.5)) continue;
    incidentSeq += 1;
    await prisma.incidentReport.create({
      data: { incidentCode: `INC-${year}-${String(incidentSeq).padStart(5, '0')}`, vehicleId: v.id, type: rng.pick(['BREAKDOWN', 'ACCIDENT', 'GEOFENCE', 'SOS']), severity: rng.pick(['INFO', 'WARNING', 'CRITICAL']), message: rng.pick(['Vehicle broke down', 'Minor collision', 'Left geofence', 'SOS pressed']), reporterName: fakeName(rng), lat: v.lat, lng: v.lng, offlineCaptured: rng.chance(0.2), status: rng.pick(['OPEN', 'ACKNOWLEDGED']) }
    });
    incidentCount += 1;
  }

  // 8. Requests + allocations in every state. ----------------------------------
  const seedResult = await seedRequestsAndAllocations(prisma, rng, { policeOrgId: police.id, electionOrgId: election.id, healthOrgId: health.id, year });

  // 9. A couple of document metadata rows. -------------------------------------
  let documentCount = 0;
  for (const v of eligibleVehicles.slice(0, 2)) {
    await prisma.vehicleDocument.create({
      data: { vehicleId: v.id, kind: 'RC', title: 'Registration Certificate', storagePath: `${v.id}/seed-rc.pdf`, mimeType: 'application/pdf', sizeBytes: 102400, uploadedBy: 'seed' }
    });
    documentCount += 1;
  }

  // 10. Settings + audit marker ------------------------------------------------
  const settingsJson = DEFAULT_FLEET_SETTINGS as unknown as Prisma.InputJsonValue;
  await prisma.appSetting.upsert({ where: { key: FLEET_SETTINGS_KEY }, update: { value: settingsJson }, create: { key: FLEET_SETTINGS_KEY, value: settingsJson } });

  await writeAudit(prisma, {
    entityType: 'System',
    entityId: 'seed',
    action: 'DemoDataSeeded',
    newValue: `vehicles=${createdVehicles.length};orgs=6;stations=${STATIONS.length}`,
    performedBy: 'system',
    performedByRole: 'ADMIN',
    organizationId: district.id,
    outcome: 'SUCCESS',
    reason: 'Gwalior demo fleet seeded'
  });

  return {
    organizations: 6,
    stations: STATIONS.length,
    vehicles: createdVehicles.length,
    operators: operatorCount,
    devices: deviceCount,
    trips: tripCount,
    maintenance: maintenanceCount,
    legal: createdVehicles.filter((v) => v.ownershipCategory === 'SEIZED_IMPOUNDED').length,
    incidents: incidentCount,
    requests: seedResult.requests,
    allocations: seedResult.allocations,
    notifications: seedResult.notifications,
    documents: documentCount
  };
}

// ---------------------------------------------------------------------------
// Requests & allocations covering every state and lifecycle
// ---------------------------------------------------------------------------

async function seedRequestsAndAllocations(
  prisma: PrismaClient,
  rng: Rng,
  ctx: { policeOrgId: string; electionOrgId: string; healthOrgId: string; year: number }
): Promise<{ requests: number; allocations: number; notifications: number }> {
  const eligiblePolice = await prisma.vehicle.findMany({ where: { organizationId: ctx.policeOrgId, eligibilityState: 'ELIGIBLE', operationalStatus: 'ACTIVE' }, select: { id: true }, take: 20 });
  if (eligiblePolice.length < 8) {
    return { requests: 0, allocations: 0, notifications: 0 };
  }
  let reqSeq = 0;
  let allocSeq = 0;
  let requests = 0;
  let allocations = 0;
  let notifications = 0;
  let vIdx = 0;
  const nextVehicle = () => eligiblePolice[vIdx++ % eligiblePolice.length].id;

  const mkReq = async (data: {
    state: string;
    vehicleId: string | null;
    requesterUsername: string;
    requestingOrgId: string;
    approverOrgId: string | null;
    startAt: Date;
    endAt: Date;
    decided?: boolean;
  }) => {
    reqSeq += 1;
    const req = await prisma.assetRequest.create({
      data: {
        requestCode: `REQ-${ctx.year}-${String(reqSeq).padStart(5, '0')}`,
        requestingOrgId: data.requestingOrgId,
        requesterUsername: data.requesterUsername,
        requesterName: 'Seed Requester',
        vehicleId: data.vehicleId,
        requestedClass: 'VAN',
        purpose: rng.pick(['Election duty', 'VIP movement', 'Field inspection', 'Patient transfer']),
        destination: rng.pick(['District Court', 'Circuit House', 'Morar', 'Dabra']),
        passengers: rng.int(1, 6),
        startAt: data.startAt,
        endAt: data.endAt,
        accountableOfficer: 'Seed Officer',
        state: data.state,
        approverOrgId: data.approverOrgId,
        submittedAt: data.state === 'DRAFT' ? null : daysFromNow(-rng.int(1, 5)),
        decidedAt: data.decided ? daysFromNow(-rng.int(0, 3)) : null
      }
    });
    if (data.state !== 'DRAFT' && data.approverOrgId) {
      await prisma.approvalStep.create({ data: { requestId: req.id, stepOrder: 1, approverOrgId: data.approverOrgId, decision: data.state === 'APPROVED' ? 'APPROVED' : data.state === 'REJECTED' ? 'REJECTED' : 'PENDING', decidedBy: data.decided ? 'dept.officer' : null, decidedAt: data.decided ? daysFromNow(-rng.int(0, 3)) : null } });
    }
    requests += 1;
    return req;
  };

  const mkAlloc = async (requestId: string, vehicleId: string, startAt: Date, endAt: Date, lifecycle: string, withHandover: boolean, withReturn: boolean) => {
    allocSeq += 1;
    const alloc = await prisma.allocation.create({
      data: { allocationCode: `ALL-${ctx.year}-${String(allocSeq).padStart(5, '0')}`, requestId, vehicleId, startAt, endAt, lifecycle, createdBy: 'seed' }
    });
    if (withHandover) {
      await prisma.handoverRecord.create({ data: { allocationId: alloc.id, handedOverBy: 'station.kotwali', receivedBy: 'Seed Driver', conditionNotes: 'Good condition', odometerKm: rng.int(1000, 90000), fuelPercent: rng.range(40, 100), checklist: [{ item: 'Spare tyre', present: true }] as unknown as Prisma.InputJsonValue } });
    }
    if (withReturn) {
      await prisma.returnRecord.create({ data: { allocationId: alloc.id, returnedBy: 'Seed Driver', receivedBy: 'station.kotwali', conditionNotes: 'Returned with minor wear', odometerKm: rng.int(90000, 120000), fuelPercent: rng.range(20, 80), inspectionRequired: true, inspectionStatus: 'PENDING' } });
    }
    allocations += 1;
    return alloc;
  };

  // Requests in every state.
  await mkReq({ state: 'DRAFT', vehicleId: nextVehicle(), requesterUsername: 'dept.health', requestingOrgId: ctx.healthOrgId, approverOrgId: ctx.policeOrgId, startAt: daysFromNow(3), endAt: daysFromNow(4) });
  await mkReq({ state: 'SUBMITTED', vehicleId: nextVehicle(), requesterUsername: 'org.health', requestingOrgId: ctx.healthOrgId, approverOrgId: ctx.policeOrgId, startAt: daysFromNow(2), endAt: daysFromNow(3) });
  await mkReq({ state: 'UNDER_REVIEW', vehicleId: nextVehicle(), requesterUsername: 'org.health', requestingOrgId: ctx.electionOrgId, approverOrgId: ctx.policeOrgId, startAt: daysFromNow(5), endAt: daysFromNow(6) });
  await mkReq({ state: 'CHANGES_REQUESTED', vehicleId: nextVehicle(), requesterUsername: 'dept.health', requestingOrgId: ctx.healthOrgId, approverOrgId: ctx.policeOrgId, startAt: daysFromNow(6), endAt: daysFromNow(7) });
  await mkReq({ state: 'REJECTED', vehicleId: nextVehicle(), requesterUsername: 'dept.health', requestingOrgId: ctx.healthOrgId, approverOrgId: ctx.policeOrgId, startAt: daysFromNow(1), endAt: daysFromNow(2), decided: true });
  await mkReq({ state: 'CANCELLED', vehicleId: nextVehicle(), requesterUsername: 'dept.health', requestingOrgId: ctx.healthOrgId, approverOrgId: ctx.policeOrgId, startAt: daysFromNow(4), endAt: daysFromNow(5), decided: true });
  await mkReq({ state: 'EXPIRED', vehicleId: nextVehicle(), requesterUsername: 'dept.health', requestingOrgId: ctx.healthOrgId, approverOrgId: ctx.policeOrgId, startAt: daysFromNow(-3), endAt: daysFromNow(-2), decided: true });

  // Cross-org APPROVED (Election requests a Police van) -> RESERVED allocation (future).
  {
    const v = nextVehicle();
    const start = daysFromNow(2);
    const end = daysFromNow(3);
    const req = await mkReq({ state: 'APPROVED', vehicleId: v, requesterUsername: 'org.health', requestingOrgId: ctx.electionOrgId, approverOrgId: ctx.policeOrgId, startAt: start, endAt: end, decided: true });
    await mkAlloc(req.id, v, start, end, 'RESERVED', false, false);
    await prisma.notification.create({ data: { eventKey: `request:${req.id}:APPROVED`, kind: 'REQUEST_APPROVED', title: 'Request approved', body: `Request ${req.requestCode} was approved and reserved.`, recipientOrgId: ctx.electionOrgId, recipientRole: 'ORG_ADMIN' } });
    notifications += 1;
  }

  // AWAITING_HANDOVER.
  {
    const v = nextVehicle();
    const start = daysFromNow(-0.2);
    const end = daysFromNow(1);
    const req = await mkReq({ state: 'APPROVED', vehicleId: v, requesterUsername: 'dept.health', requestingOrgId: ctx.healthOrgId, approverOrgId: ctx.policeOrgId, startAt: start, endAt: end, decided: true });
    await mkAlloc(req.id, v, start, end, 'AWAITING_HANDOVER', false, false);
  }

  // ACTIVE overdue (endAt in the past, still ACTIVE).
  {
    const v = nextVehicle();
    const start = daysFromNow(-2);
    const end = hoursFromNow(-6);
    const req = await mkReq({ state: 'APPROVED', vehicleId: v, requesterUsername: 'dept.health', requestingOrgId: ctx.healthOrgId, approverOrgId: ctx.policeOrgId, startAt: start, endAt: end, decided: true });
    await mkAlloc(req.id, v, start, end, 'ACTIVE', true, false);
  }

  // RETURNED_PENDING_INSPECTION with handover + return.
  {
    const v = nextVehicle();
    const start = daysFromNow(-3);
    const end = daysFromNow(-1);
    const req = await mkReq({ state: 'APPROVED', vehicleId: v, requesterUsername: 'dept.health', requestingOrgId: ctx.healthOrgId, approverOrgId: ctx.policeOrgId, startAt: start, endAt: end, decided: true });
    const alloc = await mkAlloc(req.id, v, start, end, 'RETURNED_PENDING_INSPECTION', true, true);
    await prisma.extensionRequest.create({ data: { allocationId: alloc.id, requestedBy: 'dept.health', newEndAt: daysFromNow(-0.5), reason: 'Needed an extra half day', status: 'REJECTED', decidedBy: 'dept.officer', decidedAt: daysFromNow(-1) } });
  }

  // COMPLETED.
  {
    const v = nextVehicle();
    const start = daysFromNow(-6);
    const end = daysFromNow(-4);
    const req = await mkReq({ state: 'APPROVED', vehicleId: v, requesterUsername: 'dept.health', requestingOrgId: ctx.healthOrgId, approverOrgId: ctx.policeOrgId, startAt: start, endAt: end, decided: true });
    await mkAlloc(req.id, v, start, end, 'COMPLETED', true, true);
  }

  // CANCELLED allocation (before handover).
  {
    const v = nextVehicle();
    const start = daysFromNow(4);
    const end = daysFromNow(5);
    const req = await mkReq({ state: 'APPROVED', vehicleId: v, requesterUsername: 'dept.health', requestingOrgId: ctx.healthOrgId, approverOrgId: ctx.policeOrgId, startAt: start, endAt: end, decided: true });
    await mkAlloc(req.id, v, start, end, 'CANCELLED', false, false);
  }

  // INCIDENT_HOLD.
  {
    const v = nextVehicle();
    const start = daysFromNow(-1);
    const end = daysFromNow(1);
    const req = await mkReq({ state: 'APPROVED', vehicleId: v, requesterUsername: 'dept.health', requestingOrgId: ctx.healthOrgId, approverOrgId: ctx.policeOrgId, startAt: start, endAt: end, decided: true });
    await mkAlloc(req.id, v, start, end, 'INCIDENT_HOLD', true, false);
  }

  return { requests, allocations, notifications };
}
