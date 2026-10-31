import 'server-only';

import { Prisma, type Vehicle } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser, VehicleView } from '@/types';
import { writeAudit } from '@/lib/cloud/audit';
import { recordCloudEvent } from '@/lib/cloud/backend-events';
import { CLOUD_CACHE_TAGS, invalidateCloudData } from '@/lib/cloud/cached-queries';
import { DomainError } from '@/lib/cloud/errors';
import { mapVehicle } from '@/lib/cloud/mappers';
import { normalizeRegistration } from '@/lib/cloud/context';
import { nextAssetCode, nextIncidentCode, nextTicketCode, nextTripCode } from '@/lib/cloud/codes';
import { reevaluateEligibility } from '@/lib/cloud/eligibility';
import { recomputeStationInventoryForVehicle } from '@/lib/cloud/ops/transfers';
import { orgTree } from '@/lib/auth/scope';
import { getCaseByCnr } from '@/lib/integrations/ecourts/client';
import type { VehicleInputParsed, VehicleActionParsed } from '@/lib/validation/schemas';

type TxClient = Prisma.TransactionClient;

function invalidate() {
  invalidateCloudData(CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.ops, CLOUD_CACHE_TAGS.all);
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

async function loadVehicle(id: string): Promise<Vehicle> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) throw new DomainError('Vehicle not found.', 404);
  return vehicle;
}

/** Throws 404 (not 403) when the vehicle is invisible to the caller, to avoid revealing existence. */
async function loadOwnVehicle(user: SessionUser, id: string): Promise<Vehicle> {
  const vehicle = await loadVehicle(id);
  const tree = await orgTree(user);
  if (tree !== null && !tree.includes(vehicle.organizationId)) {
    throw new DomainError('Vehicle not found.', 404);
  }
  return vehicle;
}

async function mapWithOrg(vehicle: Vehicle, tx: TxClient | typeof prisma = prisma): Promise<VehicleView> {
  const org = await tx.organization.findUnique({ where: { id: vehicle.organizationId }, select: { name: true } });
  return mapVehicle(vehicle, org?.name ?? 'Unknown');
}

// ---------------------------------------------------------------------------
// Register / update / retire
// ---------------------------------------------------------------------------

export async function registerVehicle(user: SessionUser, input: VehicleInputParsed, correlationId: string): Promise<VehicleView> {
  if (!user.organizationId) throw new DomainError('You must belong to an organization to register a vehicle.', 403);

  const normalized = normalizeRegistration(input.registrationNumber);
  if (!normalized) throw new DomainError('Registration number is invalid.', 400);

  // Per-org uniqueness.
  const dupeInOrg = await prisma.vehicle.findFirst({
    where: { organizationId: user.organizationId, registrationNormalized: normalized }
  });
  if (dupeInOrg) throw new DomainError(`Registration ${input.registrationNumber} already exists in your organization.`, 409);

  // Duplicate-candidate flagging: same normalized registration OR chassis in OTHER orgs.
  const chassis = input.chassisNumber?.trim() || null;
  const candidates = await prisma.vehicle.findMany({
    where: {
      organizationId: { not: user.organizationId },
      OR: [{ registrationNormalized: normalized }, ...(chassis ? [{ chassisNumber: chassis }] : [])]
    },
    select: { id: true }
  });

  const claimedOwnership = input.claimedOwnership ?? 'OTHER_UNVERIFIED';

  const vehicle = await prisma.$transaction(async (tx) => {
    const assetCode = await nextAssetCode(tx);
    const created = await tx.vehicle.create({
      data: {
        assetCode,
        registrationNumber: input.registrationNumber,
        registrationNormalized: normalized,
        displayName: input.displayName,
        sector: input.sector,
        vehicleClass: input.vehicleClass,
        vehicleType: input.vehicleType,
        organizationId: user.organizationId as string,
        managingUnit: input.managingUnit ?? null,
        stationId: input.stationId ?? null,
        driverName: input.driverName ?? null,
        driverPhone: input.driverPhone ?? null,
        // claimedOwnership is recorded but never effective until verified; eligibility fails closed.
        ownershipCategory: claimedOwnership,
        eligibilityState: 'PENDING_VERIFICATION',
        makeModel: input.makeModel ?? null,
        year: input.year ?? null,
        fuelType: input.fuelType ?? null,
        seating: input.seating ?? null,
        color: input.color ?? null,
        chassisNumber: chassis,
        engineNumber: input.engineNumber ?? null,
        odometerKm: input.odometerKm ?? 0,
        gpsSource: input.gpsSource ?? 'MANUAL_CSV',
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        pucExpiry: toDate(input.pucExpiry),
        insuranceExpiry: toDate(input.insuranceExpiry),
        fitnessExpiry: toDate(input.fitnessExpiry),
        notes: input.notes ?? null,
        createdBy: user.username
      }
    });

    // Record a PENDING ownership verification capturing the claim (never auto-verified).
    await tx.vehicleOwnershipVerification.create({
      data: {
        vehicleId: created.id,
        category: claimedOwnership,
        status: 'PENDING',
        evidenceRef: 'registration',
        submittedBy: user.username
      }
    });

    await reevaluateEligibility(created.id, tx);

    await writeAudit(tx, {
      entityType: 'Vehicle',
      entityId: created.id,
      action: 'VehicleRegistered',
      newValue: `${created.registrationNumber} (${created.displayName})`,
      performedBy: user.username,
      performedByRole: user.role,
      organizationId: created.organizationId,
      correlationId,
      reason: candidates.length ? `Duplicate candidates flagged: ${candidates.length}` : 'Vehicle registered'
    });

    const refreshed = await tx.vehicle.findUniqueOrThrow({ where: { id: created.id } });
    await recomputeStationInventoryForVehicle(tx, refreshed.stationId);
    return refreshed;
  });

  await recordCloudEvent({ level: 'info', category: 'fleet', action: 'register-vehicle', status: 'succeeded', message: 'Vehicle registered.', recordCount: 1, details: { vehicleId: vehicle.id, duplicateCandidates: candidates.length } });
  invalidate();
  const view = await mapWithOrg(vehicle);
  return { ...view, duplicateOf: candidates.map((c) => c.id) };
}

