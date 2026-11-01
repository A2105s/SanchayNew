import { requirePermission } from '@/lib/cloud/context';
import { prisma } from '@/lib/db/prisma';
import { mapDevice } from '@/lib/cloud/mappers';
import { handleRouteError, ok } from '@/lib/cloud/http';
import { DomainError } from '@/lib/cloud/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    const device = await prisma.iotDevice.findFirst({
      where: {
        OR: [{ id }, { deviceCode: id }],
      },
      include: {
        vehicle: {
          include: {
            organization: true,
            station: true,
          },
        },
      },
    });

    if (!device) {
      throw new DomainError('Device not found.', 404, 'NOT_FOUND');
    }

    // Fetch up to 50 recent telemetry points
    const telemetryPoints = await prisma.telemetryPoint.findMany({
      where: {
        OR: [
          { deviceCode: device.deviceCode },
          ...(device.vehicleId ? [{ vehicleId: device.vehicleId }] : []),
        ],
      },
      orderBy: { recordedAt: 'desc' },
      take: 50,
    });

    // Fetch active incidents if vehicle is bound
    const incidents = device.vehicleId
      ? await prisma.incidentReport.findMany({
          where: { vehicleId: device.vehicleId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })
      : [];

    let sensors = null;
    if (device.notes) {
      try {
        sensors = JSON.parse(device.notes);
      } catch {}
    }

    return ok({
      device: mapDevice(device),
      vehicle: device.vehicle,
      telemetryPoints,
      incidents,
      sensors,
    });
  } catch (error) {
    return handleRouteError('cloud/devices/[id]', error);
  }
}
