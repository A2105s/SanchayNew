import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { VehicleClass } from '@/types';
import { VEHICLE_CLASSIFICATIONS } from '@/lib/fleet/classification';

type TxClient = Prisma.TransactionClient | typeof prisma;

export interface StationClassInventory {
  vehicleClass: VehicleClass;
  totalRegistered: number;
  available: number;
  allocated: number;
  unavailable: number;
  pendingApproval: number;
}

export interface StationInventoryBreakdown {
  stationId: string;
  stationName: string;
  totalRegistered: number;
  totalAvailable: number;
  totalAllocated: number;
  totalUnavailable: number;
  totalPendingApproval: number;
  byClass: Record<VehicleClass, StationClassInventory>;
}

export async function getStationInventoryBreakdown(
  stationId: string,
  tx: TxClient = prisma
): Promise<StationInventoryBreakdown> {
  const station = await tx.station.findUnique({
    where: { id: stationId },
    select: { id: true, name: true }
  });

  const now = new Date();

  // 1. All vehicles registered to this station
  const vehicles = await tx.vehicle.findMany({
    where: { stationId },
    select: {
      id: true,
      vehicleClass: true,
      operationalStatus: true,
      eligibilityState: true,
      ownershipCategory: true
    }
  });

  // 2. Outgoing active allocations from this station
  const activeAllocations = await tx.allocation.findMany({
    where: {
      lendingStationId: stationId,
      lifecycle: {
        in: [
          'RESERVED',
          'AWAITING_HANDOVER',
          'ACTIVE',
          'PARTIALLY_RETURNED',
          'RETURN_PENDING_CONFIRMATION',
          'INCIDENT_HOLD',
          'OVERDUE'
        ]
      },
      OR: [
        { endAt: { gt: now } },
        { lifecycle: { in: ['ACTIVE', 'PARTIALLY_RETURNED', 'RETURN_PENDING_CONFIRMATION', 'INCIDENT_HOLD', 'OVERDUE'] } }
      ]
    },
    select: {
      assignedVehicleIds: true,
      returnDetails: true,
      quantity: true,
      returnedQuantity: true,
      vehicleId: true,
      vehicle: { select: { vehicleClass: true } },
      request: { select: { requestedClass: true } }
    }
  });

  // Set of specific allocated vehicle IDs
  const allocatedVehicleIds = new Set<string>();
  const allocatedByClass: Record<string, number> = {};

  for (const alloc of activeAllocations) {
    const unreturnedQty = Math.max(0, (alloc.quantity ?? 1) - (alloc.returnedQuantity ?? 0));
    if (unreturnedQty === 0) continue;

    const targetClass = alloc.vehicle?.vehicleClass || alloc.request?.requestedClass || 'HEAVY';
    allocatedByClass[targetClass] = (allocatedByClass[targetClass] ?? 0) + unreturnedQty;

    const returnDetails = alloc.returnDetails as { returnedVehicleIds?: string[] } | null;
    const returnedSet = new Set<string>(returnDetails?.returnedVehicleIds ?? []);

    if (Array.isArray(alloc.assignedVehicleIds)) {
      let countAdded = 0;
      for (const vid of alloc.assignedVehicleIds) {
        if (typeof vid === 'string' && !returnedSet.has(vid)) {
          if (countAdded < unreturnedQty) {
            allocatedVehicleIds.add(vid);
            countAdded++;
          }
        }
      }
    } else if (alloc.vehicleId && !returnedSet.has(alloc.vehicleId)) {
      allocatedVehicleIds.add(alloc.vehicleId);
    }
  }

  // 3. Pending requests addressed to this station
  const pendingRequests = await tx.assetRequest.findMany({
    where: {
      providerStationId: stationId,
      state: { in: ['SUBMITTED', 'UNDER_REVIEW', 'PENDING_APPROVAL'] }
    },
    select: {
      requestedClass: true,
      quantity: true
    }
  });

  const pendingByClass: Record<string, number> = {};
  for (const req of pendingRequests) {
    const cls = req.requestedClass;
    pendingByClass[cls] = (pendingByClass[cls] ?? 0) + (req.quantity ?? 1);
  }

  // 4. Build classification map
  const byClass = {} as Record<VehicleClass, StationClassInventory>;
  let totalRegisteredAll = 0;
  let totalAvailableAll = 0;
  let totalAllocatedAll = 0;
  let totalUnavailableAll = 0;
  let totalPendingAll = 0;

  for (const c of VEHICLE_CLASSIFICATIONS) {
    const classKey = c.key;
    const classVehicles = vehicles.filter((v) => v.vehicleClass === classKey);

    const totalReg = classVehicles.length;
    let unavailable = 0;
    let available = 0;

    for (const v of classVehicles) {
      const isEligibleGov =
        v.ownershipCategory === 'GOVERNMENT_FLEET' &&
        v.eligibilityState === 'ELIGIBLE' &&
        v.operationalStatus === 'ACTIVE';

      if (!isEligibleGov) {
        unavailable += 1;
      } else if (allocatedVehicleIds.has(v.id)) {
        // counted as allocated below
      } else {
        available += 1;
      }
    }

    const allocated = Math.max(
      classVehicles.filter((v) => allocatedVehicleIds.has(v.id)).length,
      allocatedByClass[classKey] ?? 0
    );

    // Ensure available does not go below 0
    const finalAvailable = Math.max(0, Math.min(available, totalReg - unavailable - allocated));
    const pending = pendingByClass[classKey] ?? 0;

    byClass[classKey] = {
      vehicleClass: classKey,
      totalRegistered: totalReg,
      available: finalAvailable,
      allocated,
      unavailable,
      pendingApproval: pending
    };

    totalRegisteredAll += totalReg;
    totalAvailableAll += finalAvailable;
    totalAllocatedAll += allocated;
    totalUnavailableAll += unavailable;
    totalPendingAll += pending;
  }

  return {
    stationId,
    stationName: station?.name ?? 'Unknown Station',
    totalRegistered: totalRegisteredAll,
    totalAvailable: totalAvailableAll,
    totalAllocated: totalAllocatedAll,
    totalUnavailable: totalUnavailableAll,
    totalPendingApproval: totalPendingAll,
    byClass
  };
}