export async function updateVehicle(user: SessionUser, id: string, patch: Partial<VehicleInputParsed>, correlationId: string): Promise<VehicleView> {
  const current = await loadOwnVehicle(user, id);

  const data: Prisma.VehicleUpdateInput = {};
  if (patch.registrationNumber !== undefined) {
    const normalized = normalizeRegistration(patch.registrationNumber);
    if (!normalized) throw new DomainError('Registration number is invalid.', 400);
    if (normalized !== current.registrationNormalized) {
      const dupe = await prisma.vehicle.findFirst({ where: { organizationId: current.organizationId, registrationNormalized: normalized, id: { not: id } } });
      if (dupe) throw new DomainError(`Registration ${patch.registrationNumber} already exists in your organization.`, 409);
    }
    data.registrationNumber = patch.registrationNumber;
    data.registrationNormalized = normalized;
  }
  const assign = <K extends keyof VehicleInputParsed>(key: K) => {
    if (patch[key] !== undefined) (data as Record<string, unknown>)[key as string] = patch[key];
  };
  assign('displayName');
  assign('sector');
  assign('vehicleClass');
  assign('vehicleType');
  assign('managingUnit');
  assign('driverName');
  assign('driverPhone');
  assign('makeModel');
  assign('year');
  assign('fuelType');
  assign('seating');
  assign('color');
  assign('chassisNumber');
  assign('engineNumber');
  assign('odometerKm');
  assign('gpsSource');
  assign('lat');
  assign('lng');
  assign('notes');
  if (patch.stationId !== undefined) data.station = patch.stationId ? { connect: { id: patch.stationId } } : { disconnect: true };
  if (patch.pucExpiry !== undefined) data.pucExpiry = toDate(patch.pucExpiry);
  if (patch.insuranceExpiry !== undefined) data.insuranceExpiry = toDate(patch.insuranceExpiry);
  if (patch.fitnessExpiry !== undefined) data.fitnessExpiry = toDate(patch.fitnessExpiry);

  const vehicle = await prisma.$transaction(async (tx) => {
    const updated = await tx.vehicle.update({ where: { id }, data });
    await reevaluateEligibility(id, tx);
    await writeAudit(tx, { entityType: 'Vehicle', entityId: id, action: 'VehicleUpdated', newValue: updated.registrationNumber, performedBy: user.username, performedByRole: user.role, organizationId: updated.organizationId, correlationId, reason: 'Vehicle profile updated' });
    const refreshed = await tx.vehicle.findUniqueOrThrow({ where: { id } });
    if (current.stationId !== refreshed.stationId) {
      await recomputeStationInventoryForVehicle(tx, current.stationId);
    }
    await recomputeStationInventoryForVehicle(tx, refreshed.stationId);
    return refreshed;
  });
  invalidate();
  return mapWithOrg(vehicle);
}

export async function setOperationalStatus(user: SessionUser, id: string, status: VehicleView['operationalStatus'], reason: string, correlationId: string): Promise<VehicleView> {
  const current = await loadOwnVehicle(user, id);
  const vehicle = await prisma.$transaction(async (tx) => {
    const updated = await tx.vehicle.update({ where: { id }, data: { operationalStatus: status } });
    await reevaluateEligibility(id, tx);
    await writeAudit(tx, { entityType: 'Vehicle', entityId: id, action: 'OperationalStatusChanged', fieldName: 'operationalStatus', oldValue: current.operationalStatus, newValue: status, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason });
    const refreshed = await tx.vehicle.findUniqueOrThrow({ where: { id } });
    await recomputeStationInventoryForVehicle(tx, refreshed.stationId);
    return refreshed;
  });
  invalidate();
  return mapWithOrg(vehicle);
}

export async function retireVehicle(user: SessionUser, id: string, reason: string, correlationId: string): Promise<VehicleView> {
  // Retire instead of delete: lifecycle records are preserved.
  return setOperationalStatus(user, id, 'RETIRED', reason, correlationId);
}

// ---------------------------------------------------------------------------
// Ownership verification (verifier must differ from submitter)
// ---------------------------------------------------------------------------

export async function submitOwnership(user: SessionUser, id: string, category: VehicleView['ownershipCategory'], evidenceRef: string, evidenceNote: string | undefined, correlationId: string): Promise<VehicleView> {
  const current = await loadOwnVehicle(user, id);
  const vehicle = await prisma.$transaction(async (tx) => {
    // Supersede earlier pending claims of a different category.
    await tx.vehicleOwnershipVerification.updateMany({ where: { vehicleId: id, status: 'PENDING' }, data: { status: 'SUPERSEDED' } });
    const verification = await tx.vehicleOwnershipVerification.create({
      data: { vehicleId: id, category, status: 'PENDING', evidenceRef, evidenceNote: evidenceNote ?? null, submittedBy: user.username }
    });
    await writeAudit(tx, { entityType: 'Vehicle', entityId: id, action: 'OwnershipSubmitted', newValue: `${category} / ${verification.id}`, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason: evidenceRef });
    await reevaluateEligibility(id, tx);
    return tx.vehicle.findUniqueOrThrow({ where: { id } });
  });
  invalidate();
  return mapWithOrg(vehicle);
}

