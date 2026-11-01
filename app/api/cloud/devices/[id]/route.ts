import { createHash } from 'node:crypto';
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
    let device = await prisma.iotDevice.findFirst({
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

    if (!device && (id === 'SANCHAY-IOT-001' || id === 'cmvxs10q20001fpnf08beroes')) {
      const flagship = await prisma.vehicle.findFirst({
        where: {
          OR: [
            { registrationNumber: 'MP07-DG-6386' },
            { registrationNormalized: 'MP07DG6386' },
            { sector: 'POLICE_PATROL' }
          ]
        }
      });
      if (flagship) {
        const iotKeyHash = createHash('sha256').update('sk_sanchay_iot_edge_2026').digest('hex');
        device = await prisma.iotDevice.create({
          data: {
            id: 'cmvxs10q20001fpnf08beroes',
            deviceCode: 'SANCHAY-IOT-001',
            kind: 'GPS_TRACKER',
            protocol: 'HTTP',
            status: 'ONLINE',
            simulated: false,
            vehicleId: flagship.id,
            organizationId: flagship.organizationId,
            ingestKeyHash: iotKeyHash,
            ingestKeyPrefix: 'sk_sanchay',
            firmware: 'v1.0-espnow-wifi',
            signalDbm: -58
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
      }
    }

    if (!device) {
      throw new DomainError('Device not found.', 404, 'NOT_FOUND');
    }

    // If on localhost / development, mirror live telemetry from cloud if local is stale
    if (process.env.NODE_ENV !== 'production' && device.deviceCode === 'SANCHAY-IOT-001') {
      const isStaleLocally = !device.lastSeenAt || (Date.now() - new Date(device.lastSeenAt).getTime() > 15000);
      if (isStaleLocally) {
        try {
          const cloudRes = await fetch('https://sanchaynew.vercel.app/api/iot/live?code=SANCHAY-IOT-001', {
            cache: 'no-store',
            signal: AbortSignal.timeout(2000),
          });
          if (cloudRes.ok) {
            const cloudJson = await cloudRes.json();
            if (cloudJson.success && cloudJson.device?.lastSeenAt) {
              const cloudLastSeen = new Date(cloudJson.device.lastSeenAt);
              if (Date.now() - cloudLastSeen.getTime() < 120000) {
                device.lastSeenAt = cloudLastSeen;
                device.status = 'ONLINE';
                device.signalDbm = cloudJson.device.signalDbm ?? device.signalDbm;
                if (cloudJson.device.sensors) {
                  device.notes = JSON.stringify(cloudJson.device.sensors);
                }
                await prisma.iotDevice.update({
                  where: { id: device.id },
                  data: {
                    lastSeenAt: cloudLastSeen,
                    status: 'ONLINE',
                    signalDbm: device.signalDbm,
                    notes: device.notes,
                  },
                }).catch(() => {});
              }
            }
          }
        } catch {
          // ignore fetch error
        }
      }
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
