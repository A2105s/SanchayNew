import { PrismaClient } from '@prisma/client';
import { seedDemoData, seedSpacesData, DEMO_PASSWORD, DEMO_OPERATORS } from '@/lib/seed/gwalior';

/**
 * CLI seed runner (tsx prisma/seed.ts). Loads the deterministic Gwalior demo fleet.
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
    const existing = await prisma.vehicle.count();
    if (existing > 0 && !force) {
      console.log(`Database already has ${existing} vehicles. Running idempotent spaces seed...`);
      const spacesCount = await seedSpacesData(prisma);
      console.log(`Successfully upserted ${spacesCount} verified Gwalior civic spaces.`);
      return;
    }

    console.log('Seeding Gwalior demo fleet...');
    const result = await seedDemoData(prisma);

    console.log('\nSeed complete:');
    console.table(result);

    console.log('\nDemo operator accounts (shared password):');
    for (const op of DEMO_OPERATORS) {
      console.log(`  - ${op.username.padEnd(16)} ${op.role.padEnd(16)} ${op.orgCode ?? '-'}`);
    }
    // The demo password is printed ONLY here from the CLI, never from the API or UI.
    console.log(`\n  Demo password: ${DEMO_PASSWORD}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