export async function decideOwnership(user: SessionUser, id: string, verificationId: string, decision: 'VERIFIED' | 'REJECTED', note: string | undefined, correlationId: string): Promise<VehicleView> {
  const current = await loadOwnVehicle(user, id);
  const verification = await prisma.vehicleOwnershipVerification.findUnique({ where: { id: verificationId } });
  if (!verification || verification.vehicleId !== id) throw new DomainError('Ownership verification not found.', 404);
  if (verification.status !== 'PENDING') throw new DomainError('This verification has already been decided.', 409);
  // Separation of duties: the verifier must differ from the submitter.
  if (verification.submittedBy === user.username) {
    throw new DomainError('The verifier must differ from the submitter.', 403, 'SEPARATION_OF_DUTIES');
  }

  const vehicle = await prisma.$transaction(async (tx) => {
    await tx.vehicleOwnershipVerification.update({
      where: { id: verificationId },
      data: {
        status: decision,
        verifiedBy: user.username,
        verifiedAt: new Date(),
        rejectionNote: decision === 'REJECTED' ? note ?? null : null
      }
    });
    if (decision === 'VERIFIED') {
      // The verified claim becomes the effective ownership category.
      await tx.vehicle.update({ where: { id }, data: { ownershipCategory: verification.category } });
    }
    await reevaluateEligibility(id, tx);
    await writeAudit(tx, { entityType: 'Vehicle', entityId: id, action: 'OwnershipDecided', fieldName: 'ownership', newValue: `${verification.category}:${decision}`, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason: note });
    const refreshed = await tx.vehicle.findUniqueOrThrow({ where: { id } });
    await recomputeStationInventoryForVehicle(tx, refreshed.stationId);
    return refreshed;
  });
  invalidate();
  return mapWithOrg(vehicle);
}

// ---------------------------------------------------------------------------
// Restrictions (rows are never deleted; lifting appends liftedAt/liftedBy)
// ---------------------------------------------------------------------------

export async function addRestriction(
  user: SessionUser,
  id: string,
  args: { restrictionType: string; reasonCode: string; description?: string; evidenceRef?: string; authority: string; reviewAt?: string; expiresAt?: string },
  correlationId: string
): Promise<VehicleView> {
  const current = await loadOwnVehicle(user, id);
  const vehicle = await prisma.$transaction(async (tx) => {
    const restriction = await tx.vehicleRestriction.create({
      data: {
        vehicleId: id,
        type: args.restrictionType,
        reasonCode: args.reasonCode,
        description: args.description ?? null,
        evidenceRef: args.evidenceRef ?? null,
        authority: args.authority,
        decidedBy: user.username,
        reviewAt: toDate(args.reviewAt),
        expiresAt: toDate(args.expiresAt)
      }
    });
    await reevaluateEligibility(id, tx);
    await writeAudit(tx, { entityType: 'Vehicle', entityId: id, action: 'RestrictionAdded', newValue: `${args.restrictionType}/${restriction.id}`, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason: args.reasonCode });
    const refreshed = await tx.vehicle.findUniqueOrThrow({ where: { id } });
    await recomputeStationInventoryForVehicle(tx, refreshed.stationId);
    return refreshed;
  });
  invalidate();
  return mapWithOrg(vehicle);
}

export async function liftRestriction(user: SessionUser, id: string, restrictionId: string, reason: string, correlationId: string): Promise<VehicleView> {
  const current = await loadOwnVehicle(user, id);
  const restriction = await prisma.vehicleRestriction.findUnique({ where: { id: restrictionId } });
  if (!restriction || restriction.vehicleId !== id) throw new DomainError('Restriction not found.', 404);
  if (restriction.liftedAt) throw new DomainError('Restriction already lifted.', 409);

  const vehicle = await prisma.$transaction(async (tx) => {
    await tx.vehicleRestriction.update({ where: { id: restrictionId }, data: { liftedAt: new Date(), liftedBy: user.username, liftReason: reason } });
    await reevaluateEligibility(id, tx);
    await writeAudit(tx, { entityType: 'Vehicle', entityId: id, action: 'RestrictionLifted', fieldName: 'restriction', oldValue: restriction.type, newValue: 'LIFTED', performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason });
    const refreshed = await tx.vehicle.findUniqueOrThrow({ where: { id } });
    await recomputeStationInventoryForVehicle(tx, refreshed.stationId);
    return refreshed;
  });
  invalidate();
  return mapWithOrg(vehicle);
}

export async function reevaluate(user: SessionUser, id: string, correlationId: string): Promise<VehicleView> {
  const current = await loadOwnVehicle(user, id);
  const vehicle = await prisma.$transaction(async (tx) => {
    const decision = await reevaluateEligibility(id, tx);
    await writeAudit(tx, { entityType: 'Vehicle', entityId: id, action: 'EligibilityReevaluated', newValue: decision.state, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId });
    const refreshed = await tx.vehicle.findUniqueOrThrow({ where: { id } });
    await recomputeStationInventoryForVehicle(tx, refreshed.stationId);
    return refreshed;
  });
  invalidate();
  return mapWithOrg(vehicle);
}

// ---------------------------------------------------------------------------
// Driver / compliance
// ---------------------------------------------------------------------------

