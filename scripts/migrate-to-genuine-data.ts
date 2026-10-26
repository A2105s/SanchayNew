import { PrismaClient } from '@prisma/client';
import STATIONS_DATA from '../lib/data/gwalior-police-stations.json';
import DEPARTMENTS_DATA from '../lib/data/gwalior-departments.json';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Migrating Database to Genuine Gwalior Government Data ---');

  // 1. Update Organizations
  console.log('\n1. Updating Organizations...');
  for (const dept of DEPARTMENTS_DATA) {
    const updated = await prisma.organization.updateMany({
      where: { code: dept.code },
      data: { name: dept.name }
    });
    console.log(`  Updated Org [${dept.code}]: ${dept.name} (${updated.count} row)`);
  }

  // 2. Update Stations
  console.log('\n2. Updating Police Stations with official Incharges, CUG/Phones, while preserving GPS coordinates...');
  let updatedStations = 0;
  for (const s of STATIONS_DATA) {
    const updated = await prisma.station.updateMany({
      where: { code: s.code },
      data: {
        name: s.name,
        zone: s.zone,
        district: s.district,
        inchargeName: s.inchargeName,
        phone: s.cugMobile || s.phone,
        lat: s.lat,
        lng: s.lng
      }
    });
    if (updated.count > 0) {
      updatedStations += updated.count;
    } else {
      console.warn(`  Warning: Station code ${s.code} not found in DB`);
    }
  }
  console.log(`  Successfully updated ${updatedStations} Police Stations in Supabase!`);

  // 3. Update Demo Operators to realistic official titles
  console.log('\n3. Updating Demo Operators...');
  const operatorUpdates = [
    { username: 'station.kotwali', displayName: 'Insp. Vinod Vinayak Karkare (TI Kotwali)', phone: '+91 77010 46916' },
    { username: 'org.police', displayName: 'SP Gwalior Fleet Desk (Dharamveer Singh, IPS)', phone: '+91 70491 10800' },
    { username: 'dept.officer', displayName: 'ASP City Fleet Control (Akhilesh Rainwal)', phone: '+91 70491 10801' },
    { username: 'dept.health', displayName: 'CMHO Health Fleet Officer (Dr. Sachin Srivastava)', phone: '+91 75123 68444' },
    { username: 'org.health', displayName: 'Health Org Admin (CMHO Gwalior)', phone: '+91 75123 68444' },
    { username: 'auditor.demo', displayName: 'District Audit Officer (Collectorate Gwalior)', phone: '+91 75124 46200' },
    { username: 'driver.demo', displayName: 'Head Constable Manoj Tomar (Kotwali FRV Driver)', phone: '+91 94251 10421' }
  ];

  for (const op of operatorUpdates) {
    const updated = await prisma.operator.updateMany({
      where: { username: op.username },
      data: { displayName: op.displayName, phone: op.phone }
    });
    console.log(`  Updated Operator [${op.username}]: ${op.displayName} (${updated.count} row)`);
  }

  // 4. Verification summary
  const sampleStations = await prisma.station.findMany({
    take: 5,
    select: { name: true, code: true, inchargeName: true, phone: true, lat: true, lng: true }
  });
  console.log('\nSample Updated Stations in DB:');
  console.table(sampleStations);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
