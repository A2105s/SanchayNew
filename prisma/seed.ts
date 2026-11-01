import { PrismaClient } from '@prisma/client';
import { seedSpacesData } from '@/lib/seed/gwalior';
import { seedPoint14Fleet, POINT14_DEMO_PASSWORD, TARGET_STATIONS } from '@/lib/seed/point14-fleet';
import { seedPoint15Spaces, POINT15_PASSWORD } from '@/lib/seed/point15-spaces';

/**
 * CLI seed runner (tsx prisma/seed.ts). Loads the deterministic Point 14 Gwalior police fleet
 * and Point 15 Civic Spaces property booking network.
 * Refuses to run against a production NODE_ENV unless --force is passed.
 */
async function main() {
  const force = process.argv.includes('--force');
  if (process.env.NODE_ENV === 'production' && !force) {
    console.error('Refusing to seed with NODE_ENV=production. Re-run with --force if you are certain.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    console.log('Seeding Point 14 high-fidelity vehicle fleet for 8 Gwalior police stations...');
    const point14Result = await seedPoint14Fleet(prisma);

    console.log('\nPoint 14 Seed Complete:');
    console.table(point14Result.vehiclesPerStation);

    console.log(`Total Stations: ${point14Result.stationsCount}`);
    console.log(`Total Vehicles: ${point14Result.vehiclesCount}`);
    console.log(`Total Inter-Station Requests: ${point14Result.requestsCount}`);
    console.log(`Total Active/Historical Allocations: ${point14Result.allocationsCount}`);

    console.log('\nRunning idempotent civic spaces seed...');
    const spacesCount = await seedSpacesData(prisma);
    console.log(`Successfully upserted ${spacesCount} verified Gwalior civic spaces.`);

    console.log('\nRunning Point 15 G2G Spaces Module seed...');
    const point15Result = await seedPoint15Spaces(prisma);
    console.log(`Successfully seeded ${point15Result.spacesCount} government spaces and ${point15Result.bookingsCount} bookings across 2 organizations.`);

    console.log('\nDemo operator accounts:');
    console.log(`  - ${'admin'.padEnd(18)} ${'ADMIN'.padEnd(16)} Platform Administrator (Password: ${POINT14_DEMO_PASSWORD})`);
    for (const st of TARGET_STATIONS) {
      const slug = st.slug.replace(/-police-station$/, '');
      console.log(`  - ${`ps.${slug}`.padEnd(18)} ${'STATION_OFFICER'.padEnd(16)} ${st.name} (Password: ${POINT14_DEMO_PASSWORD})`);
    }
    console.log('\nPoint 15 Spaces Operators:');
    console.log(`  - ${'school.gmhss'.padEnd(18)} ${'ORG_ADMIN'.padEnd(16)} Govt Model HSS, Gwalior (Password: ${POINT15_PASSWORD})`);
    console.log(`  - ${'admin.gatc'.padEnd(18)} ${'ORG_ADMIN'.padEnd(16)} Govt Admin Training Centre, Gwalior (Password: ${POINT15_PASSWORD})`);
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