export async function assignDriver(user: SessionUser, id: string, driverName: string, driverPhone: string | null | undefined, correlationId: string): Promise<VehicleView> {
  const current = await loadOwnVehicle(user, id);
  const vehicle = await prisma.$transaction(async (tx) => {
    const updated = await tx.vehicle.update({ where: { id }, data: { driverName, driverPhone: driverPhone ?? null } });
    await writeAudit(tx, { entityType: 'Vehicle', entityId: id, action: 'DriverAssigned', fieldName: 'driverName', oldValue: current.driverName, newValue: driverName, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId });
    return updated;
  });
  invalidate();
  return mapWithOrg(vehicle);
}

export async function renewCompliance(user: SessionUser, id: string, document: 'PUC' | 'INSURANCE' | 'FITNESS', newExpiry: string, reference: string | undefined, correlationId: string): Promise<VehicleView> {
  const current = await loadOwnVehicle(user, id);
  const field = document === 'PUC' ? 'pucExpiry' : document === 'INSURANCE' ? 'insuranceExpiry' : 'fitnessExpiry';
  const oldVal = (current as unknown as Record<string, Date | null>)[field];
  const vehicle = await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id }, data: { [field]: new Date(newExpiry) } });
    await reevaluateEligibility(id, tx);
    await writeAudit(tx, { entityType: 'Vehicle', entityId: id, action: 'ComplianceRenewed', fieldName: field, oldValue: oldVal ? oldVal.toISOString() : null, newValue: new Date(newExpiry).toISOString(), performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason: reference ? `Ref: ${reference}` : undefined });
    const refreshed = await tx.vehicle.findUniqueOrThrow({ where: { id } });
    await recomputeStationInventoryForVehicle(tx, refreshed.stationId);
    return refreshed;
  });
  invalidate();
  return mapWithOrg(vehicle);
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

export async function startTrip(user: SessionUser, id: string, args: { driverName: string; purpose: string; startAddress: string; startOdometer: number; allocationId?: string }, correlationId: string) {
  const current = await loadOwnVehicle(user, id);
  if (current.operationalStatus !== 'ACTIVE') throw new DomainError('Vehicle is not active.', 409);
  const ongoing = await prisma.trip.findFirst({ where: { vehicleId: id, status: 'ONGOING' } });
  if (ongoing) throw new DomainError('Vehicle already has an ongoing trip.', 409);

  const result = await prisma.$transaction(async (tx) => {
    const tripCode = await nextTripCode(tx);
    const trip = await tx.trip.create({
      data: { tripCode, vehicleId: id, driverName: args.driverName, purpose: args.purpose, status: 'ONGOING', startAddress: args.startAddress, startOdometer: args.startOdometer, allocationId: args.allocationId ?? null, createdBy: user.username }
    });
    const vehicle = await tx.vehicle.update({ where: { id }, data: { status: 'MOVING', ignition: true, idleSince: null } });
    await writeAudit(tx, { entityType: 'Trip', entityId: trip.id, action: 'TripStarted', newValue: trip.tripCode, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason: args.purpose });
    return { vehicle, trip };
  });
  invalidate();
  return result;
}

export async function endTrip(user: SessionUser, id: string, args: { tripId: string; endAddress: string; endOdometer: number; fuelLiters?: number }, correlationId: string) {
  const current = await loadOwnVehicle(user, id);
  const trip = await prisma.trip.findUnique({ where: { id: args.tripId } });
  if (!trip || trip.vehicleId !== id) throw new DomainError('Trip not found for this vehicle.', 404);
  if (trip.status !== 'ONGOING') throw new DomainError('Trip is not ongoing.', 409);

  const distanceKm = args.endOdometer - trip.startOdometer;
  if (distanceKm < 0) throw new DomainError('End odometer must be greater than or equal to the start odometer.', 400);
  const endedAt = new Date();
  const durationMin = Math.max(0, Math.round((endedAt.getTime() - trip.startedAt.getTime()) / 60000));

  const result = await prisma.$transaction(async (tx) => {
    const updatedTrip = await tx.trip.update({ where: { id: trip.id }, data: { status: 'COMPLETED', endedAt, endAddress: args.endAddress, endOdometer: args.endOdometer, distanceKm, durationMin, fuelLiters: args.fuelLiters ?? null } });
    const vehicle = await tx.vehicle.update({ where: { id }, data: { odometerKm: args.endOdometer, hoursWeek: current.hoursWeek + durationMin / 60, status: 'IDLE', ignition: false, idleSince: endedAt } });
    await writeAudit(tx, { entityType: 'Trip', entityId: trip.id, action: 'TripCompleted', newValue: `${distanceKm} km`, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId });
    return { vehicle, trip: updatedTrip };
  });
  invalidate();
  return result;
}

// ---------------------------------------------------------------------------
// Maintenance (windows + blocksAvailability drive eligibility)
// ---------------------------------------------------------------------------

const RISK_BUMP: Record<string, number> = { LOW: 5, MEDIUM: 15, HIGH: 30, CRITICAL: 50 };

export async function raiseMaintenance(
  user: SessionUser,
  id: string,
  args: { title: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; dueDate?: string; windowStart?: string; windowEnd?: string; blocksAvailability?: boolean; notes?: string; vendor?: string },
  correlationId: string
) {
  const current = await loadOwnVehicle(user, id);
  const bump = RISK_BUMP[args.severity] ?? 10;
  const blocks = args.blocksAvailability ?? args.severity === 'CRITICAL';

  const result = await prisma.$transaction(async (tx) => {
    const ticketCode = await nextTicketCode(tx);
    const ticket = await tx.maintenanceRecord.create({
      data: {
        ticketCode,
        vehicleId: id,
        title: args.title,
        severity: args.severity,
        status: 'SCHEDULED',
        dueDate: toDate(args.dueDate),
        windowStart: toDate(args.windowStart),
        windowEnd: toDate(args.windowEnd),
        blocksAvailability: blocks,
        notes: args.notes ?? null,
        vendor: args.vendor ?? null,
        raisedBy: user.username
      }
    });
    await tx.vehicle.update({ where: { id }, data: { maintenanceRisk: Math.min(100, current.maintenanceRisk + bump) } });
    await reevaluateEligibility(id, tx);
    await writeAudit(tx, { entityType: 'Maintenance', entityId: ticket.id, action: 'MaintenanceRaised', newValue: ticket.ticketCode, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason: args.title });
    const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id } });
    await recomputeStationInventoryForVehicle(tx, vehicle.stationId);
    return { vehicle, ticket };
  });
  invalidate();
  return result;
}

