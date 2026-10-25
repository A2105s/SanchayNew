import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { type IotDevice } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { DeviceProvisionResult, DeviceView, SessionUser } from '@/types';
import { writeAudit } from '@/lib/cloud/audit';
import { recordCloudEvent } from '@/lib/cloud/backend-events';
import { CLOUD_CACHE_TAGS, invalidateCloudData } from '@/lib/cloud/cached-queries';
import { DomainError } from '@/lib/cloud/errors';
import { mapDevice } from '@/lib/cloud/mappers';
import { nextIncidentCode } from '@/lib/cloud/codes';
import { notify } from '@/lib/cloud/notifications';
import { orgTree } from '@/lib/auth/scope';
import type { DeviceInputParsed, DeviceActionParsed, IngestPayloadParsed } from '@/lib/validation/schemas';

function invalidate() {
  invalidateCloudData(CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.ops, CLOUD_CACHE_TAGS.all);
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function generateIngestKey(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = `sk_${randomBytes(24).toString('base64url')}`;
  return { plaintext, hash: hashKey(plaintext), prefix: plaintext.slice(0, 10) };
}

async function loadDevice(id: string): Promise<IotDevice> {
  const device = await prisma.iotDevice.findUnique({ where: { id } });
  if (!device) throw new DomainError('Device not found.', 404);
  return device;
}

/** Devices are scoped to an org: a device bound to a vehicle inherits that vehicle's org. */
async function assertDeviceInScope(user: SessionUser, device: IotDevice): Promise<void> {
  const tree = await orgTree(user);
  if (tree === null) return; // ADMIN (device.manage at platform scope)
  const orgId = device.organizationId;
  if (orgId && tree.includes(orgId)) return;
  if (!orgId) return; // unbound spare: any org-scoped manager may claim it
  throw new DomainError('Device not found.', 404);
}

async function vehicleOrgId(vehicleId: string): Promise<string> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { organizationId: true } });
  if (!vehicle) throw new DomainError('Vehicle to bind not found.', 404);
  return vehicle.organizationId;
}

// ---------------------------------------------------------------------------
// Provision / bind / rotate / decommission
// ---------------------------------------------------------------------------

export async function provisionDevice(user: SessionUser, input: DeviceInputParsed, correlationId: string): Promise<DeviceProvisionResult> {
  const existing = await prisma.iotDevice.findUnique({ where: { deviceCode: input.deviceCode } });
  if (existing) throw new DomainError(`Device ${input.deviceCode} is already registered.`, 409);

  let organizationId: string | null = user.organizationId;
  if (input.vehicleId) {
    organizationId = await vehicleOrgId(input.vehicleId);
  }

  const key = generateIngestKey();
  const simulated = input.simulated ?? true;

  const device = await prisma.$transaction(async (tx) => {
    const created = await tx.iotDevice.create({
      data: {
        deviceCode: input.deviceCode,
        kind: input.kind,
        protocol: input.protocol,
        vehicleId: input.vehicleId ?? null,
        organizationId,
        firmware: input.firmware ?? null,
        simulated,
        ingestKeyHash: key.hash,
        ingestKeyPrefix: key.prefix,
        notes: input.notes ?? null,
        status: 'OFFLINE',
        provisionedAt: new Date()
      }
    });
    await writeAudit(tx, { entityType: 'Device', entityId: created.id, action: 'DeviceProvisioned', newValue: created.deviceCode, performedBy: user.username, performedByRole: user.role, organizationId, correlationId, reason: 'Device provisioned' });
    return created;
  });

  await recordCloudEvent({ level: 'info', category: 'iot', action: 'provision-device', status: 'succeeded', message: 'Device provisioned.', details: { deviceId: device.id } });
  invalidate();
  // Plaintext key returned ONCE; never persisted or logged.
  return { device: mapDevice(device), ingestKey: key.plaintext };
}

export async function rotateKey(user: SessionUser, id: string, correlationId: string): Promise<DeviceProvisionResult> {
  const device = await loadDevice(id);
  await assertDeviceInScope(user, device);
  const key = generateIngestKey();
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.iotDevice.update({ where: { id }, data: { ingestKeyHash: key.hash, ingestKeyPrefix: key.prefix } });
    await writeAudit(tx, { entityType: 'Device', entityId: id, action: 'DeviceKeyRotated', performedBy: user.username, performedByRole: user.role, organizationId: device.organizationId, correlationId, reason: 'Ingest key rotated' });
    return result;
  });
  invalidate();
  return { device: mapDevice(updated), ingestKey: key.plaintext };
}

