import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { SessionUser, Role } from '@/types';
import { hashPassword } from '@/lib/auth/password';
import { reevaluateEligibility } from '@/lib/cloud/eligibility';
import { recomputeStationInventory } from '@/lib/cloud/ops/transfers';
import { normalizeRegistration } from '@/lib/cloud/context';
import { FLEET_SETTINGS_KEY, DEFAULT_FLEET_SETTINGS } from '@/lib/cloud/errors';

export const prisma = new PrismaClient();

/** Ensure fleet settings exist for eligibility/availability to read a policy version. */
export async function ensureSettings(overrides: Partial<typeof DEFAULT_FLEET_SETTINGS> = {}): Promise<void> {
  const value = { ...DEFAULT_FLEET_SETTINGS, ...overrides };
  await prisma.appSetting.upsert({
    where: { key: FLEET_SETTINGS_KEY },
    update: { value: value as unknown as object },
    create: { key: FLEET_SETTINGS_KEY, value: value as unknown as object }
  });
}

export function suffix(): string {
  return randomBytes(5).toString('hex');
}

export interface TestOrg {
  id: string;
  code: string;
  parentId: string | null;
}

export async function createOrg(opts: { parentId?: string | null; kind?: string } = {}): Promise<TestOrg> {
  const code = `T-ORG-${suffix()}`;
  const org = await prisma.organization.create({
    data: { code, name: `Test Org ${code}`, kind: opts.kind ?? 'OTHER', parentId: opts.parentId ?? null }
  });
  return { id: org.id, code: org.code, parentId: org.parentId };
}

export async function createStation(organizationId: string): Promise<string> {
  const code = `t-station-${suffix()}`;
  const station = await prisma.station.create({
    data: { code, name: `Test Station ${code}`, organizationId, lat: 26.2, lng: 78.18, inventory: { create: { patrolCar: 0, motorcycle: 0, van: 0, heavy: 0 } } }
  });
  return station.id;
}

export async function createUser(opts: { role: Role; organizationId: string | null; stationId?: string | null; username?: string }): Promise<SessionUser> {
  const username = opts.username ?? `t-user-${suffix()}`;
  await prisma.operator.create({
    data: { username, displayName: username, role: opts.role, organizationId: opts.organizationId, stationId: opts.stationId ?? null, passwordHash: await hashPassword('test-password-123'), active: true }
  });
  return { username, displayName: username, role: opts.role, organizationId: opts.organizationId, stationId: opts.stationId ?? null };
}

export interface CreateVehicleOpts {
  organizationId: string;
  stationId?: string | null;
  ownershipCategory?: 'GOVERNMENT_FLEET' | 'SEIZED_IMPOUNDED' | 'OTHER_UNVERIFIED';
  operationalStatus?: 'ACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE' | 'RETIRED';
  verifyOwnership?: boolean;
  eligibleCompliance?: boolean;
  restriction?: { type: string; reasonCode: string; authority: string };
  vehicleClass?: 'PATROL_CAR' | 'MOTORCYCLE' | 'VAN' | 'HEAVY';
}

/**
 * Creates a vehicle and runs the REAL eligibility evaluation + inventory recompute so the
 * cached columns and station pool reflect the invariants (never raw shortcuts).
 */