export async function updateMaintenance(user: SessionUser, id: string, args: { ticketId: string; status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED'; costInr?: number; notes?: string }, correlationId: string) {
  const current = await loadOwnVehicle(user, id);
  const ticket = await prisma.maintenanceRecord.findUnique({ where: { id: args.ticketId } });
  if (!ticket || ticket.vehicleId !== id) throw new DomainError('Maintenance ticket not found for this vehicle.', 404);
  const clearing = args.status === 'COMPLETED' && ticket.status !== 'COMPLETED';
  const bump = clearing ? RISK_BUMP[ticket.severity] ?? 10 : 0;

  const result = await prisma.$transaction(async (tx) => {
    const updatedTicket = await tx.maintenanceRecord.update({
      where: { id: ticket.id },
      data: { status: args.status, costInr: args.costInr ?? ticket.costInr, notes: args.notes ?? ticket.notes, completedAt: args.status === 'COMPLETED' ? new Date() : ticket.completedAt }
    });
    if (clearing) await tx.vehicle.update({ where: { id }, data: { maintenanceRisk: Math.max(0, current.maintenanceRisk - bump) } });
    await reevaluateEligibility(id, tx);
    await writeAudit(tx, { entityType: 'Maintenance', entityId: ticket.id, action: 'MaintenanceUpdated', fieldName: 'status', oldValue: ticket.status, newValue: args.status, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId });
    const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id } });
    await recomputeStationInventoryForVehicle(tx, vehicle.stationId);
    return { vehicle, ticket: updatedTicket };
  });
  invalidate();
  return result;
}

// ---------------------------------------------------------------------------
// Incidents / fuel / legal
// ---------------------------------------------------------------------------

export async function logIncident(user: SessionUser, id: string, args: { incidentType: 'SOS' | 'BREAKDOWN' | 'ACCIDENT' | 'DAMAGE' | 'GEOFENCE' | 'OTHER'; severity: 'INFO' | 'WARNING' | 'CRITICAL'; message: string; lat?: number; lng?: number; offlineCaptured?: boolean }, correlationId: string) {
  const current = await loadOwnVehicle(user, id);
  const setsBreakdown = args.incidentType === 'BREAKDOWN';
  const result = await prisma.$transaction(async (tx) => {
    const incidentCode = await nextIncidentCode(tx);
    const incident = await tx.incidentReport.create({
      data: { incidentCode, vehicleId: id, type: args.incidentType, severity: args.severity, message: args.message, reporterName: user.displayName, lat: args.lat ?? null, lng: args.lng ?? null, offlineCaptured: args.offlineCaptured ?? false, status: 'OPEN' }
    });
    const vehicle = setsBreakdown ? await tx.vehicle.update({ where: { id }, data: { status: 'BREAKDOWN' } }) : current;
    await writeAudit(tx, { entityType: 'Incident', entityId: incident.id, action: 'IncidentLogged', newValue: incident.incidentCode, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason: args.incidentType });
    return { vehicle, incident };
  });
  invalidate();
  return result;
}

export async function resolveIncident(user: SessionUser, id: string, args: { incidentId: string; resolution: 'ACKNOWLEDGED' | 'RESOLVED' }, correlationId: string) {
  const current = await loadOwnVehicle(user, id);
  const incident = await prisma.incidentReport.findUnique({ where: { id: args.incidentId } });
  if (!incident || incident.vehicleId !== id) throw new DomainError('Incident not found for this vehicle.', 404);
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.incidentReport.update({
      where: { id: incident.id },
      data: args.resolution === 'ACKNOWLEDGED' ? { status: 'ACKNOWLEDGED', acknowledgedBy: user.username } : { status: 'RESOLVED', resolvedBy: user.username, resolvedAt: new Date() }
    });
    await writeAudit(tx, { entityType: 'Incident', entityId: incident.id, action: 'IncidentResolved', fieldName: 'status', oldValue: incident.status, newValue: args.resolution, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId });
    return updated;
  });
  invalidate();
  return { vehicle: current, incident: result };
}

export async function logFuel(user: SessionUser, id: string, args: { liters: number; costInr?: number; odometerKm?: number }, correlationId: string) {
  const current = await loadOwnVehicle(user, id);
  const result = await prisma.$transaction(async (tx) => {
    const fuel = await tx.fuelLog.create({ data: { vehicleId: id, liters: args.liters, costInr: args.costInr ?? null, odometerKm: args.odometerKm ?? null, source: 'MANUAL', loggedBy: user.username } });
    const currentFuel = current.fuelPercent ?? 25;
    const addedPct = Math.round((args.liters / 45) * 100);
    const newFuelPercent = Math.min(100, Math.max(85, Math.round(currentFuel + addedPct)));
    await tx.vehicle.update({ where: { id }, data: { fuelPercent: newFuelPercent } });
    await writeAudit(tx, { entityType: 'FuelLog', entityId: fuel.id, action: 'FuelLogged', newValue: `${args.liters} L`, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId });
    return fuel;
  });
  invalidate();
  return { vehicle: current, fuelLog: result };
}

