import 'server-only';

import type { Prisma, Vehicle } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { DEFAULT_FLEET_SETTINGS, FLEET_SETTINGS_KEY, mergeFleetSettings } from '@/lib/cloud/errors';
import type {
  AvailabilityState,
  AvailabilityView,
  EligibilityDecision,
  EligibilityReason,
  EligibilityState,
  FleetSettings
} from '@/types';

type TxClient = Prisma.TransactionClient | typeof prisma;

async function loadSettings(tx: TxClient): Promise<FleetSettings> {
  const row = await tx.appSetting.findUnique({ where: { key: FLEET_SETTINGS_KEY } });
  return row ? mergeFleetSettings(row.value) : { ...DEFAULT_FLEET_SETTINGS };
}

export interface EligibilityContext {
  now?: Date;
  settings?: FleetSettings;
  restrictions?: Array<{ type: string; reasonCode: string; authority: string; liftedAt: Date | null; expiresAt: Date | null }>;
  openMaintenance?: Array<{ blocksAvailability: boolean; windowStart: Date | null; windowEnd: Date | null; status: string }>;
}

function reason(code: string, message: string, blocking: boolean): EligibilityReason {
  return { code, message, blocking };
}

/**
 * Server-side eligibility decision (spec 15). Fails closed. Telemetry NEVER influences the
 * result. Precedence of blocking reasons: ownership/custody, restriction, operational
 * status / maintenance window, compliance expiry.
 */
export function decide(
  vehicle: Pick<
    Vehicle,
    | 'ownershipCategory'
    | 'operationalStatus'
    | 'pucExpiry'
    | 'insuranceExpiry'
    | 'fitnessExpiry'
  >,
  ctx: Required<Pick<EligibilityContext, 'now' | 'settings'>> & {
    verifiedOwnership: boolean;
    restrictions: NonNullable<EligibilityContext['restrictions']>;
    openMaintenance: NonNullable<EligibilityContext['openMaintenance']>;
  }
): EligibilityDecision {
  const { now, settings } = ctx;
  const reasons: EligibilityReason[] = [];
  let state: EligibilityState = 'ELIGIBLE';

  // 1. Ownership / custody.
  if (vehicle.ownershipCategory === 'SEIZED_IMPOUNDED') {
    reasons.push(reason('SEIZED_CUSTODY', 'Vehicle is seized/impounded and in legal custody; never allocatable.', true));
    state = 'INELIGIBLE';
  } else if (vehicle.ownershipCategory === 'OTHER_UNVERIFIED') {
    reasons.push(reason('OWNERSHIP_NOT_VERIFIED', 'Ownership/control is unverified.', true));
    state = 'PENDING_VERIFICATION';
  } else if (!ctx.verifiedOwnership) {
    // GOVERNMENT_FLEET but no VERIFIED ownership evidence yet.
    reasons.push(reason('OWNERSHIP_NOT_VERIFIED', 'Government-fleet ownership is pending verification.', true));
    state = 'PENDING_VERIFICATION';
  }

  // 2. Active restrictions (not lifted, not expired).
  const activeRestrictions = ctx.restrictions.filter(
    (r) => r.liftedAt === null && (r.expiresAt === null || r.expiresAt.getTime() > now.getTime())
  );
  if (activeRestrictions.length > 0) {
    for (const r of activeRestrictions) {
      reasons.push(reason('ACTIVE_RESTRICTION', `Active ${r.type} restriction by ${r.authority} (${r.reasonCode}).`, true));
    }
    if (state === 'ELIGIBLE') state = 'RESTRICTED';
  }

  // 3. Operational status + maintenance windows.
  if (vehicle.operationalStatus === 'RETIRED') {
    reasons.push(reason('RETIRED', 'Vehicle is retired.', true));
    state = 'INELIGIBLE';
  } else if (vehicle.operationalStatus === 'OUT_OF_SERVICE') {
    reasons.push(reason('OUT_OF_SERVICE', 'Vehicle is out of service.', true));
    if (state === 'ELIGIBLE' || state === 'RESTRICTED') state = 'INELIGIBLE';
  } else if (vehicle.operationalStatus === 'MAINTENANCE') {
    reasons.push(reason('MAINTENANCE', 'Vehicle operational status is maintenance.', true));
    if (state === 'ELIGIBLE') state = 'RESTRICTED';
  }

  const blockingWindowNow = ctx.openMaintenance.some(
    (m) =>
      m.blocksAvailability &&
      m.status !== 'COMPLETED' &&
      m.status !== 'CANCELLED' &&
      (m.windowStart === null || m.windowStart.getTime() <= now.getTime()) &&
      (m.windowEnd === null || m.windowEnd.getTime() >= now.getTime())
  );
  if (blockingWindowNow) {
    reasons.push(reason('MAINTENANCE_WINDOW', 'An open maintenance window currently blocks availability.', true));
    if (state === 'ELIGIBLE') state = 'RESTRICTED';
  }

  // 4. Compliance.
  const expired: string[] = [];
  const expiringSoon: string[] = [];
  const checkDoc = (label: string, expiry: Date | null) => {
    if (!expiry) return;
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
    if (daysLeft < 0) expired.push(label);
    else if (daysLeft <= settings.complianceWarnDays) expiringSoon.push(label);
  };
  checkDoc('PUC', vehicle.pucExpiry);
  checkDoc('Insurance', vehicle.insuranceExpiry);
  checkDoc('Fitness', vehicle.fitnessExpiry);
  if (expired.length > 0) {
    reasons.push(reason('COMPLIANCE_EXPIRED', `Expired mandatory compliance: ${expired.join(', ')}.`, true));
    if (state === 'ELIGIBLE' || state === 'RESTRICTED') state = 'INELIGIBLE';
  }
  if (expiringSoon.length > 0) {
    reasons.push(reason('COMPLIANCE_EXPIRING', `Compliance expiring soon: ${expiringSoon.join(', ')}.`, false));
  }

  const result = state === 'ELIGIBLE' ? 'eligible' : state === 'PENDING_VERIFICATION' ? 'needs_review' : 'ineligible';

  return {
    result,
    state,
    reasons,
    policyVersion: settings.eligibilityPolicyVersion,
    evaluatedAt: now.toISOString()
  };
}