export async function bindDevice(user: SessionUser, id: string, vehicleId: string | null, correlationId: string): Promise<DeviceView> {
  const device = await loadDevice(id);
  await assertDeviceInScope(user, device);
  let organizationId = device.organizationId;
  if (vehicleId) organizationId = await vehicleOrgId(vehicleId);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.iotDevice.update({ where: { id }, data: { vehicleId, organizationId } });
    await writeAudit(tx, { entityType: 'Device', entityId: id, action: vehicleId ? 'DeviceBound' : 'DeviceUnbound', fieldName: 'vehicleId', oldValue: device.vehicleId, newValue: vehicleId, performedBy: user.username, performedByRole: user.role, organizationId, correlationId });
    return result;
  });
  invalidate();
  return mapDevice(updated);
}

export async function setDeviceSimulated(user: SessionUser, id: string, simulated: boolean, correlationId: string): Promise<DeviceView> {
  const device = await loadDevice(id);
  await assertDeviceInScope(user, device);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.iotDevice.update({ where: { id }, data: { simulated } });
    await writeAudit(tx, { entityType: 'Device', entityId: id, action: 'DeviceSimulationChanged', fieldName: 'simulated', oldValue: String(device.simulated), newValue: String(simulated), performedBy: user.username, performedByRole: user.role, organizationId: device.organizationId, correlationId });
    return result;
  });
  invalidate();
  return mapDevice(updated);
}

export async function decommissionDevice(user: SessionUser, id: string, correlationId: string): Promise<DeviceView> {
  const device = await loadDevice(id);
  await assertDeviceInScope(user, device);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.iotDevice.update({ where: { id }, data: { status: 'UNPROVISIONED', vehicleId: null, ingestKeyHash: null, ingestKeyPrefix: null } });
    await writeAudit(tx, { entityType: 'Device', entityId: id, action: 'DeviceDecommissioned', fieldName: 'status', oldValue: device.status, newValue: 'UNPROVISIONED', performedBy: user.username, performedByRole: user.role, organizationId: device.organizationId, correlationId, reason: 'Device decommissioned' });
    return result;
  });
  invalidate();
  return mapDevice(updated);
}

export interface DeviceActionResult {
  device: DeviceView;
  ingestKey?: string | null;
}