export async function addLegalRecord(user: SessionUser, id: string, record: { type: 'CHALLAN' | 'COURT_CASE' | 'ACCIDENT' | 'SEIZURE'; referenceNo: string; date: string; description: string; status: 'PENDING' | 'ACTIVE' | 'APPEALED' | 'RESOLVED'; amountInr?: number | null; nextActionAt?: string | null; authority: string }, correlationId: string) {
  const current = await loadOwnVehicle(user, id);
  const result = await prisma.$transaction(async (tx) => {
    const legal = await tx.legalRecord.create({
      data: { vehicleId: id, type: record.type, referenceNo: record.referenceNo, date: new Date(record.date), description: record.description, status: record.status, amountInr: record.amountInr ?? null, nextActionAt: record.nextActionAt ? new Date(record.nextActionAt) : null, authority: record.authority }
    });
    await writeAudit(tx, { entityType: 'LegalRecord', entityId: legal.id, action: 'LegalRecordAdded', newValue: `${record.type} ${record.referenceNo}`, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId });
    return legal;
  });
  invalidate();
  return { vehicle: current, legalRecord: result };
}

export async function updateLegalRecord(user: SessionUser, id: string, args: { recordId: string; status: 'PENDING' | 'ACTIVE' | 'APPEALED' | 'RESOLVED'; nextActionAt?: string | null }, correlationId: string) {
  const current = await loadOwnVehicle(user, id);
  const record = await prisma.legalRecord.findUnique({ where: { id: args.recordId } });
  if (!record || record.vehicleId !== id) throw new DomainError('Legal record not found for this vehicle.', 404);
  const result = await prisma.$transaction(async (tx) => {
    const legal = await tx.legalRecord.update({ where: { id: record.id }, data: { status: args.status, nextActionAt: args.nextActionAt !== undefined ? (args.nextActionAt ? new Date(args.nextActionAt) : null) : record.nextActionAt } });
    await writeAudit(tx, { entityType: 'LegalRecord', entityId: record.id, action: 'LegalRecordUpdated', fieldName: 'status', oldValue: record.status, newValue: args.status, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId });
    return legal;
  });
  invalidate();
  return { vehicle: current, legalRecord: result };
}

// ---------------------------------------------------------------------------
// Seized-vehicle custody & disposal workflow (spec 13: legal-status gating)
// ---------------------------------------------------------------------------

const ACTIVE_CUSTODY_STATES = ['IN_CUSTODY', 'AUCTION_READY'];

function assertCustodyActionable(vehicle: Vehicle, action: string): void {
  if (vehicle.custodyState && !ACTIVE_CUSTODY_STATES.includes(vehicle.custodyState)) {
    throw new DomainError(`Custody workflow is closed for this vehicle (${vehicle.custodyState}); ${action} is no longer possible.`, 409);
  }
}

/** Link an eCourts case (by CNR) to the vehicle as a COURT_CASE legal record. Evidence only — never an eligibility verdict. */
export async function linkCourtCase(user: SessionUser, id: string, cnr: string, correlationId: string) {
  const current = await loadOwnVehicle(user, id);
  const result = await getCaseByCnr(cnr, { refresh: false });
  if (result.status === 'not_configured') throw new DomainError('Court-case verification is not configured on this server.', 503);
  if (result.status === 'not_found') throw new DomainError('No eCourts record was found for that CNR.', 404);
  if (result.status === 'invalid_request') throw new DomainError('That CNR was rejected by eCourts as invalid.', 400);
  if (!result.case) throw new DomainError('eCourts is unavailable right now. This is not a negative result — try again later.', 503);

  const c = result.case;
  const duplicate = await prisma.legalRecord.findFirst({ where: { vehicleId: id, type: 'COURT_CASE', cnr: c.cnr, status: { not: 'RESOLVED' } } });
  if (duplicate) throw new DomainError(`Case ${c.cnr} is already linked to this vehicle.`, 409);

  const disposed = (c.disposalType != null && c.disposalType !== '') || (c.status.code ?? '').toUpperCase().includes('DISPOSED');
  const legal = await prisma.$transaction(async (tx) => {
    const row = await tx.legalRecord.create({
      data: {
        vehicleId: id,
        type: 'COURT_CASE',
        referenceNo: c.caseNumber ?? c.cnr,
        date: toDate(c.filingDate) ?? new Date(),
        description: [c.caseType.label ? `Case type: ${c.caseType.label}` : null, c.actsAndSections.length ? c.actsAndSections.join('; ') : null].filter(Boolean).join(' · ') || 'eCourts case linked by CNR.',
        status: disposed ? 'RESOLVED' : 'ACTIVE',
        authority: c.court.label ?? 'eCourts',
        nextActionAt: toDate(c.nextHearingDate),
        cnr: c.cnr,
        caseTitle: [c.caseType.label, c.caseNumber].filter(Boolean).join(' ') || c.cnr,
        caseStage: c.status.label,
        courtName: c.court.label,
        caseVerifiedAt: new Date()
      }
    });
    await writeAudit(tx, { entityType: 'LegalRecord', entityId: row.id, action: 'CourtCaseLinked', newValue: c.cnr, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason: 'Custody workflow: eCourts case linked as evidence' });
    return row;
  });
  invalidate();
  return { vehicle: current, legalRecord: legal, cached: result.cached };
}

