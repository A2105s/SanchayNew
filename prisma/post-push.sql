-- Database-level guarantees Prisma cannot express. Applied by `npm run db:push` right after `prisma db push`.
-- Idempotent: safe to run repeatedly.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. A vehicle can never have two overlapping live allocations, even under concurrent requests.
ALTER TABLE "Allocation" DROP CONSTRAINT IF EXISTS allocation_no_overlap;
ALTER TABLE "Allocation"
  ADD CONSTRAINT allocation_no_overlap
  EXCLUDE USING gist ("vehicleId" WITH =, tsrange("startAt", "endAt", '[)') WITH &&)
  WHERE ("lifecycle" NOT IN ('CANCELLED', 'COMPLETED'));

-- 2. Sane periods
ALTER TABLE "Allocation" DROP CONSTRAINT IF EXISTS allocation_period_valid;
ALTER TABLE "Allocation" ADD CONSTRAINT allocation_period_valid CHECK ("endAt" > "startAt");
ALTER TABLE "AssetRequest" DROP CONSTRAINT IF EXISTS asset_request_period_valid;
ALTER TABLE "AssetRequest" ADD CONSTRAINT asset_request_period_valid CHECK ("endAt" > "startAt");

-- 3. Enumerated states (fail closed against typos and crafted writes)
ALTER TABLE "Vehicle" DROP CONSTRAINT IF EXISTS vehicle_ownership_category_valid;
ALTER TABLE "Vehicle" ADD CONSTRAINT vehicle_ownership_category_valid
  CHECK ("ownershipCategory" IN ('GOVERNMENT_FLEET', 'SEIZED_IMPOUNDED', 'OTHER_UNVERIFIED'));
ALTER TABLE "Vehicle" DROP CONSTRAINT IF EXISTS vehicle_eligibility_state_valid;
ALTER TABLE "Vehicle" ADD CONSTRAINT vehicle_eligibility_state_valid
  CHECK ("eligibilityState" IN ('ELIGIBLE', 'RESTRICTED', 'PENDING_VERIFICATION', 'INELIGIBLE'));
ALTER TABLE "Vehicle" DROP CONSTRAINT IF EXISTS vehicle_operational_status_valid;
ALTER TABLE "Vehicle" ADD CONSTRAINT vehicle_operational_status_valid
  CHECK ("operationalStatus" IN ('ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED'));
-- Seized / unverified vehicles can never be marked ELIGIBLE, even by a direct write.
ALTER TABLE "Vehicle" DROP CONSTRAINT IF EXISTS vehicle_eligible_only_if_government_fleet;
ALTER TABLE "Vehicle" ADD CONSTRAINT vehicle_eligible_only_if_government_fleet
  CHECK ("eligibilityState" <> 'ELIGIBLE' OR "ownershipCategory" = 'GOVERNMENT_FLEET');

ALTER TABLE "Allocation" DROP CONSTRAINT IF EXISTS allocation_lifecycle_valid;
ALTER TABLE "Allocation" ADD CONSTRAINT allocation_lifecycle_valid
  CHECK ("lifecycle" IN ('RESERVED', 'AWAITING_HANDOVER', 'ACTIVE', 'RETURNED_PENDING_INSPECTION', 'COMPLETED', 'CANCELLED', 'INCIDENT_HOLD'));
ALTER TABLE "AssetRequest" DROP CONSTRAINT IF EXISTS asset_request_state_valid;
ALTER TABLE "AssetRequest" ADD CONSTRAINT asset_request_state_valid
  CHECK ("state" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'));

-- 4. Telemetry sanity
ALTER TABLE "TelemetryPoint" DROP CONSTRAINT IF EXISTS telemetry_coordinates_valid;
ALTER TABLE "TelemetryPoint" ADD CONSTRAINT telemetry_coordinates_valid
  CHECK ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180);

-- 5. Audit ledger is append-only: no UPDATE / DELETE by anyone using the application role.
CREATE OR REPLACE FUNCTION sanchay_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_append_only ON "AuditLog";
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION sanchay_audit_append_only();

-- 5. Civic Spaces (spec 09/10): a space can never hold two overlapping live bookings,
--    even under concurrent create attempts (PENDING also blocks to prevent double-holds).
ALTER TABLE "SpaceBooking" DROP CONSTRAINT IF EXISTS space_booking_no_overlap;
ALTER TABLE "SpaceBooking"
  ADD CONSTRAINT space_booking_no_overlap
  EXCLUDE USING gist ("spaceId" WITH =, tsrange("startAt", "endAt", '[)') WITH &&)
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));
ALTER TABLE "SpaceBooking" DROP CONSTRAINT IF EXISTS space_booking_period_valid;
ALTER TABLE "SpaceBooking" ADD CONSTRAINT space_booking_period_valid CHECK ("endAt" > "startAt");

-- Spaces enumerated states (fail closed)
ALTER TABLE "Space" DROP CONSTRAINT IF EXISTS space_operational_state_valid;
ALTER TABLE "Space" ADD CONSTRAINT space_operational_state_valid
  CHECK ("operationalState" IN ('AVAILABLE', 'IDLE', 'RESTRICTED', 'RETIRED'));
ALTER TABLE "SpaceBooking" DROP CONSTRAINT IF EXISTS space_booking_status_valid;
ALTER TABLE "SpaceBooking" ADD CONSTRAINT space_booking_status_valid
  CHECK ("status" IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED'));
ALTER TABLE "SpaceMaintenance" DROP CONSTRAINT IF EXISTS space_maintenance_severity_valid;
ALTER TABLE "SpaceMaintenance" ADD CONSTRAINT space_maintenance_severity_valid
  CHECK ("severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
ALTER TABLE "SpaceMaintenance" DROP CONSTRAINT IF EXISTS space_maintenance_status_valid;
ALTER TABLE "SpaceMaintenance" ADD CONSTRAINT space_maintenance_status_valid
  CHECK ("status" IN ('OPEN', 'IN_PROGRESS', 'RESOLVED'));
ALTER TABLE "SpaceRequest" DROP CONSTRAINT IF EXISTS space_request_type_valid;
ALTER TABLE "SpaceRequest" ADD CONSTRAINT space_request_type_valid
  CHECK ("type" IN ('REGISTER', 'UPDATE'));
ALTER TABLE "SpaceRequest" DROP CONSTRAINT IF EXISTS space_request_status_valid;
ALTER TABLE "SpaceRequest" ADD CONSTRAINT space_request_status_valid
  CHECK ("status" IN ('SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'WITHDRAWN'));
