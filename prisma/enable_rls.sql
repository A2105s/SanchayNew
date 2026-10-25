-- ==============================================================================
-- Sanchay: Enforce Row-Level Security (RLS) on all tables
-- ==============================================================================
-- Sanchay reaches PostgreSQL exclusively through the server-side Prisma client
-- (service connection string). The PostgREST anon / authenticated roles must NOT
-- have direct read/write access to any application table. Enabling RLS with no
-- permissive policies, plus revoking table privileges, shields every table from
-- the public Supabase API. Business rules + tenant isolation live in the trusted
-- server scope layer (lib/auth/scope.ts) and database constraints.
-- ==============================================================================

DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
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
        'SyncJob'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        -- 1. Enable RLS (deny-all with no permissive policies).
        EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY;', tbl);
        -- 2. Revoke public PostgREST API access.
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format('REVOKE ALL ON TABLE %I FROM anon;', tbl);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated;', tbl);
        END IF;
    END LOOP;
END $$;
