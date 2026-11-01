import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public live telemetry status for edge telematics units (e.g. SANCHAY-IOT-001).
 * Allows dashboard polling and cloud-to-local telemetry replication.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code') || 'SANCHAY-IOT-001';

  try {
    const device = await prisma.iotDevice.findFirst({
      where: {
        OR: [{ deviceCode: code }, { id: code }],
      },
      include: {
        vehicle: true,
      },
    });

    if (!device) {
      return NextResponse.json({ success: false, error: 'Device not found' }, { status: 404 });
    }

    const latestPoint = await prisma.telemetryPoint.findFirst({
      where: {
        OR: [
          { deviceCode: device.deviceCode },
          ...(device.vehicleId ? [{ vehicleId: device.vehicleId }] : []),
        ],
      },
      orderBy: { recordedAt: 'desc' },
    });

    let sensors: Record<string, unknown> = {};
    if (device.notes) {
      try {
        sensors = JSON.parse(device.notes);
      } catch {
        // ignore parse error
      }
    }

    return NextResponse.json({
      success: true,
      device: {
        id: device.id,
        deviceCode: device.deviceCode,
        status: device.status,
        lastSeenAt: device.lastSeenAt,
        signalDbm: device.signalDbm,
        firmware: device.firmware,
        vehicleId: device.vehicleId,
        sensors,
      },
      telemetry: latestPoint,
    });
  } catch (error) {
    console.error('[iot/live]', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch live telemetry' }, { status: 500 });
  }
}
