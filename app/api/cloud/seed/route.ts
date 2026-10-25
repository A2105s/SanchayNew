import { requirePermission } from '@/lib/cloud/context';
import { prisma } from '@/lib/db/prisma';
import { seedDemoData } from '@/lib/seed/gwalior';
import { recordCloudEvent } from '@/lib/cloud/backend-events';
import { CLOUD_CACHE_TAGS, invalidateCloudData } from '@/lib/cloud/cached-queries';
import { DomainError } from '@/lib/cloud/errors';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const seedBodySchema = z.object({ mode: z.enum(['demo', 'reset']) });

/**
 * Deletes all fleet + ops + telemetry data. AuditLog (append-only, trigger-protected) and
 * Operators are NEVER touched.
 */
async function wipeFleetData(): Promise<void> {
  // Children first, respecting FK dependencies.
  await prisma.documentAccessLog.deleteMany({});
  await prisma.vehicleDocument.deleteMany({});
  await prisma.handoverRecord.deleteMany({});
  await prisma.returnRecord.deleteMany({});
  await prisma.extensionRequest.deleteMany({});
  await prisma.allocation.deleteMany({});
  await prisma.approvalStep.deleteMany({});
  await prisma.assetRequest.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.telemetryPoint.deleteMany({});
  await prisma.iotDevice.deleteMany({});
  await prisma.trip.deleteMany({});
  await prisma.maintenanceRecord.deleteMany({});
  await prisma.legalRecord.deleteMany({});
  await prisma.incidentReport.deleteMany({});
  await prisma.fuelLog.deleteMany({});
  await prisma.vehicleRestriction.deleteMany({});
  await prisma.vehicleOwnershipVerification.deleteMany({});
  await prisma.vehicle.deleteMany({});
  await prisma.stationInventory.deleteMany({});
  await prisma.transferRequest.deleteMany({});
  // Detach operators from stations/orgs before removing them.
  await prisma.operator.updateMany({ data: { stationId: null } });
  await prisma.station.deleteMany({});
  await prisma.organization.deleteMany({});
}

export async function POST(request: Request) {
  const auth = await requirePermission(request, undefined, { entityType: 'Seed', entityId: 'demo' });
  if (!auth.ok) return auth.response;
  if (auth.user.role !== 'ADMIN') {
    return handleRouteError('cloud/seed', new DomainError('Only an administrator may seed demo data.', 403));
  }

  try {
    const body = await readJson(request);
    const { mode } = seedBodySchema.parse(body);
    const existing = await prisma.vehicle.count();

    if (mode === 'demo') {
      if (existing > 0) throw new DomainError('Demo data can only be loaded into an empty fleet. Use reset to re-seed.', 409);
      const result = await seedDemoData(prisma);
      await recordCloudEvent({ level: 'info', category: 'seed', action: 'seed-demo', status: 'succeeded', message: 'Demo fleet seeded.', recordCount: result.vehicles });
      invalidateCloudData(CLOUD_CACHE_TAGS.all, CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.ops, CLOUD_CACHE_TAGS.audit);
      return ok(result);
    }

    await wipeFleetData();
    const result = await seedDemoData(prisma);
    await recordCloudEvent({ level: 'info', category: 'seed', action: 'seed-reset', status: 'succeeded', message: 'Fleet data reset and re-seeded.', recordCount: result.vehicles });
    invalidateCloudData(CLOUD_CACHE_TAGS.all, CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.ops, CLOUD_CACHE_TAGS.audit);
    return ok(result);
  } catch (error) {
    return handleRouteError('cloud/seed', error);
  }
}
