import { requirePermission } from '@/lib/cloud/context';
import { prisma } from '@/lib/db/prisma';
import { handleRouteError, ok } from '@/lib/cloud/http';
import { getStationInventoryBreakdown } from '@/lib/cloud/ops/inventory';
import { getAllocationView } from '@/lib/cloud/ops/allocations';
import { buildRequestView } from '@/lib/cloud/ops/requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const stationFilter = url.searchParams.get('stationId');
    const classFilter = url.searchParams.get('vehicleClass');
    const stateFilter = url.searchParams.get('state');
    const lifecycleFilter = url.searchParams.get('lifecycle');

    // 1. Fetch stations and their breakdowns
    const stations = await prisma.station.findMany({
      where: stationFilter ? { id: stationFilter } : {},
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, zone: true, district: true }
    });

    const stationBreakdowns = await Promise.all(
      stations.map((s) => getStationInventoryBreakdown(s.id))
    );

    // 2. Fetch requests
    const requestWhere: Record<string, unknown> = {};
    if (stateFilter) requestWhere.state = stateFilter;
    if (classFilter) requestWhere.requestedClass = classFilter;
    if (stationFilter) {
      requestWhere.OR = [
        { requestingStationId: stationFilter },
        { providerStationId: stationFilter }
      ];
    }

    const requestRows = await prisma.assetRequest.findMany({
      where: requestWhere,
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    const requests = await Promise.all(requestRows.map((r) => buildRequestView(r.id, auth.user)));

    // 3. Fetch allocations
    const allocWhere: Record<string, unknown> = {};
    if (lifecycleFilter) allocWhere.lifecycle = lifecycleFilter;
    if (stationFilter) {
      allocWhere.OR = [
        { borrowingStationId: stationFilter },
        { lendingStationId: stationFilter }
      ];
    }

    const allocRows = await prisma.allocation.findMany({
      where: allocWhere,
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    const allocations = await Promise.all(allocRows.map((a) => getAllocationView(auth.user, a.id)));

    // 4. Vehicle Sharing Audit Trail
    const auditRows = await prisma.auditLog.findMany({
      where: {
        entityType: { in: ['AssetRequest', 'Allocation'] }
      },
      orderBy: { performedAt: 'desc' },
      take: 50
    });

    return ok({
      stations: stationBreakdowns,
      requests,
      allocations,
      auditTrail: auditRows
    });
  } catch (error) {
    return handleRouteError('cloud/reports/vehicle-sharing:get', error);
  }
}