export async function applyDeviceAction(user: SessionUser, id: string, action: DeviceActionParsed, correlationId: string): Promise<DeviceActionResult> {
  switch (action.type) {
    case 'bind':
      return { device: await bindDevice(user, id, action.vehicleId, correlationId) };
    case 'setSimulated':
      return { device: await setDeviceSimulated(user, id, action.simulated, correlationId) };
    case 'rotateKey': {
      const r = await rotateKey(user, id, correlationId);
      return { device: r.device, ingestKey: r.ingestKey };
    }
    case 'decommission':
      return { device: await decommissionDevice(user, id, correlationId) };
    default: {
      const _exhaustive: never = action;
      throw new DomainError('Unsupported device action.', 400);
    }
  }
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

const MOVING_SPEED_THRESHOLD = 3; // km/h
const FUTURE_TOLERANCE_MS = 5 * 60_000; // reject device clock > 5 min in the future
const RATE_LIMIT_PER_MIN = 60;

// Per-device in-memory sliding window rate limiter.
const ingestWindow = new Map<string, number[]>();
function rateLimited(deviceCode: string, now: number): boolean {
  const windowStart = now - 60_000;
  const list = (ingestWindow.get(deviceCode) ?? []).filter((t) => t > windowStart);
  list.push(now);
  ingestWindow.set(deviceCode, list);
  return list.length > RATE_LIMIT_PER_MIN;
}

export interface IngestResult {
  accepted: boolean;
  deviceId: string;
  vehicleId: string | null;
  incidentOpened: boolean;
}

/**
 * Authenticated device telemetry ingestion.
 *  - authenticates X-Device-Code + Bearer key with a timing-safe compare against the stored hash
 *  - rejects a device with no key / decommissioned / unknown code (401)
 *  - a device may only write telemetry for the vehicle it is bound to
 *  - rejects replay (recordedAt <= lastEventAt) and future timestamps (> 5 min ahead)
 *  - per-device rate limit 60/min
 *  - stores recordedAt (device) and receivedAt (server) separately
 *  - updates live fields but NEVER eligibility/operationalStatus (spec 17)
 *  - SOS opens an incident + notification
 */
export async function ingestTelemetry(deviceCode: string, presentedKey: string, payload: IngestPayloadParsed): Promise<IngestResult> {
  const device = await prisma.iotDevice.findUnique({ where: { deviceCode } });
  // Always compare against SOMETHING to avoid a timing oracle on device existence.
  const expectedHash = device?.ingestKeyHash ?? hashKey('sentinel-no-such-key');
  const presentedHash = hashKey(presentedKey);
  const authed = Boolean(device?.ingestKeyHash) && timingSafeEqual(Buffer.from(presentedHash), Buffer.from(expectedHash));
  if (!device || !authed) {
    throw new DomainError('Invalid device code or ingest key.', 401, 'UNAUTHENTICATED');
  }

  const now = new Date();
  if (rateLimited(deviceCode, now.getTime())) {
    throw new DomainError('Rate limit exceeded for this device.', 429, 'RATE_LIMITED');
  }

  const recordedAt = payload.recordedAt ? new Date(payload.recordedAt) : now;
  if (recordedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    throw new DomainError('recordedAt is too far in the future.', 400, 'FUTURE_TIMESTAMP');
  }
  if (device.lastEventAt && recordedAt.getTime() <= device.lastEventAt.getTime()) {
    throw new DomainError('Stale or replayed telemetry event rejected.', 409, 'REPLAY');
  }
  if (!device.vehicleId) {
    throw new DomainError('Device is not bound to a vehicle.', 409, 'UNBOUND');
  }

  const speed = payload.speedKmph ?? 0;
  const moving = speed > MOVING_SPEED_THRESHOLD;

  const result = await prisma.$transaction(async (tx) => {
    await tx.iotDevice.update({
      where: { id: device.id },
      data: {
        status: 'ONLINE',
        simulated: false,
        lastSeenAt: now,
        lastEventAt: recordedAt,
        batteryPct: payload.batteryPct ?? device.batteryPct,
        signalDbm: payload.signalDbm ?? device.signalDbm
      }
    });

    await tx.telemetryPoint.create({
      data: {
        vehicleId: device.vehicleId as string,
        deviceCode: device.deviceCode,
        lat: payload.lat,
        lng: payload.lng,
        speedKmph: speed,
        heading: payload.heading ?? 0,
        accuracyM: payload.accuracyM ?? null,
        ignition: payload.ignition ?? false,
        fuelPercent: payload.fuelPercent ?? null,
        batteryV: payload.batteryV ?? null,
        recordedAt,
        receivedAt: now
      }
    });

    const vehicle = await tx.vehicle.findUnique({ where: { id: device.vehicleId as string } });
    let incidentOpened = false;
    if (vehicle) {
      const nextStatus = moving ? 'MOVING' : 'IDLE';
      let idleSince = vehicle.idleSince;
      if (nextStatus === 'IDLE') {
        if (vehicle.status !== 'IDLE' || !idleSince) idleSince = now;
      } else {
        idleSince = null;
      }
      // Live fields only - never eligibilityState / operationalStatus / ownershipCategory.
      await tx.vehicle.update({
        where: { id: vehicle.id },
        data: {
          lat: payload.lat,
          lng: payload.lng,
          speedKmph: speed,
          heading: payload.heading ?? 0,
          ignition: payload.ignition ?? false,
          fuelPercent: payload.fuelPercent ?? vehicle.fuelPercent,
          status: nextStatus,
          idleSince,
          lastSeenAt: recordedAt,
          lastIngestedAt: now,
          gpsSource: 'AIS_140'
        }
      });

      if (payload.sos) {
        const incidentCode = await nextIncidentCode(tx);
        const incident = await tx.incidentReport.create({
          data: { incidentCode, vehicleId: vehicle.id, type: 'SOS', severity: 'CRITICAL', message: `SOS triggered from device ${device.deviceCode}.`, reporterName: device.deviceCode, lat: payload.lat, lng: payload.lng, offlineCaptured: false, status: 'OPEN' }
        });
        await writeAudit(tx, { entityType: 'Incident', entityId: incident.id, action: 'SosRaised', newValue: incidentCode, performedBy: device.deviceCode, performedByRole: 'DEVICE', organizationId: vehicle.organizationId, reason: 'Device SOS' });
        await notify(
          { eventKey: `incident:${incident.id}:SOS`, kind: 'INCIDENT_SOS', title: 'SOS incident', body: `SOS from ${vehicle.displayName} (${incidentCode}).`, href: `/vehicles/${vehicle.id}`, recipientOrgId: vehicle.organizationId },
          tx
        );
        incidentOpened = true;
      }
    }
    return { incidentOpened, vehicleId: device.vehicleId };
  });

  await recordCloudEvent({ level: result.incidentOpened ? 'error' : 'info', category: 'iot', action: 'ingest', status: 'succeeded', message: result.incidentOpened ? 'Telemetry ingested with SOS incident.' : 'Telemetry ingested.', recordCount: 1, details: { deviceCode, vehicleId: result.vehicleId } });
  invalidate();
  return { accepted: true, deviceId: device.id, vehicleId: result.vehicleId, incidentOpened: result.incidentOpened };
}
