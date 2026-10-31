import { requirePermission } from '@/lib/cloud/context';
import { prisma } from '@/lib/db/prisma';
import { handleRouteError, ok } from '@/lib/cloud/http';
import { DomainError } from '@/lib/cloud/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cloud/station/profile — the signed-in operator's station identity card:
 * station record, inventory tally, and fleet quick counts. Requires a station to
 * be attached to the operator's account.
 */
export async function GET(request: Request) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;
  try {
    const { user } = auth;
    const url = new URL(request.url);
    const queryStationId = url.searchParams.get('stationId');

    let targetStationId: string | null = user.stationId;
    if (user.role === 'ADMIN') {
      if (queryStationId) {
        targetStationId = queryStationId;
      } else if (!targetStationId) {
        const first = await prisma.station.findFirst({ orderBy: { name: 'asc' }, select: { id: true } });
        targetStationId = first?.id ?? null;
      }
    }

    if (!targetStationId) throw new DomainError('Your account is not attached to a police station.', 404);

    const station = await prisma.station.findUnique({
      where: { id: targetStationId },
      include: {
        inventory: true,
        _count: { select: { vehicles: true } }
      }
    });
    if (!station) throw new DomainError('Station not found.', 404);

    const [operators, activeAllocations] = await Promise.all([
      prisma.operator.findMany({
        where: { stationId: station.id, active: true },
        select: { username: true, displayName: true, role: true },
        orderBy: { username: 'asc' }
      }),
      prisma.allocation.count({ where: { lifecycle: { in: ['RESERVED', 'AWAITING_HANDOVER', 'ACTIVE'] }, vehicle: { stationId: station.id } } })
    ]);

    return ok({
      station: {
        code: station.code,
        name: station.name,
        zone: station.zone,
        district: station.district,
        lat: station.lat,
        lng: station.lng,
        inchargeName: station.inchargeName,
        phone: station.phone
      },
      inventory: station.inventory
        ? { patrolCar: station.inventory.patrolCar, motorcycle: station.inventory.motorcycle, van: station.inventory.van, heavy: station.inventory.heavy }
        : { patrolCar: 0, motorcycle: 0, van: 0, heavy: 0 },
      vehicleCount: station._count.vehicles,
      activeAllocations,
      officers: operators
    });
  } catch (error) {
    return handleRouteError('cloud/station/profile', error);
  }
}