/** Re-fetch a linked court case from the eCourts cache and refresh its stage/status. */
export async function refreshCourtCase(user: SessionUser, id: string, recordId: string, correlationId: string) {
  const current = await loadOwnVehicle(user, id);
  const record = await prisma.legalRecord.findUnique({ where: { id: recordId } });
  if (!record || record.vehicleId !== id) throw new DomainError('Legal record not found for this vehicle.', 404);
  if (record.type !== 'COURT_CASE' || !record.cnr) throw new DomainError('Only an eCourts-linked court case can be refreshed.', 400);

  const result = await getCaseByCnr(record.cnr, { refresh: false });
  if (result.status !== 'ok' || !result.case) throw new DomainError('eCourts is unavailable right now — the stored case details are unchanged.', 503);
  const c = result.case;
  const disposed = (c.disposalType != null && c.disposalType !== '') || (c.status.code ?? '').toUpperCase().includes('DISPOSED');
  const legal = await prisma.$transaction(async (tx) => {
    const row = await tx.legalRecord.update({
      where: { id: record.id },
      data: {
        status: disposed ? 'RESOLVED' : record.status === 'RESOLVED' ? 'RESOLVED' : 'ACTIVE',
        caseStage: c.status.label,
        courtName: c.court.label,
        nextActionAt: toDate(c.nextHearingDate),
        caseVerifiedAt: new Date()
      }
    });
    await writeAudit(tx, { entityType: 'LegalRecord', entityId: row.id, action: 'CourtCaseRefreshed', fieldName: 'caseStage', oldValue: record.caseStage, newValue: c.status.label, performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId });
    return row;
  });
  invalidate();
  return { vehicle: current, legalRecord: legal };
}

/** Release a seized vehicle from custody (court order / release to owner). Lifts custody restrictions, closes open seizure records, retires the asset. */
export async function releaseCustody(user: SessionUser, id: string, args: { reason: string; authority: string; releasedTo?: string }, correlationId: string): Promise<VehicleView> {
  const current = await loadOwnVehicle(user, id);
  if (current.ownershipCategory !== 'SEIZED_IMPOUNDED') throw new DomainError('Only seized/impounded vehicles follow the custody-release workflow.', 400);
  assertCustodyActionable(current, 'release');

  const vehicle = await prisma.$transaction(async (tx) => {
    const lifted = await tx.vehicleRestriction.updateMany({
      where: { vehicleId: id, liftedAt: null, type: { in: ['LEGAL_CUSTODY', 'COURT_ORDER'] } },
      data: { liftedAt: new Date(), liftedBy: user.username, liftReason: `Custody released: ${args.reason}` }
    });
    const closed = await tx.legalRecord.updateMany({
      where: { vehicleId: id, type: { in: ['SEIZURE', 'COURT_CASE'] }, status: { not: 'RESOLVED' } },
      data: { status: 'RESOLVED' }
    });
    await tx.vehicle.update({
      where: { id },
      data: {
        custodyState: 'RELEASED',
        custodyNote: `Released by ${args.authority}${args.releasedTo ? ` to ${args.releasedTo}` : ''}: ${args.reason}`,
        custodyUpdatedAt: new Date(),
        operationalStatus: 'RETIRED'
      }
    });
    await reevaluateEligibility(id, tx);
    await writeAudit(tx, { entityType: 'Vehicle', entityId: id, action: 'CustodyReleased', fieldName: 'custodyState', oldValue: current.custodyState ?? 'IN_CUSTODY', newValue: 'RELEASED', performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason: args.reason });
    const refreshed = await tx.vehicle.findUniqueOrThrow({ where: { id } });
    await recomputeStationInventoryForVehicle(tx, refreshed.stationId);
    return refreshed;
  }, { timeout: 20000, maxWait: 10000 });
  invalidate();
  return mapWithOrg(vehicle);
}

/** Mark a vehicle ready for the authorised disposal/auction process (GeM surplus listing). Stops ordinary allocation. */
export async function markAuctionReady(user: SessionUser, id: string, authority: string, correlationId: string): Promise<VehicleView> {
  const current = await loadOwnVehicle(user, id);
  if (current.ownershipCategory === 'OTHER_UNVERIFIED') throw new DomainError('Unverified vehicles must complete ownership verification before disposal.', 400);
  if (current.custodyState === 'AUCTION_READY') throw new DomainError('Vehicle is already marked auction-ready.', 409);
  assertCustodyActionable(current, 'auction marking');

  const vehicle = await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({
      where: { id },
      data: {
        custodyState: 'AUCTION_READY',
        custodyNote: `Auction/disposal authorised by ${authority}`,
        custodyUpdatedAt: new Date(),
        operationalStatus: 'RETIRED'
      }
    });
    await reevaluateEligibility(id, tx);
    await writeAudit(tx, { entityType: 'Vehicle', entityId: id, action: 'AuctionReadyMarked', fieldName: 'custodyState', oldValue: current.custodyState ?? null, newValue: 'AUCTION_READY', performedBy: user.username, performedByRole: user.role, organizationId: current.organizationId, correlationId, reason: `Authority: ${authority}` });
    const refreshed = await tx.vehicle.findUniqueOrThrow({ where: { id } });
    await recomputeStationInventoryForVehicle(tx, refreshed.stationId);
    return refreshed;
  }, { timeout: 20000, maxWait: 10000 });
  invalidate();
  return mapWithOrg(vehicle);
}

// ---------------------------------------------------------------------------
// Action dispatcher
// ---------------------------------------------------------------------------

export interface VehicleActionResult {
  vehicle: VehicleView;
  trip?: unknown;
  ticket?: unknown;
  incident?: unknown;
  fuelLog?: unknown;
  legalRecord?: unknown;
}