export async function createVehicle(opts: CreateVehicleOpts): Promise<string> {
  const reg = `MP07-ZT-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}-${suffix().slice(0, 4)}`;
  const assetCode = `T-V-${suffix()}`;
  const ownership = opts.ownershipCategory ?? 'GOVERNMENT_FLEET';
  const goodCompliance = opts.eligibleCompliance ?? true;
  const future = new Date(Date.now() + 180 * 86400000);
  const past = new Date(Date.now() - 30 * 86400000);
  const vehicle = await prisma.vehicle.create({
    data: {
      assetCode,
      registrationNumber: reg,
      registrationNormalized: normalizeRegistration(reg),
      displayName: `Test Vehicle ${assetCode}`,
      sector: 'POLICE_PATROL',
      vehicleClass: opts.vehicleClass ?? 'VAN',
      vehicleType: 'Test Van',
      organizationId: opts.organizationId,
      stationId: opts.stationId ?? null,
      operationalStatus: opts.operationalStatus ?? 'ACTIVE',
      ownershipCategory: ownership,
      eligibilityState: 'PENDING_VERIFICATION',
      pucExpiry: goodCompliance ? future : past,
      insuranceExpiry: goodCompliance ? future : past,
      fitnessExpiry: goodCompliance ? future : past,
      createdBy: 'test'
    }
  });

  await prisma.vehicleOwnershipVerification.create({
    data: { vehicleId: vehicle.id, category: ownership, status: opts.verifyOwnership ?? ownership === 'GOVERNMENT_FLEET' ? 'VERIFIED' : 'PENDING', evidenceRef: 'test', submittedBy: 'seed-submitter', verifiedBy: (opts.verifyOwnership ?? ownership === 'GOVERNMENT_FLEET') ? 'test-verifier' : null, verifiedAt: (opts.verifyOwnership ?? ownership === 'GOVERNMENT_FLEET') ? new Date() : null }
  });

  if (opts.restriction) {
    await prisma.vehicleRestriction.create({
      data: { vehicleId: vehicle.id, type: opts.restriction.type, reasonCode: opts.restriction.reasonCode, authority: opts.restriction.authority, decidedBy: 'test' }
    });
  }

  await reevaluateEligibility(vehicle.id, prisma);
  if (opts.stationId) await recomputeStationInventory(prisma, opts.stationId);
  return vehicle.id;
}

/** Deletes all data created for a list of org ids (children-first, preserves global AuditLog). */
export async function cleanupOrgs(orgIds: string[]): Promise<void> {
  if (orgIds.length === 0) return;
  const vehicles = await prisma.vehicle.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true } });
  const vehicleIds = vehicles.map((v) => v.id);
  const requests = await prisma.assetRequest.findMany({ where: { OR: [{ requestingOrgId: { in: orgIds } }, { approverOrgId: { in: orgIds } }] }, select: { id: true } });
  const requestIds = requests.map((r) => r.id);
  const allocations = await prisma.allocation.findMany({ where: { OR: [{ vehicleId: { in: vehicleIds } }, { requestId: { in: requestIds } }] }, select: { id: true } });
  const allocationIds = allocations.map((a) => a.id);

  await prisma.handoverRecord.deleteMany({ where: { allocationId: { in: allocationIds } } });
  await prisma.returnRecord.deleteMany({ where: { allocationId: { in: allocationIds } } });
  await prisma.extensionRequest.deleteMany({ where: { allocationId: { in: allocationIds } } });
  await prisma.allocation.deleteMany({ where: { id: { in: allocationIds } } });
  await prisma.approvalStep.deleteMany({ where: { requestId: { in: requestIds } } });
  await prisma.assetRequest.deleteMany({ where: { id: { in: requestIds } } });
  await prisma.documentAccessLog.deleteMany({ where: { document: { vehicleId: { in: vehicleIds } } } });
  await prisma.vehicleDocument.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.telemetryPoint.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.iotDevice.deleteMany({ where: { OR: [{ vehicleId: { in: vehicleIds } }, { organizationId: { in: orgIds } }] } });
  await prisma.trip.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.maintenanceRecord.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.legalRecord.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.incidentReport.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.fuelLog.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.vehicleRestriction.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.vehicleOwnershipVerification.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  const stations = await prisma.station.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true } });
  await prisma.stationInventory.deleteMany({ where: { stationId: { in: stations.map((s) => s.id) } } });
  await prisma.operator.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.station.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.notification.deleteMany({ where: { recipientOrgId: { in: orgIds } } });
  // Delete children orgs before parents.
  const ordered = [...orgIds];
  for (let i = 0; i < ordered.length; i += 1) {
    await prisma.organization.deleteMany({ where: { id: ordered[i] } }).catch(() => undefined);
  }
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