/** Evaluates eligibility for a vehicle by id, reading restrictions/maintenance/ownership. */
export async function evaluateEligibility(
  vehicleId: string,
  tx: TxClient = prisma,
  settings?: FleetSettings,
  now: Date = new Date()
): Promise<EligibilityDecision> {
  const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) {
    return {
      result: 'ineligible',
      state: 'INELIGIBLE',
      reasons: [reason('NOT_FOUND', 'Vehicle not found.', true)],
      policyVersion: (settings ?? (await loadSettings(tx))).eligibilityPolicyVersion,
      evaluatedAt: now.toISOString()
    };
  }
  const effectiveSettings = settings ?? (await loadSettings(tx));

  const [restrictions, openMaintenance, latestVerified] = await Promise.all([
    tx.vehicleRestriction.findMany({ where: { vehicleId } }),
    tx.maintenanceRecord.findMany({ where: { vehicleId, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    tx.vehicleOwnershipVerification.findFirst({ where: { vehicleId, status: 'VERIFIED' }, orderBy: { createdAt: 'desc' } })
  ]);

  return decide(vehicle, {
    now,
    settings: effectiveSettings,
    verifiedOwnership: Boolean(latestVerified),
    restrictions: restrictions.map((r) => ({
      type: r.type,
      reasonCode: r.reasonCode,
      authority: r.authority,
      liftedAt: r.liftedAt,
      expiresAt: r.expiresAt
    })),
    openMaintenance: openMaintenance.map((m) => ({
      blocksAvailability: m.blocksAvailability,
      windowStart: m.windowStart,
      windowEnd: m.windowEnd,
      status: m.status
    }))
  });
}

/**
 * Re-evaluates eligibility and persists the cached columns on the Vehicle. The DB CHECK
 * forbids ELIGIBLE unless GOVERNMENT_FLEET, so this is also the only place that may set it.
 * Returns the decision.
 */
export async function reevaluateEligibility(
  vehicleId: string,
  tx: TxClient = prisma,
  settings?: FleetSettings,
  now: Date = new Date()
): Promise<EligibilityDecision> {
  const decision = await evaluateEligibility(vehicleId, tx, settings, now);
  await tx.vehicle.update({
    where: { id: vehicleId },
    data: {
      eligibilityState: decision.state,
      eligibilityReasons: decision.reasons as unknown as Prisma.InputJsonValue,
      eligibilityPolicyVersion: decision.policyVersion,
      eligibilityEvaluatedAt: new Date(decision.evaluatedAt)
    }
  });
  return decision;
}

// ---------------------------------------------------------------------------
// Availability (eligibility + operational + maintenance windows + allocations)
// ---------------------------------------------------------------------------

const LIVE_LIFECYCLES = ['RESERVED', 'AWAITING_HANDOVER', 'ACTIVE', 'RETURNED_PENDING_INSPECTION', 'INCIDENT_HOLD'];

/**
 * Computes availability of a vehicle for an optional [from,to] range (null = "right now").
 * Allocations are authoritative (they are created at approval). An overlapping live
 * allocation makes an otherwise-eligible vehicle ALLOCATED.
 */
export async function computeAvailability(
  vehicleId: string,
  from: Date | null,
  to: Date | null,
  tx: TxClient = prisma,
  settings?: FleetSettings,
  now: Date = new Date()
): Promise<AvailabilityView> {
  const effectiveSettings = settings ?? (await loadSettings(tx));
  const decision = await evaluateEligibility(vehicleId, tx, effectiveSettings, now);
  const asOf = now.toISOString();
  const rangeFrom = from ? from.toISOString() : null;
  const rangeTo = to ? to.toISOString() : null;

  // Eligibility gates first.
  if (decision.state === 'INELIGIBLE') {
    return { state: 'INELIGIBLE', reasons: decision.reasons.filter((r) => r.blocking).map((r) => r.message), from: rangeFrom, to: rangeTo, asOf };
  }
  if (decision.state === 'PENDING_VERIFICATION') {
    return { state: 'PENDING_VERIFICATION', reasons: decision.reasons.map((r) => r.message), from: rangeFrom, to: rangeTo, asOf };
  }
  if (decision.state === 'RESTRICTED') {
    return { state: 'RESTRICTED', reasons: decision.reasons.filter((r) => r.blocking).map((r) => r.message), from: rangeFrom, to: rangeTo, asOf };
  }

  // Eligible: check overlapping allocations for the requested range (or now).
  const checkFrom = from ?? now;
  const checkTo = to ?? new Date(now.getTime() + 1); // instantaneous probe

  const overlap = await tx.allocation.findFirst({
    where: {
      vehicleId,
      lifecycle: { in: LIVE_LIFECYCLES },
      startAt: { lt: checkTo },
      endAt: { gt: checkFrom }
    },
    select: { id: true, startAt: true, endAt: true }
  });

  if (overlap) {
    return {
      state: 'ALLOCATED',
      reasons: [`Overlapping allocation ${overlap.startAt.toISOString()} - ${overlap.endAt.toISOString()}.`],
      from: rangeFrom,
      to: rangeTo,
      asOf
    };
  }

  const availState: AvailabilityState = 'AVAILABLE';
  return { state: availState, reasons: [], from: rangeFrom, to: rangeTo, asOf };
}

/** Re-evaluates eligibility for a batch of vehicles (used by the periodic sync job). */
export async function reevaluateAll(tx: TxClient = prisma, now: Date = new Date()): Promise<number> {
  const settings = await loadSettings(tx);
  const vehicles = await tx.vehicle.findMany({ select: { id: true } });
  let count = 0;
  for (const v of vehicles) {
    await reevaluateEligibility(v.id, tx, settings, now);
    count += 1;
  }
  return count;
}