export async function applyVehicleAction(user: SessionUser, id: string, action: VehicleActionParsed, correlationId: string): Promise<VehicleActionResult> {
  switch (action.type) {
    case 'update':
      return { vehicle: await updateVehicle(user, id, action.patch, correlationId) };
    case 'setOperationalStatus':
      return { vehicle: await setOperationalStatus(user, id, action.status, action.reason, correlationId) };
    case 'assignDriver':
      return { vehicle: await assignDriver(user, id, action.driverName, action.driverPhone, correlationId) };
    case 'submitOwnership':
      return { vehicle: await submitOwnership(user, id, action.category, action.evidenceRef, action.evidenceNote, correlationId) };
    case 'decideOwnership':
      return { vehicle: await decideOwnership(user, id, action.verificationId, action.decision, action.note, correlationId) };
    case 'addRestriction':
      return { vehicle: await addRestriction(user, id, action, correlationId) };
    case 'liftRestriction':
      return { vehicle: await liftRestriction(user, id, action.restrictionId, action.reason, correlationId) };
    case 'reevaluateEligibility':
      return { vehicle: await reevaluate(user, id, correlationId) };
    case 'renewCompliance':
      return { vehicle: await renewCompliance(user, id, action.document, action.newExpiry, action.reference, correlationId) };
    case 'startTrip': {
      const r = await startTrip(user, id, action, correlationId);
      return { vehicle: await mapWithOrg(r.vehicle), trip: r.trip };
    }
    case 'endTrip': {
      const r = await endTrip(user, id, action, correlationId);
      return { vehicle: await mapWithOrg(r.vehicle), trip: r.trip };
    }
    case 'raiseMaintenance': {
      const r = await raiseMaintenance(user, id, action, correlationId);
      return { vehicle: await mapWithOrg(r.vehicle), ticket: r.ticket };
    }
    case 'updateMaintenance': {
      const r = await updateMaintenance(user, id, action, correlationId);
      return { vehicle: await mapWithOrg(r.vehicle), ticket: r.ticket };
    }
    case 'logIncident': {
      const r = await logIncident(user, id, action, correlationId);
      return { vehicle: await mapWithOrg(r.vehicle), incident: r.incident };
    }
    case 'resolveIncident': {
      const r = await resolveIncident(user, id, action, correlationId);
      return { vehicle: await mapWithOrg(r.vehicle), incident: r.incident };
    }
    case 'logFuel': {
      const r = await logFuel(user, id, action, correlationId);
      return { vehicle: await mapWithOrg(r.vehicle), fuelLog: r.fuelLog };
    }
    case 'addLegalRecord': {
      const r = await addLegalRecord(user, id, action.record, correlationId);
      return { vehicle: await mapWithOrg(r.vehicle), legalRecord: r.legalRecord };
    }
    case 'updateLegalRecord': {
      const r = await updateLegalRecord(user, id, action, correlationId);
      return { vehicle: await mapWithOrg(r.vehicle), legalRecord: r.legalRecord };
    }
    case 'linkCourtCase': {
      const r = await linkCourtCase(user, id, action.cnr, correlationId);
      return { vehicle: await mapWithOrg(r.vehicle), legalRecord: r.legalRecord };
    }
    case 'refreshCourtCase': {
      const r = await refreshCourtCase(user, id, action.recordId, correlationId);
      return { vehicle: await mapWithOrg(r.vehicle), legalRecord: r.legalRecord };
    }
    case 'releaseCustody':
      return { vehicle: await releaseCustody(user, id, action, correlationId) };
    case 'markAuctionReady':
      return { vehicle: await markAuctionReady(user, id, action.authority, correlationId) };
    case 'retire':
      return { vehicle: await retireVehicle(user, id, action.reason, correlationId) };
    default: {
      const _exhaustive: never = action;
      throw new DomainError('Unsupported vehicle action.', 400);
    }
  }
}

// ---------------------------------------------------------------------------
// Bulk
// ---------------------------------------------------------------------------

export interface BulkImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; registrationNumber: string; error: string }[];
}

export async function bulkImport(user: SessionUser, rows: VehicleInputParsed[], correlationId: string): Promise<BulkImportResult> {
  const result: BulkImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    try {
      const normalized = normalizeRegistration(row.registrationNumber);
      const existing = user.organizationId
        ? await prisma.vehicle.findFirst({ where: { organizationId: user.organizationId, registrationNormalized: normalized } })
        : null;
      if (existing) {
        await updateVehicle(user, existing.id, row, correlationId);
        result.updated += 1;
      } else {
        await registerVehicle(user, row, correlationId);
        result.created += 1;
      }
    } catch (error) {
      result.skipped += 1;
      result.errors.push({ row: i + 1, registrationNumber: row.registrationNumber, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
  invalidate();
  return result;
}

export async function reassignStation(user: SessionUser, ids: string[], stationId: string, correlationId: string): Promise<{ count: number }> {
  let count = 0;
  for (const id of ids) {
    try {
      await updateVehicle(user, id, { stationId }, correlationId);
      count += 1;
    } catch {
      // skip out-of-scope / not-found
    }
  }
  return { count };
}

/** Invoked by the sync-job handler for queued CSV imports. */
export async function importVehiclesFromJob(payload: Prisma.JsonValue): Promise<BulkImportResult> {
  const data = payload as unknown as { user?: SessionUser; rows?: VehicleInputParsed[]; correlationId?: string };
  if (!data?.user || !Array.isArray(data.rows)) {
    return { created: 0, updated: 0, skipped: 0, errors: [{ row: 0, registrationNumber: '', error: 'Invalid import payload.' }] };
  }
  return bulkImport(data.user, data.rows, data.correlationId ?? 'job');
}
