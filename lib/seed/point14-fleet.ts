import 'server-only';

import type { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';
import { recomputeStationInventory } from '@/lib/cloud/ops/transfers';
import { normalizeRegistration } from '@/lib/cloud/context';
import type { Role, Sector, VehicleClass } from '@/types';
import STATIONS_DATA from '@/lib/data/gwalior-police-stations.json';

export const POINT14_DEMO_PASSWORD = 'Sanchay@Demo1';

export interface TargetStationConfig {
  slug: string;
  shortCode: string;
  name: string;
  lat: number;
  lng: number;
  inchargeName: string;
  phone: string;
  zone: string;
  // Specific inventory class distributions totaling exactly 20 vehicles
  distribution: {
    MOTORCYCLE: number;
    CAR: number;
    PATROL_CAR: number;
    VAN: number;
    CHHOTA_HATHI: number;
    TRUCK: number;
    BUS: number;
    JCB: number;
    HEAVY: number;
    SPECIALIZED: number;
  };
}

export const TARGET_STATIONS: TargetStationConfig[] = [
  {
    slug: 'padav-police-station',
    shortCode: 'PD',
    name: 'Padav Police Station',
    lat: 26.213969,
    lng: 78.176592,
    inchargeName: 'Insp. Rajesh Tomar',
    phone: '+91 77010 46915',
    zone: 'Central',
    distribution: {
      MOTORCYCLE: 6,
      CAR: 3,
      PATROL_CAR: 2,
      VAN: 2,
      CHHOTA_HATHI: 1,
      TRUCK: 2,
      BUS: 1,
      JCB: 1,
      HEAVY: 1,
      SPECIALIZED: 1
    }
  },
  {
    slug: 'maharajpura-police-station',
    shortCode: 'MH',
    name: 'Maharajpura Police Station',
    lat: 26.277781,
    lng: 78.225303,
    inchargeName: 'Insp. R. S. Jadon',
    phone: '+91 77010 46920',
    zone: 'North-East',
    // Maharajpura has 5 trucks as highlighted in specification 13.3 & 14.3
    distribution: {
      MOTORCYCLE: 5,
      CAR: 2,
      PATROL_CAR: 2,
      VAN: 2,
      CHHOTA_HATHI: 1,
      TRUCK: 5,
      BUS: 1,
      JCB: 1,
      HEAVY: 0,
      SPECIALIZED: 1
    }
  },
  {
    slug: 'thatipur-police-station',
    shortCode: 'TH',
    name: 'Thatipur Police Station',
    lat: 26.212247,
    lng: 78.210384,
    inchargeName: 'Insp. S. K. Sharma',
    phone: '+91 77010 46922',
    zone: 'Central-East',
    distribution: {
      MOTORCYCLE: 6,
      CAR: 3,
      PATROL_CAR: 2,
      VAN: 2,
      CHHOTA_HATHI: 1,
      TRUCK: 2,
      BUS: 1,
      JCB: 1,
      HEAVY: 1,
      SPECIALIZED: 1
    }
  },
  {
    slug: 'university-police-station',
    shortCode: 'UN',
    name: 'University Police Station',
    lat: 26.198069,
    lng: 78.193225,
    inchargeName: 'Insp. Devendra Mishra',
    phone: '+91 77010 46918',
    zone: 'Central-South',
    distribution: {
      MOTORCYCLE: 7,
      CAR: 4,
      PATROL_CAR: 2,
      VAN: 2,
      CHHOTA_HATHI: 1,
      TRUCK: 1,
      BUS: 0, // University has 0 buses; borrows from Morar
      JCB: 1,
      HEAVY: 1,
      SPECIALIZED: 1
    }
  },
  {
    slug: 'jhansi-road-police-station',
    shortCode: 'JR',
    name: 'Jhansi Road Police Station',
    lat: 26.188817,
    lng: 78.1746,
    inchargeName: 'Insp. Sanjay Rathore',
    phone: '+91 77010 46919',
    zone: 'South-West',
    distribution: {
      MOTORCYCLE: 6,
      CAR: 3,
      PATROL_CAR: 2,
      VAN: 3,
      CHHOTA_HATHI: 1,
      TRUCK: 1,
      BUS: 1,
      JCB: 1,
      HEAVY: 1,
      SPECIALIZED: 1
    }
  },
  {
    slug: 'morar-police-station',
    shortCode: 'MR',
    name: 'Morar Police Station',
    lat: 26.22236,
    lng: 78.222808,
    inchargeName: 'Insp. K. P. Singh',
    phone: '+91 77010 46921',
    zone: 'East',
    // Morar has 3 buses for cantonment & perimeter duty
    distribution: {
      MOTORCYCLE: 5,
      CAR: 2,
      PATROL_CAR: 2,
      VAN: 2,
      CHHOTA_HATHI: 1,
      TRUCK: 2,
      BUS: 3,
      JCB: 1,
      HEAVY: 1,
      SPECIALIZED: 1
    }
  },
  {
    slug: 'gwalior-police-station',
    shortCode: 'GW',
    name: 'Gwalior Police Station',
    lat: 26.233246,
    lng: 78.17361,
    inchargeName: 'Insp. Alok Verma',
    phone: '+91 77010 46923',
    zone: 'North-West',
    distribution: {
      MOTORCYCLE: 6,
      CAR: 3,
      PATROL_CAR: 2,
      VAN: 2,
      CHHOTA_HATHI: 1,
      TRUCK: 2,
      BUS: 1,
      JCB: 1,
      HEAVY: 1,
      SPECIALIZED: 1
    }
  },
  {
    slug: 'bahodapur-police-station',
    shortCode: 'BH',
    name: 'Bahodapur Police Station',
    lat: 26.219468,
    lng: 78.1526,
    inchargeName: 'Sub-Insp. Priya Saxena',
    phone: '+91 77010 46925',
    zone: 'West',
    distribution: {
      MOTORCYCLE: 6,
      CAR: 3,
      PATROL_CAR: 2,
      VAN: 2,
      CHHOTA_HATHI: 1,
      TRUCK: 2,
      BUS: 1,
      JCB: 1,
      HEAVY: 1,
      SPECIALIZED: 1
    }
  }
];

// Catalog of makes, models and colors per class
const VEHICLE_MODELS: Record<VehicleClass, Array<{ makeModel: string; fuel: string; seats: number; color: string; type: string }>> = {
  MOTORCYCLE: [
    { makeModel: 'Royal Enfield Bullet 350', fuel: 'Petrol', seats: 2, color: 'Police Blue', type: 'Highway Patrol Motorcycle' },
    { makeModel: 'Bajaj Pulsar 150', fuel: 'Petrol', seats: 2, color: 'White/Blue', type: 'Cheetah Mobile Patrol' },
    { makeModel: 'Hero Splendor Plus', fuel: 'Petrol', seats: 2, color: 'Black/Silver', type: 'Beat Patrol Two-Wheeler' },
    { makeModel: 'TVS Apache RTR 160', fuel: 'Petrol', seats: 2, color: 'White', type: 'Rapid Dispatch Motorcycle' }
  ],
  CAR: [
    { makeModel: 'Maruti Suzuki Dzire', fuel: 'Petrol', seats: 5, color: 'White', type: 'Official Staff Sedan' },
    { makeModel: 'Toyota Innova Crysta', fuel: 'Diesel', seats: 7, color: 'Silver', type: 'Executive Inspection SUV' },
    { makeModel: 'Maruti Suzuki Ciaz', fuel: 'Petrol', seats: 5, color: 'White', type: 'Administrative Staff Car' }
  ],
  PATROL_CAR: [
    { makeModel: 'Mahindra Scorpio-N', fuel: 'Diesel', seats: 7, color: 'Khaki/White', type: 'First Response Vehicle (FRV)' },
    { makeModel: 'Tata Safari Storme', fuel: 'Diesel', seats: 7, color: 'White/Blue', type: 'Police Patrol Cruiser' },
    { makeModel: 'Mahindra Bolero Neo', fuel: 'Diesel', seats: 7, color: 'White', type: 'Sector Interceptor SUV' }
  ],
  VAN: [
    { makeModel: 'Force Traveller 3350', fuel: 'Diesel', seats: 12, color: 'Police Blue', type: 'Personnel & Logistics Van' },
    { makeModel: 'Tata Winger Ambulance/Van', fuel: 'Diesel', seats: 9, color: 'White', type: 'Tactical Support Van' },
    { makeModel: 'Mahindra Bolero Camper', fuel: 'Diesel', seats: 5, color: 'Khaki', type: 'All-Terrain Utility Van' }
  ],
  CHHOTA_HATHI: [
    { makeModel: 'Tata Ace Gold Diesel', fuel: 'Diesel', seats: 2, color: 'White', type: 'Mini Goods Carrier' },
    { makeModel: 'Mahindra Jeeto Plus', fuel: 'Diesel', seats: 2, color: 'Blue', type: 'Light Logistics Mini-Truck' }
  ],
  TRUCK: [
    { makeModel: 'Tata LPT 1613 Heavy Duty', fuel: 'Diesel', seats: 3, color: 'Olive Green', type: 'Police Logistics Transport Truck' },
    { makeModel: 'Eicher Pro 2049 Truck', fuel: 'Diesel', seats: 3, color: 'Khaki', type: 'Barricade & Equipment Carrier' },
    { makeModel: 'Ashok Leyland 1618 Tipper', fuel: 'Diesel', seats: 3, color: 'Yellow/Black', type: 'Heavy Material Transport Truck' }
  ],
  BUS: [
    { makeModel: 'Tata Starbus 32-Seater', fuel: 'Diesel', seats: 32, color: 'Police Blue', type: 'Police Force Personnel Carrier' },
    { makeModel: 'Ashok Leyland Viking 40-Seater', fuel: 'Diesel', seats: 40, color: 'Dark Blue', type: 'Cadet & Battalion Transport Bus' }
  ],
  JCB: [
    { makeModel: 'JCB 3DX Super EcoXcellence', fuel: 'Diesel', seats: 1, color: 'Yellow', type: 'Earth Mover & Backhoe Loader' },
    { makeModel: 'CAT 424B Heavy Backhoe', fuel: 'Diesel', seats: 1, color: 'Yellow', type: 'Demolition & Debris Clearance JCB' }
  ],
  HEAVY: [
    { makeModel: 'Ashok Leyland 2518 Vajra Riot Truck', fuel: 'Diesel', seats: 3, color: 'Olive Green', type: 'Vajra Riot Control Water Cannon' },
    { makeModel: 'Tata Prima Heavy Recovery Truck', fuel: 'Diesel', seats: 2, color: 'Yellow/Orange', type: 'Heavy Breakdown Recovery Unit' }
  ],
  SPECIALIZED: [
    { makeModel: 'Mahindra Marksman Armoured Carrier', fuel: 'Diesel', seats: 6, color: 'Matte Black', type: 'Armoured Tactical QRT Vehicle' },
    { makeModel: 'Force Gurkha Command Post', fuel: 'Diesel', seats: 4, color: 'Olive Green', type: 'Mobile Incident Command Center' }
  ]
};

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export interface Point14SeedSummary {
  stationsCount: number;
  vehiclesCount: number;
  vehiclesPerStation: Record<string, number>;
  operatorsCount: number;
  requestsCount: number;
  allocationsCount: number;
}

/**
 * Idempotently seeds Point 14 fleet data for the 8 core Gwalior police stations.
 * Every station gets exactly 20 registered vehicles (~160 total), authentic inter-station
 * requests, active/overdue/partial/damaged allocations, and verified station accounts.
 */
export async function seedPoint14Fleet(prisma: PrismaClient): Promise<Point14SeedSummary> {
  console.log('[Point 14] Starting high-fidelity fleet seeding for 8 Gwalior police stations...');

  // 1. Ensure Police Organization exists
  let policeOrg = await prisma.organization.findUnique({ where: { code: 'GWL-POLICE' } });
  if (!policeOrg) {
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
    policeOrg = await prisma.organization.create({
      data: {
        code: 'GWL-POLICE',
        name: 'Gwalior District Police (MP Police)',
        kind: 'POLICE',
        parentId: districtOrg.id
      }
    });
  }

  // 2. Upsert the 8 target police stations
  const stationIdMap = new Map<string, string>();
  for (const t of TARGET_STATIONS) {
    const station = await prisma.station.upsert({
      where: { code: t.slug },
      update: {
        name: t.name,
        organizationId: policeOrg.id,
        zone: t.zone,
        district: 'Gwalior',
        lat: t.lat,
        lng: t.lng,
        inchargeName: t.inchargeName,
        phone: t.phone
      },
      create: {
        code: t.slug,
        name: t.name,
        organizationId: policeOrg.id,
        zone: t.zone,
        district: 'Gwalior',
        lat: t.lat,
        lng: t.lng,
        inchargeName: t.inchargeName,
        phone: t.phone
      }
    });
    stationIdMap.set(t.slug, station.id);
  }

  // 3. Upsert Operator accounts for all 8 stations + Admin
  const passwordHash = await hashPassword(POINT14_DEMO_PASSWORD);
  let operatorCount = 0;

  // Platform admin
  await prisma.operator.upsert({
    where: { username: 'admin' },
    update: {
      displayName: 'Platform Administrator',
      role: 'ADMIN',
      active: true
    },
    create: {
      username: 'admin',
      displayName: 'Platform Administrator',
      email: 'admin@sanchay.demo',
      phone: '+91 75124 46200',
      role: 'ADMIN',
      passwordHash,
      active: true
    }
  });
  operatorCount++;

  for (const t of TARGET_STATIONS) {
    const stationId = stationIdMap.get(t.slug)!;
    const baseSlug = t.slug.replace(/-police-station$/u, '');
    const usernames = [`ps.${baseSlug}`, `station.${baseSlug}`];

    for (const username of usernames) {
      await prisma.operator.upsert({
        where: { username },
        update: {
          displayName: `${t.inchargeName} (${t.name})`,
          role: 'STATION_OFFICER',
          organizationId: policeOrg.id,
          stationId,
          active: true
        },
        create: {
          username,
          displayName: `${t.inchargeName} (${t.name})`,
          email: `${username}@sanchay.demo`,
          phone: t.phone,
          role: 'STATION_OFFICER',
          organizationId: policeOrg.id,
          stationId,
          passwordHash,
          active: true
        }
      });
      operatorCount++;
    }
  }

  // 4. Clean up any existing Point 14 demo allocations & requests to enable clean re-runs
  // Find all requests with code starting with 'REQ-2026-DEMO-' or involving the demo fleet
  const oldDemoRequests = await prisma.assetRequest.findMany({
    where: {
      OR: [
        { requestCode: { startsWith: 'REQ-2026-DEMO-' } },
        { requestCode: { startsWith: 'REQ-DEMO-' } }
      ]
    },
    select: { id: true }
  });

  if (oldDemoRequests.length > 0) {
    const reqIds = oldDemoRequests.map((r) => r.id);
    const oldAllocations = await prisma.allocation.findMany({
      where: { requestId: { in: reqIds } },
      select: { id: true }
    });
    const allocIds = oldAllocations.map((a) => a.id);

    if (allocIds.length > 0) {
      await prisma.handoverRecord.deleteMany({ where: { allocationId: { in: allocIds } } });
      await prisma.returnRecord.deleteMany({ where: { allocationId: { in: allocIds } } });
      await prisma.extensionRequest.deleteMany({ where: { allocationId: { in: allocIds } } });
      await prisma.allocation.deleteMany({ where: { id: { in: allocIds } } });
    }
    await prisma.approvalStep.deleteMany({ where: { requestId: { in: reqIds } } });
    await prisma.assetRequest.deleteMany({ where: { id: { in: reqIds } } });
  }

  // Also clean up any prior demo auxiliary records for demo fleet vehicles
  await prisma.maintenanceRecord.deleteMany({
    where: { ticketCode: { startsWith: 'MT-DEMO-' } }
  });
  await prisma.legalRecord.deleteMany({
    where: { referenceNo: { contains: 'DEMO' } }
  });
  await prisma.vehicleRestriction.deleteMany({
    where: { vehicle: { assetCode: { startsWith: 'SCH-DEMO-' } } }
  });
  await prisma.vehicleOwnershipVerification.deleteMany({
    where: { vehicle: { assetCode: { startsWith: 'SCH-DEMO-' } } }
  });

  // 5. Seed Exactly 20 Vehicles for each of the 8 stations (Total 160 vehicles)
  const seededVehicleIdsByStation = new Map<string, string[]>();
  const seededVehiclesByCode = new Map<string, { id: string; vehicleClass: VehicleClass; stationSlug: string }>();
  let totalVehicles = 0;

  for (const t of TARGET_STATIONS) {
    const stationId = stationIdMap.get(t.slug)!;
    const vehicleList: string[] = [];
    let stationVehicleSeq = 0;

    // Iterate through distribution
    for (const [classKey, count] of Object.entries(t.distribution) as Array<[VehicleClass, number]>) {
      for (let i = 0; i < count; i++) {
        stationVehicleSeq++;
        const assetCode = `SCH-DEMO-${t.shortCode}-${String(stationVehicleSeq).padStart(2, '0')}`;
        const regNumber = `MP07-DEMO-${t.shortCode}-${String(stationVehicleSeq).padStart(2, '0')}`;
        const normReg = normalizeRegistration(regNumber);

        // Models pick
        const modelsList = VEHICLE_MODELS[classKey] || VEHICLE_MODELS.CAR;
        const modelPick = modelsList[i % modelsList.length];

        // Status assignment:
        // Index 17 (17th vehicle): MAINTENANCE & INELIGIBLE
        // Index 18 (18th vehicle): MAINTENANCE & INELIGIBLE
        // Index 19 (19th vehicle): OUT_OF_SERVICE & SEIZED_IMPOUNDED
        // Index 20 (20th vehicle): ACTIVE & RESTRICTED (Court hold / Safety check)
        // Others (1-16): ACTIVE & ELIGIBLE
        let operationalStatus = 'ACTIVE';
        let ownershipCategory = 'GOVERNMENT_FLEET';
        let eligibilityState = 'ELIGIBLE';
        let verifyStatus = 'VERIFIED';
        let maintenanceTicket: string | null = null;
        let legalCase: string | null = null;
        let restrictionType: string | null = null;

        if (stationVehicleSeq === 4) {
          operationalStatus = 'MAINTENANCE';
          eligibilityState = 'INELIGIBLE';
          maintenanceTicket = `MT-DEMO-${t.shortCode}-01`;
        } else if (stationVehicleSeq === 5) {
          operationalStatus = 'OUT_OF_SERVICE';
          ownershipCategory = 'SEIZED_IMPOUNDED';
          eligibilityState = 'INELIGIBLE';
          verifyStatus = 'PENDING';
          legalCase = `CJM-GWL-DEMO-2026-${t.shortCode}-01`;
          restrictionType = 'LEGAL_CUSTODY';
        } else if (stationVehicleSeq === 8) {
          operationalStatus = 'MAINTENANCE';
          eligibilityState = 'INELIGIBLE';
          maintenanceTicket = `MT-DEMO-${t.shortCode}-02`;
        } else if (stationVehicleSeq === 10) {
          operationalStatus = 'ACTIVE';
          eligibilityState = 'RESTRICTED';
          restrictionType = 'COURT_ORDER';
        }

        const latOffset = (Math.sin(stationVehicleSeq * 2.3) * 0.005);
        const lngOffset = (Math.cos(stationVehicleSeq * 2.3) * 0.005);

        const vehicle = await prisma.vehicle.upsert({
          where: { assetCode },
          update: {
            registrationNumber: regNumber,
            registrationNormalized: normReg,
            displayName: `${t.name} ${modelPick.type} (${assetCode})`,
            sector: 'POLICE_PATROL',
            vehicleClass: classKey,
            vehicleType: modelPick.type,
            organizationId: policeOrg.id,
            stationId,
            makeModel: modelPick.makeModel,
            year: 2021 + (stationVehicleSeq % 4),
            fuelType: modelPick.fuel,
            seating: modelPick.seats,
            color: modelPick.color,
            operationalStatus,
            ownershipCategory,
            eligibilityState,
            status: operationalStatus === 'ACTIVE' ? 'IDLE' : 'BREAKDOWN',
            odometerKm: 5000 + stationVehicleSeq * 1800,
            fuelPercent: 70 + (stationVehicleSeq % 25),
            lat: t.lat + latOffset,
            lng: t.lng + lngOffset,
            pucExpiry: daysFromNow(stationVehicleSeq === 18 ? -20 : 180),
            insuranceExpiry: daysFromNow(stationVehicleSeq === 18 ? -10 : 240),
            fitnessExpiry: daysFromNow(200),
            driverName: operationalStatus === 'ACTIVE' ? `Constable D. ${t.shortCode}-${stationVehicleSeq}` : null,
            driverPhone: operationalStatus === 'ACTIVE' ? `+91 94251 ${String(10000 + stationVehicleSeq).slice(1)}` : null
          },
          create: {
            assetCode,
            registrationNumber: regNumber,
            registrationNormalized: normReg,
            displayName: `${t.name} ${modelPick.type} (${assetCode})`,
            sector: 'POLICE_PATROL',
            vehicleClass: classKey,
            vehicleType: modelPick.type,
            organizationId: policeOrg.id,
            stationId,
            makeModel: modelPick.makeModel,
            year: 2021 + (stationVehicleSeq % 4),
            fuelType: modelPick.fuel,
            seating: modelPick.seats,
            color: modelPick.color,
            operationalStatus,
            ownershipCategory,
            eligibilityState,
            status: operationalStatus === 'ACTIVE' ? 'IDLE' : 'BREAKDOWN',
            odometerKm: 5000 + stationVehicleSeq * 1800,
            fuelPercent: 70 + (stationVehicleSeq % 25),
            lat: t.lat + latOffset,
            lng: t.lng + lngOffset,
            pucExpiry: daysFromNow(stationVehicleSeq === 18 ? -20 : 180),
            insuranceExpiry: daysFromNow(stationVehicleSeq === 18 ? -10 : 240),
            fitnessExpiry: daysFromNow(200),
            driverName: operationalStatus === 'ACTIVE' ? `Constable D. ${t.shortCode}-${stationVehicleSeq}` : null,
            driverPhone: operationalStatus === 'ACTIVE' ? `+91 94251 ${String(10000 + stationVehicleSeq).slice(1)}` : null,
            createdBy: 'seed-point14'
          }
        });

        // Ensure Ownership Verification record exists
        await prisma.vehicleOwnershipVerification.create({
          data: {
            vehicleId: vehicle.id,
            category: ownershipCategory,
            status: verifyStatus,
            evidenceRef: ownershipCategory === 'SEIZED_IMPOUNDED'
              ? `Case #${legalCase} - Evidence Item #1`
              : `MP Police RTO Gwalior Fleet Record #${assetCode}`,
            submittedBy: 'system-seed',
            verifiedBy: verifyStatus === 'VERIFIED' ? 'org.police' : null,
            verifiedAt: verifyStatus === 'VERIFIED' ? daysFromNow(-30) : null
          }
        });

        // Maintenance record if maintenance
        if (maintenanceTicket) {
          await prisma.maintenanceRecord.create({
            data: {
              ticketCode: maintenanceTicket,
              vehicleId: vehicle.id,
              title: stationVehicleSeq === 17 ? 'Scheduled brake and clutch maintenance' : 'Engine overhaul and fuel system repair',
              severity: 'HIGH',
              status: 'IN_PROGRESS',
              dueDate: daysFromNow(3),
              blocksAvailability: true,
              raisedBy: `ps.${t.slug.replace(/-police-station$/, '')}`
            }
          });
        }

        // Seizure legal record if impounded
        if (legalCase) {
          await prisma.legalRecord.create({
            data: {
              vehicleId: vehicle.id,
              type: 'SEIZURE',
              referenceNo: legalCase,
              date: daysFromNow(-45),
              description: 'Seized during highway anti-smuggling checkpoint under Section 102 CrPC',
              status: 'ACTIVE',
              authority: 'CJM Court Gwalior'
            }
          });
        }

        // Restriction if applicable
        if (restrictionType) {
          await prisma.vehicleRestriction.create({
            data: {
              vehicleId: vehicle.id,
              type: restrictionType,
              reasonCode: restrictionType === 'LEGAL_CUSTODY' ? 'SEIZED' : 'COURT_HOLD',
              description: restrictionType === 'LEGAL_CUSTODY'
                ? 'Impounded vehicle under court custody, cannot be deployed'
                : 'Vehicle retained as material exhibit in ongoing trial proceedings',
              authority: 'District Court Gwalior',
              decidedBy: 'seed-point14'
            }
          });
        }

        vehicleList.push(vehicle.id);
        seededVehiclesByCode.set(assetCode, { id: vehicle.id, vehicleClass: classKey, stationSlug: t.slug });
        totalVehicles++;
      }
    }

    seededVehicleIdsByStation.set(t.slug, vehicleList);
  }

  // 6. Seed Realistic Inter-Station Requests & Allocations
  console.log('[Point 14] Seeding realistic inter-station requests and allocations...');
  let requestsCount = 0;
  let allocationsCount = 0;

  const padavId = stationIdMap.get('padav-police-station')!;
  const maharajpuraId = stationIdMap.get('maharajpura-police-station')!;
  const thatipurId = stationIdMap.get('thatipur-police-station')!;
  const universityId = stationIdMap.get('university-police-station')!;
  const jhansiRoadId = stationIdMap.get('jhansi-road-police-station')!;
  const morarId = stationIdMap.get('morar-police-station')!;
  const gwaliorId = stationIdMap.get('gwalior-police-station')!;
  const bahodapurId = stationIdMap.get('bahodapur-police-station')!;

  // SCENARIO 1: Padav -> Maharajpura (PENDING_APPROVAL)
  // Requesting 2 Trucks for barricade and highway perimeter patrol
  {
    const req = await prisma.assetRequest.create({
      data: {
        requestCode: 'REQ-2026-DEMO-001',
        requestingOrgId: policeOrg.id,
        requestingStationId: padavId,
        providerStationId: maharajpuraId,
        requesterUsername: 'ps.padav',
        requesterName: 'Insp. Rajesh Tomar (Padav PS)',
        requestedClass: 'TRUCK',
        quantity: 2,
        purpose: 'Barricade and heavy security gear transport for VIP route bandobast',
        destination: 'Padav Junction - Station Area',
        passengers: 2,
        startAt: daysFromNow(1),
        endAt: daysFromNow(3),
        accountableOfficer: 'Insp. Rajesh Tomar',
        accountablePhone: '+91 77010 46915',
        state: 'PENDING_APPROVAL',
        approverOrgId: policeOrg.id,
        submittedAt: daysFromNow(-0.5)
      }
    });
    await prisma.approvalStep.create({
      data: {
        requestId: req.id,
        stepOrder: 1,
        approverOrgId: policeOrg.id,
        decision: 'PENDING'
      }
    });
    requestsCount++;
  }

  // SCENARIO 2: Thatipur -> Padav (PENDING_APPROVAL)
  // Requesting 1 Car for VIP route escort
  {
    const req = await prisma.assetRequest.create({
      data: {
        requestCode: 'REQ-2026-DEMO-002',
        requestingOrgId: policeOrg.id,
        requestingStationId: thatipurId,
        providerStationId: padavId,
        requesterUsername: 'ps.thatipur',
        requesterName: 'Insp. S. K. Sharma (Thatipur PS)',
        requestedClass: 'CAR',
        quantity: 1,
        purpose: 'Inter-station VIP route escort and convoy backup along arterial road',
        destination: 'Thatipur Circle to Railway Station',
        passengers: 4,
        startAt: daysFromNow(2),
        endAt: daysFromNow(4),
        accountableOfficer: 'Insp. S. K. Sharma',
        accountablePhone: '+91 77010 46922',
        state: 'PENDING_APPROVAL',
        approverOrgId: policeOrg.id,
        submittedAt: daysFromNow(-0.2)
      }
    });
    await prisma.approvalStep.create({
      data: {
        requestId: req.id,
        stepOrder: 1,
        approverOrgId: policeOrg.id,
        decision: 'PENDING'
      }
    });
    requestsCount++;
  }

  // SCENARIO 3: University -> Morar (APPROVED -> ACTIVE on loan)
  // Requesting 1 Bus from Morar for student event security
  {
    const morarBus = seededVehiclesByCode.get('SCH-DEMO-MR-17') || seededVehiclesByCode.get('SCH-DEMO-MR-16');
    const busId = morarBus ? morarBus.id : (seededVehicleIdsByStation.get('morar-police-station')![15]);

    const req = await prisma.assetRequest.create({
      data: {
        requestCode: 'REQ-2026-DEMO-003',
        requestingOrgId: policeOrg.id,
        requestingStationId: universityId,
        providerStationId: morarId,
        requesterUsername: 'ps.university',
        requesterName: 'Insp. Devendra Mishra (University PS)',
        vehicleId: busId,
        requestedClass: 'BUS',
        quantity: 1,
        purpose: 'Personnel deployment for annual university convocation bandobast',
        destination: 'Jiwaji University Campus, Gwalior',
        passengers: 32,
        startAt: daysFromNow(-1),
        endAt: daysFromNow(2),
        accountableOfficer: 'Insp. Devendra Mishra',
        accountablePhone: '+91 77010 46918',
        state: 'APPROVED',
        approverOrgId: policeOrg.id,
        submittedAt: daysFromNow(-2),
        decidedAt: daysFromNow(-1.5),
        decidedBy: 'ps.morar'
      }
    });
    await prisma.approvalStep.create({
      data: {
        requestId: req.id,
        stepOrder: 1,
        approverOrgId: policeOrg.id,
        decision: 'APPROVED',
        decidedBy: 'ps.morar',
        decidedAt: daysFromNow(-1.5)
      }
    });
    requestsCount++;

    const alloc = await prisma.allocation.create({
      data: {
        allocationCode: 'ALL-2026-DEMO-003',
        requestId: req.id,
        vehicleId: busId,
        assignedVehicleIds: [busId],
        borrowingStationId: universityId,
        lendingStationId: morarId,
        quantity: 1,
        returnedQuantity: 0,
        startAt: daysFromNow(-1),
        endAt: daysFromNow(2),
        lifecycle: 'ACTIVE',
        createdBy: 'ps.morar'
      }
    });
    await prisma.handoverRecord.create({
      data: {
        allocationId: alloc.id,
        handedOverBy: 'ps.morar',
        receivedBy: 'Head Constable Manoj Tomar (University PS)',
        conditionNotes: 'All 32 passenger seats intact; tyres 80%; logbook handed over',
        odometerKm: 34200,
        fuelPercent: 85,
        checklist: [{ item: 'First aid box', present: true }, { item: 'Spare tyre', present: true }, { item: 'Toolkit', present: true }]
      }
    });
    allocationsCount++;
  }

  // SCENARIO 4: Gwalior -> Padav (APPROVED -> OVERDUE on loan)
  // Requesting 2 Motorcycles from Padav for intense patrol. Loan is past due!
  {
    const padavMc1 = seededVehicleIdsByStation.get('padav-police-station')![0];
    const padavMc2 = seededVehicleIdsByStation.get('padav-police-station')![1];

    const req = await prisma.assetRequest.create({
      data: {
        requestCode: 'REQ-2026-DEMO-004',
        requestingOrgId: policeOrg.id,
        requestingStationId: gwaliorId,
        providerStationId: padavId,
        requesterUsername: 'ps.gwalior',
        requesterName: 'Insp. Alok Verma (Gwalior PS)',
        requestedClass: 'MOTORCYCLE',
        quantity: 2,
        purpose: 'Intensive anti-cheating patrol during board exam shifts across city sectors',
        destination: 'Gwalior Fort & Lashkar Sector',
        passengers: 2,
        startAt: daysFromNow(-3),
        endAt: daysFromNow(-0.5), // Ended 12 hours ago!
        accountableOfficer: 'Insp. Alok Verma',
        accountablePhone: '+91 77010 46923',
        state: 'APPROVED',
        approverOrgId: policeOrg.id,
        submittedAt: daysFromNow(-4),
        decidedAt: daysFromNow(-3.5),
        decidedBy: 'ps.padav'
      }
    });
    await prisma.approvalStep.create({
      data: {
        requestId: req.id,
        stepOrder: 1,
        approverOrgId: policeOrg.id,
        decision: 'APPROVED',
        decidedBy: 'ps.padav',
        decidedAt: daysFromNow(-3.5)
      }
    });
    requestsCount++;

    const alloc = await prisma.allocation.create({
      data: {
        allocationCode: 'ALL-2026-DEMO-004',
        requestId: req.id,
        assignedVehicleIds: [padavMc1, padavMc2],
        borrowingStationId: gwaliorId,
        lendingStationId: padavId,
        quantity: 2,
        returnedQuantity: 0,
        startAt: daysFromNow(-3),
        endAt: daysFromNow(-0.5),
        lifecycle: 'OVERDUE',
        createdBy: 'ps.padav'
      }
    });
    await prisma.handoverRecord.create({
      data: {
        allocationId: alloc.id,
        handedOverBy: 'ps.padav',
        receivedBy: 'Sub-Insp. Ravi Sharma (Gwalior PS)',
        conditionNotes: 'Both motorcycles fueled to capacity; helmets provided',
        odometerKm: 12500,
        fuelPercent: 90,
        checklist: [{ item: 'Helmets (2 pairs)', present: true }, { item: 'RC Card', present: true }]
      }
    });
    allocationsCount++;
  }

  // SCENARIO 5: Bahodapur -> Jhansi Road (APPROVED -> PARTIALLY_RETURNED)
  // Requesting 2 Vans from Jhansi Road. 1 Van returned, 1 still active!
  {
    const jrVan1 = seededVehicleIdsByStation.get('jhansi-road-police-station')![11];
    const jrVan2 = seededVehicleIdsByStation.get('jhansi-road-police-station')![12];

    const req = await prisma.assetRequest.create({
      data: {
        requestCode: 'REQ-2026-DEMO-005',
        requestingOrgId: policeOrg.id,
        requestingStationId: bahodapurId,
        providerStationId: jhansiRoadId,
        requesterUsername: 'ps.bahodapur',
        requesterName: 'Sub-Insp. Priya Saxena (Bahodapur PS)',
        requestedClass: 'VAN',
        quantity: 2,
        purpose: 'Multi-point perimeter cordon and checkpoint patrol',
        destination: 'Bahodapur Industrial Sector & Highway',
        passengers: 8,
        startAt: daysFromNow(-2),
        endAt: daysFromNow(2),
        accountableOfficer: 'Sub-Insp. Priya Saxena',
        accountablePhone: '+91 77010 46925',
        state: 'APPROVED',
        approverOrgId: policeOrg.id,
        submittedAt: daysFromNow(-3),
        decidedAt: daysFromNow(-2.5),
        decidedBy: 'ps.jhansi-road'
      }
    });
    await prisma.approvalStep.create({
      data: {
        requestId: req.id,
        stepOrder: 1,
        approverOrgId: policeOrg.id,
        decision: 'APPROVED',
        decidedBy: 'ps.jhansi-road',
        decidedAt: daysFromNow(-2.5)
      }
    });
    requestsCount++;

    const alloc = await prisma.allocation.create({
      data: {
        allocationCode: 'ALL-2026-DEMO-005',
        requestId: req.id,
        assignedVehicleIds: [jrVan1, jrVan2],
        borrowingStationId: bahodapurId,
        lendingStationId: jhansiRoadId,
        quantity: 2,
        returnedQuantity: 1,
        returnDetails: {
          returnedVehicleIds: [jrVan1],
          pendingReturnQuantity: 1
        },
        startAt: daysFromNow(-2),
        endAt: daysFromNow(2),
        lifecycle: 'PARTIALLY_RETURNED',
        createdBy: 'ps.jhansi-road'
      }
    });
    await prisma.handoverRecord.create({
      data: {
        allocationId: alloc.id,
        handedOverBy: 'ps.jhansi-road',
        receivedBy: 'Constable Anand Singh (Bahodapur PS)',
        conditionNotes: 'Both utility vans in clean operational condition',
        odometerKm: 28400,
        fuelPercent: 80,
        checklist: [{ item: 'Spare tyre', present: true }, { item: 'Torch', present: true }]
      }
    });
    await prisma.returnRecord.create({
      data: {
        allocationId: alloc.id,
        returnedBy: 'Constable Anand Singh',
        receivedBy: 'ps.jhansi-road',
        conditionNotes: 'First van returned ahead of schedule in normal condition',
        odometerKm: 28550,
        fuelPercent: 70,
        inspectionRequired: true,
        inspectionStatus: 'ACCEPTED',
        inspectedBy: 'ps.jhansi-road',
        inspectedAt: daysFromNow(-0.5),
        inspectionNotes: 'Verified vehicle returned in sound order. Accepted.'
      }
    });
    allocationsCount++;
  }

  // SCENARIO 6: Thatipur -> Maharajpura (CLOSED / DAMAGED RETURN)
  // Requesting 1 Truck. Returned with damage, routed to MAINTENANCE & INELIGIBLE
  {
    const mhTruck = seededVehiclesByCode.get('SCH-DEMO-MH-17') || seededVehiclesByCode.get('SCH-DEMO-MH-15');
    const mhTruckId = mhTruck ? mhTruck.id : seededVehicleIdsByStation.get('maharajpura-police-station')![14];

    const req = await prisma.assetRequest.create({
      data: {
        requestCode: 'REQ-2026-DEMO-006',
        requestingOrgId: policeOrg.id,
        requestingStationId: thatipurId,
        providerStationId: maharajpuraId,
        requesterUsername: 'ps.thatipur',
        requesterName: 'Insp. S. K. Sharma (Thatipur PS)',
        vehicleId: mhTruckId,
        requestedClass: 'TRUCK',
        quantity: 1,
        purpose: 'Emergency disaster relief and sandbag transport for canal overflow',
        destination: 'Morar River Canal Embankment',
        passengers: 3,
        startAt: daysFromNow(-4),
        endAt: daysFromNow(-1),
        accountableOfficer: 'Insp. S. K. Sharma',
        accountablePhone: '+91 77010 46922',
        state: 'APPROVED',
        approverOrgId: policeOrg.id,
        submittedAt: daysFromNow(-5),
        decidedAt: daysFromNow(-4.5),
        decidedBy: 'ps.maharajpura'
      }
    });
    await prisma.approvalStep.create({
      data: {
        requestId: req.id,
        stepOrder: 1,
        approverOrgId: policeOrg.id,
        decision: 'APPROVED',
        decidedBy: 'ps.maharajpura',
        decidedAt: daysFromNow(-4.5)
      }
    });
    requestsCount++;

    const alloc = await prisma.allocation.create({
      data: {
        allocationCode: 'ALL-2026-DEMO-006',
        requestId: req.id,
        vehicleId: mhTruckId,
        assignedVehicleIds: [mhTruckId],
        borrowingStationId: thatipurId,
        lendingStationId: maharajpuraId,
        quantity: 1,
        returnedQuantity: 1,
        returnDetails: {
          returnedVehicleIds: [mhTruckId],
          damagedVehicleIds: [mhTruckId],
          damageNotes: 'Severe clutch wear and radiator leakage noticed on return.'
        },
        startAt: daysFromNow(-4),
        endAt: daysFromNow(-1),
        lifecycle: 'CLOSED',
        createdBy: 'ps.maharajpura'
      }
    });
    await prisma.handoverRecord.create({
      data: {
        allocationId: alloc.id,
        handedOverBy: 'ps.maharajpura',
        receivedBy: 'Insp. S. K. Sharma',
        conditionNotes: 'Truck dispatched in good working order',
        odometerKm: 42100,
        fuelPercent: 90,
        checklist: [{ item: 'Hydraulic jack', present: true }, { item: 'Reflective triangles', present: true }]
      }
    });
    await prisma.returnRecord.create({
      data: {
        allocationId: alloc.id,
        returnedBy: 'Insp. S. K. Sharma',
        receivedBy: 'ps.maharajpura',
        conditionNotes: 'Severe clutch slippage and radiator leaking after heavy sandbag duty',
        odometerKm: 42420,
        fuelPercent: 40,
        discrepancies: 'Radiator damage and clutch assembly burn',
        inspectionRequired: true,
        inspectionStatus: 'DISPUTED',
        inspectedBy: 'ps.maharajpura',
        inspectedAt: daysFromNow(-1),
        inspectionNotes: 'Vehicle flagged damaged. Sent directly to police central workshop for repairs.'
      }
    });
    allocationsCount++;

    // Mark the returned vehicle as MAINTENANCE & INELIGIBLE
    await prisma.vehicle.update({
      where: { id: mhTruckId },
      data: {
        operationalStatus: 'MAINTENANCE',
        eligibilityState: 'INELIGIBLE',
        notes: 'Returned damaged from Thatipur PS loan. Clutch overhaul in progress.'
      }
    });
    await prisma.maintenanceRecord.create({
      data: {
        ticketCode: 'MT-DEMO-MH-RETURN-01',
        vehicleId: mhTruckId,
        title: 'Emergency clutch assembly and radiator repair',
        severity: 'CRITICAL',
        status: 'IN_PROGRESS',
        dueDate: daysFromNow(4),
        blocksAvailability: true,
        raisedBy: 'ps.maharajpura'
      }
    });
  }

  // SCENARIO 7: Maharajpura -> Thatipur (COMPLETED / CLEAN RETURN)
  // Requesting 1 JCB. Returned cleanly, restored to availability
  {
    const thJcb = seededVehiclesByCode.get('SCH-DEMO-TH-18');
    const thJcbId = thJcb ? thJcb.id : seededVehicleIdsByStation.get('thatipur-police-station')![17];

    const req = await prisma.assetRequest.create({
      data: {
        requestCode: 'REQ-2026-DEMO-007',
        requestingOrgId: policeOrg.id,
        requestingStationId: maharajpuraId,
        providerStationId: thatipurId,
        requesterUsername: 'ps.maharajpura',
        requesterName: 'Insp. R. S. Jadon (Maharajpura PS)',
        vehicleId: thJcbId,
        requestedClass: 'JCB',
        quantity: 1,
        purpose: 'Clearing fallen trees and debris along Airport road following thunderstorm',
        destination: 'Airport Road, Maharajpura Sector',
        passengers: 1,
        startAt: daysFromNow(-5),
        endAt: daysFromNow(-2),
        accountableOfficer: 'Insp. R. S. Jadon',
        accountablePhone: '+91 77010 46920',
        state: 'APPROVED',
        approverOrgId: policeOrg.id,
        submittedAt: daysFromNow(-6),
        decidedAt: daysFromNow(-5.5),
        decidedBy: 'ps.thatipur'
      }
    });
    await prisma.approvalStep.create({
      data: {
        requestId: req.id,
        stepOrder: 1,
        approverOrgId: policeOrg.id,
        decision: 'APPROVED',
        decidedBy: 'ps.thatipur',
        decidedAt: daysFromNow(-5.5)
      }
    });
    requestsCount++;

    const alloc = await prisma.allocation.create({
      data: {
        allocationCode: 'ALL-2026-DEMO-007',
        requestId: req.id,
        vehicleId: thJcbId,
        assignedVehicleIds: [thJcbId],
        borrowingStationId: maharajpuraId,
        lendingStationId: thatipurId,
        quantity: 1,
        returnedQuantity: 1,
        returnDetails: {
          returnedVehicleIds: [thJcbId]
        },
        startAt: daysFromNow(-5),
        endAt: daysFromNow(-2),
        lifecycle: 'COMPLETED',
        createdBy: 'ps.thatipur'
      }
    });
    await prisma.handoverRecord.create({
      data: {
        allocationId: alloc.id,
        handedOverBy: 'ps.thatipur',
        receivedBy: 'JCB Operator Suresh Tomar',
        conditionNotes: 'Hydraulics pressure tested, bucket in good condition',
        odometerKm: 3100,
        fuelPercent: 95,
        checklist: [{ item: 'Hydraulic safety lock', present: true }]
      }
    });
    await prisma.returnRecord.create({
      data: {
        allocationId: alloc.id,
        returnedBy: 'JCB Operator Suresh Tomar',
        receivedBy: 'ps.thatipur',
        conditionNotes: 'Washed and greased; all hydraulic functions normal',
        odometerKm: 3180,
        fuelPercent: 80,
        inspectionRequired: true,
        inspectionStatus: 'ACCEPTED',
        inspectedBy: 'ps.thatipur',
        inspectedAt: daysFromNow(-2),
        inspectionNotes: 'Returned in clean and fully functional condition.'
      }
    });
    allocationsCount++;
  }

  // SCENARIO 8: Morar -> Bahodapur (REJECTED)
  {
    const req = await prisma.assetRequest.create({
      data: {
        requestCode: 'REQ-2026-DEMO-008',
        requestingOrgId: policeOrg.id,
        requestingStationId: morarId,
        providerStationId: bahodapurId,
        requesterUsername: 'ps.morar',
        requesterName: 'Insp. K. P. Singh (Morar PS)',
        requestedClass: 'TRUCK',
        quantity: 1,
        purpose: 'Transport of seized evidence materials to district central malkhana',
        destination: 'District Malkhana, Gwalior',
        passengers: 2,
        startAt: daysFromNow(1),
        endAt: daysFromNow(2),
        accountableOfficer: 'Insp. K. P. Singh',
        accountablePhone: '+91 77010 46921',
        state: 'REJECTED',
        approverOrgId: policeOrg.id,
        decisionReason: 'All station transport trucks currently committed to continuous municipal flood wall reinforcements',
        submittedAt: daysFromNow(-1),
        decidedAt: daysFromNow(-0.5),
        decidedBy: 'ps.bahodapur'
      }
    });
    await prisma.approvalStep.create({
      data: {
        requestId: req.id,
        stepOrder: 1,
        approverOrgId: policeOrg.id,
        decision: 'REJECTED',
        decidedBy: 'ps.bahodapur',
        comment: 'All station transport trucks currently committed to continuous municipal flood wall reinforcements',
        decidedAt: daysFromNow(-0.5)
      }
    });
    requestsCount++;
  }

  // SCENARIO 9: Jhansi Road -> University (CANCELLED)
  {
    const req = await prisma.assetRequest.create({
      data: {
        requestCode: 'REQ-2026-DEMO-009',
        requestingOrgId: policeOrg.id,
        requestingStationId: jhansiRoadId,
        providerStationId: universityId,
        requesterUsername: 'ps.jhansi-road',
        requesterName: 'Insp. Sanjay Rathore (Jhansi Road PS)',
        requestedClass: 'CAR',
        quantity: 1,
        purpose: 'Inspection round by sub-divisional magistrate',
        destination: 'Jhansi Road Sub-Division',
        passengers: 3,
        startAt: daysFromNow(2),
        endAt: daysFromNow(3),
        accountableOfficer: 'Insp. Sanjay Rathore',
        accountablePhone: '+91 77010 46919',
        state: 'CANCELLED',
        approverOrgId: policeOrg.id,
        decisionReason: 'SDM visit rescheduled; local departmental car allocated',
        submittedAt: daysFromNow(-2),
        decidedAt: daysFromNow(-1),
        decidedBy: 'ps.jhansi-road'
      }
    });
    requestsCount++;
  }

  // SCENARIO 10: Padav -> University (APPROVED -> RESERVED future allocation)
  {
    const unCar = seededVehiclesByCode.get('SCH-DEMO-UN-09');
    const unCarId = unCar ? unCar.id : seededVehicleIdsByStation.get('university-police-station')![8];

    const req = await prisma.assetRequest.create({
      data: {
        requestCode: 'REQ-2026-DEMO-010',
        requestingOrgId: policeOrg.id,
        requestingStationId: padavId,
        providerStationId: universityId,
        requesterUsername: 'ps.padav',
        requesterName: 'Insp. Rajesh Tomar (Padav PS)',
        vehicleId: unCarId,
        requestedClass: 'CAR',
        quantity: 1,
        purpose: 'State assembly committee visit protocol duty',
        destination: 'Gwalior Collectorate & VIP Circuit House',
        passengers: 4,
        startAt: daysFromNow(2),
        endAt: daysFromNow(5),
        accountableOfficer: 'Insp. Rajesh Tomar',
        accountablePhone: '+91 77010 46915',
        state: 'APPROVED',
        approverOrgId: policeOrg.id,
        submittedAt: daysFromNow(-1),
        decidedAt: daysFromNow(-0.5),
        decidedBy: 'ps.university'
      }
    });
    await prisma.approvalStep.create({
      data: {
        requestId: req.id,
        stepOrder: 1,
        approverOrgId: policeOrg.id,
        decision: 'APPROVED',
        decidedBy: 'ps.university',
        decidedAt: daysFromNow(-0.5)
      }
    });
    requestsCount++;

    await prisma.allocation.create({
      data: {
        allocationCode: 'ALL-2026-DEMO-010',
        requestId: req.id,
        vehicleId: unCarId,
        assignedVehicleIds: [unCarId],
        borrowingStationId: padavId,
        lendingStationId: universityId,
        quantity: 1,
        returnedQuantity: 0,
        startAt: daysFromNow(2),
        endAt: daysFromNow(5),
        lifecycle: 'RESERVED',
        createdBy: 'ps.university'
      }
    });
    allocationsCount++;
  }

  // 7. Synchronize StationInventory for all 8 stations
  console.log('[Point 14] Recomputing station inventory balances...');
  const vehiclesPerStationSummary: Record<string, number> = {};
  for (const t of TARGET_STATIONS) {
    const stationId = stationIdMap.get(t.slug)!;
    await recomputeStationInventory(prisma, stationId);
    const count = await prisma.vehicle.count({ where: { stationId } });
    vehiclesPerStationSummary[t.name] = count;
  }

  console.log('[Point 14] Seed completed successfully!');
  return {
    stationsCount: TARGET_STATIONS.length,
    vehiclesCount: totalVehicles,
    vehiclesPerStation: vehiclesPerStationSummary,
    operatorsCount: operatorCount,
    requestsCount,
    allocationsCount
  };
}

