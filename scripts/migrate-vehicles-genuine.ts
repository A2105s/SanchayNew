import { PrismaClient } from '@prisma/client';
import FLEET_BLUEPRINTS from '../lib/data/gwalior-fleet-blueprints.json';
import LEGAL_CASES_DATA from '../lib/data/gwalior-legal-cases.json';

const prisma = new PrismaClient();

function normalizeRegistration(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/gu, '').toUpperCase();
}

async function main() {
  console.log('--- Migrating Fleet Vehicles & Legal Records to Genuine Gwalior Specs ---');

  const vehicles = await prisma.vehicle.findMany({
    orderBy: { assetCode: 'asc' }
  });
  console.log(`Found ${vehicles.length} vehicles to update.`);

  const usedRegs = new Set<string>();
  let seedNum = 1001;

  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    let prefix = 'MP07-GA';

    if (v.ownershipCategory === 'SEIZED_IMPOUNDED') {
      const imp = FLEET_BLUEPRINTS.seriesConventions.IMPOUNDED;
      prefix = imp[i % imp.length];
    } else if (v.sector === 'POLICE_PATROL') {
      const pol = FLEET_BLUEPRINTS.seriesConventions.POLICE;
      prefix = pol[i % pol.length];
    } else if (v.sector === 'AMBULANCE_108' || v.sector === 'HEALTH_VAN') {
      const hlt = FLEET_BLUEPRINTS.seriesConventions.HEALTH;
      prefix = hlt[i % hlt.length];
    } else if (v.sector === 'GMC_WASTE' || v.sector === 'PWD_HEAVY') {
      const mun = FLEET_BLUEPRINTS.seriesConventions.MUNICIPAL;
      prefix = mun[i % mun.length];
    } else if (v.sector === 'ELECTION_REQUISITION') {
      prefix = 'MP07-GA';
    }

    let reg = `${prefix}-${String(seedNum++).padStart(4, '0')}`;
    while (usedRegs.has(reg)) {
      reg = `${prefix}-${String(seedNum++).padStart(4, '0')}`;
    }
    usedRegs.add(reg);

    // Pick realistic makeModel, vehicleType, color
    let spec = {
      makeModel: 'Mahindra Scorpio Classic S11',
      vehicleType: 'Patrol SUV',
      color: 'White/Blue',
      fuelType: 'Diesel',
      seating: 7
    };

    if (v.sector === 'POLICE_PATROL') {
      if (v.vehicleClass === 'PATROL_CAR') {
        const cat = FLEET_BLUEPRINTS.vehicleCatalog.POLICE_PATROL;
        const item = cat[i % cat.length];
        spec = {
          makeModel: item.makeModel,
          vehicleType: item.usage.includes('FRV') ? 'First Response Vehicle (FRV)' : 'Interceptor SUV',
          color: item.color,
          fuelType: item.fuelType,
          seating: item.seating
        };
      } else if (v.vehicleClass === 'MOTORCYCLE') {
        const cat = FLEET_BLUEPRINTS.vehicleCatalog.POLICE_MOTORCYCLE;
        const item = cat[i % cat.length];
        spec = {
          makeModel: item.makeModel,
          vehicleType: item.usage.includes('Cheetah') ? 'Cheetah Mobile Patrol' : 'Beat Patrol Bike',
          color: item.color,
          fuelType: item.fuelType,
          seating: item.seating
        };
      } else if (v.vehicleClass === 'VAN') {
        const cat = FLEET_BLUEPRINTS.vehicleCatalog.POLICE_VAN;
        const item = cat[i % cat.length];
        spec = {
          makeModel: item.makeModel,
          vehicleType: item.usage.includes('Crime') ? 'Mobile Forensic Van' : 'Tactical Van',
          color: item.color,
          fuelType: item.fuelType,
          seating: item.seating
        };
      } else if (v.vehicleClass === 'HEAVY') {
        const cat = FLEET_BLUEPRINTS.vehicleCatalog.POLICE_HEAVY;
        const item = cat[i % cat.length];
        spec = {
          makeModel: item.makeModel,
          vehicleType: item.usage.includes('Vajra') ? 'Vajra Riot Control' : 'SAF Troop Carrier',
          color: item.color,
          fuelType: item.fuelType,
          seating: item.seating
        };
      }
    } else if (v.sector === 'AMBULANCE_108' || v.sector === 'HEALTH_VAN') {
      const cat = FLEET_BLUEPRINTS.vehicleCatalog.HEALTH_AMBULANCE;
      const item = cat[i % cat.length];
      spec = {
        makeModel: item.makeModel,
        vehicleType: '108 Advanced Life Support Ambulance',
        color: item.color,
        fuelType: item.fuelType,
        seating: item.seating
      };
    } else if (v.sector === 'GMC_WASTE') {
      const cat = FLEET_BLUEPRINTS.vehicleCatalog.MUNICIPAL_GMC;
      const item = cat[i % cat.length];
      spec = {
        makeModel: item.makeModel,
        vehicleType: item.usage.includes('Waste') ? 'Waste Collection Hopper' : 'Municipal Heavy',
        color: item.color,
        fuelType: item.fuelType,
        seating: item.seating
      };
    } else if (v.sector === 'PWD_HEAVY') {
      spec = {
        makeModel: 'Ashok Leyland 2518 Tipper',
        vehicleType: 'PWD Road Works Tipper',
        color: 'Yellow',
        fuelType: 'Diesel',
        seating: 3
      };
    } else if (v.sector === 'ELECTION_REQUISITION') {
      const cat = FLEET_BLUEPRINTS.vehicleCatalog.DISTRICT_ADMIN;
      const item = cat[i % cat.length];
      spec = {
        makeModel: item.makeModel,
        vehicleType: 'Election Flying Squad Inspection Car',
        color: item.color,
        fuelType: item.fuelType,
        seating: item.seating
      };
    }

    await prisma.vehicle.update({
      where: { id: v.id },
      data: {
        registrationNumber: reg,
        registrationNormalized: normalizeRegistration(reg),
        makeModel: spec.makeModel,
        vehicleType: spec.vehicleType,
        color: spec.color,
        fuelType: spec.fuelType,
        seating: spec.seating
      }
    });
  }
  console.log(`Successfully updated ${vehicles.length} vehicles with genuine Gwalior MP07 registrations and real models.`);

  // 2. Update Legal Records for seized vehicles
  console.log('\n2. Updating Legal Records for Seized Vehicles...');
  const seizedVehicles = await prisma.vehicle.findMany({
    where: { ownershipCategory: 'SEIZED_IMPOUNDED' },
    select: { id: true, registrationNumber: true }
  });

  const cases = LEGAL_CASES_DATA.sampleCases;
  for (let i = 0; i < seizedVehicles.length; i++) {
    const sv = seizedVehicles[i];
    const caseData = cases[i % cases.length];
    const year = 2024;
    const ref = `${caseData.caseNumber} (${caseData.cnrNumber})`;

    await prisma.legalRecord.updateMany({
      where: { vehicleId: sv.id },
      data: {
        referenceNo: ref,
        authority: caseData.courtName,
        description: `${caseData.statute}: ${caseData.reason}`,
        status: 'ACTIVE'
      }
    });

    await prisma.vehicleOwnershipVerification.updateMany({
      where: { vehicleId: sv.id },
      data: {
        evidenceRef: `${caseData.policeStation} - ${caseData.evidenceRef}`
      }
    });
  }
  console.log(`Successfully updated legal and seizure evidence records for ${seizedVehicles.length} impounded vehicles.`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
