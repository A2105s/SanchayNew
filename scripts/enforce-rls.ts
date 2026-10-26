import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TABLES = [
  'Organization',
  'Operator',
  'Station',
  'StationInventory',
  'Vehicle',
  'VehicleOwnershipVerification',
  'VehicleRestriction',
  'VehicleDocument',
  'DocumentAccessLog',
  'Trip',
  'MaintenanceRecord',
  'LegalRecord',
  'IncidentReport',
  'FuelLog',
  'AssetRequest',
  'ApprovalStep',
  'Allocation',
  'HandoverRecord',
  'ReturnRecord',
  'ExtensionRequest',
  'Notification',
  'IdempotencyKey',
  'TransferRequest',
  'IotDevice',
  'TelemetryPoint',
  'AuditLog',
  'UsageCounter',
  'AppSetting',
  'BackendEvent',
  'SyncJob',
  'ExternalDataCache'
];

async function main() {
  console.log('Enforcing Row-Level Security (RLS) on all Sanchay tables...\n');

  for (const table of TABLES) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
      console.log(`RLS ENABLED: "${table}"`);

      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            REVOKE ALL ON "${table}" FROM anon;
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            REVOKE ALL ON "${table}" FROM authenticated;
          END IF;
        END $$;
      `);
      console.log(`Permissions revoked from anon & authenticated for "${table}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed on table "${table}":`, msg);
    }
  }

  console.log('\nRLS configuration complete. All tables are shielded from public PostgREST access.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
