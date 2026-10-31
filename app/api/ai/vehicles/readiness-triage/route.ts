import { ok } from '@/lib/cloud/http';
import { generate } from '@/lib/ai/providers';
import { FLEET_READINESS_SYSTEM } from '@/lib/ai/prompts';
import { aiRoute, logAi, metaOf, parseJsonObject } from '@/lib/ai/route';
import { prisma } from '@/lib/db/prisma';
import { orgTree } from '@/lib/auth/scope';
import { Prisma } from '@prisma/client';
import type { FleetReadinessResponse, FleetTriageAction } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const cache = new Map<string, { at: number; value: FleetReadinessResponse }>();
const CACHE_TTL_MS = 2 * 60_000;

export async function GET(request: Request) {
  return aiRoute(request, 'ai/vehicles/readiness-triage', 'pulse', async ({ user, settings }) => {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === '1';
    const queryStationId = url.searchParams.get('stationId');

    // Scoping: STATION_OFFICER is locked to their station; ADMIN can specify station or inspect district-wide
    let targetStationId: string | null = null;
    if (user.role === 'STATION_OFFICER' || user.role === 'FIELD_STAFF') {
      targetStationId = user.stationId ?? null;
    } else if (user.role === 'ADMIN') {
      targetStationId = queryStationId || null;
    } else {
      targetStationId = queryStationId || user.stationId || null;
    }

    const cacheKey = `${user.username}:${targetStationId ?? 'district'}`;
    const hit = cache.get(cacheKey);
    if (hit && !forceRefresh && Date.now() - hit.at < CACHE_TTL_MS) {
      return ok(hit.value);
    }

    const andConditions: Prisma.VehicleWhereInput[] = [];

    // Org scoping
    const tree = await orgTree(user);
    if (tree !== null) {
      andConditions.push({ organizationId: { in: tree } });
    }

    if (targetStationId) {
      andConditions.push({ stationId: targetStationId });
    }

    // Query station info if scoped
    let stationName: string | null = null;
    if (targetStationId) {
      const st = await prisma.station.findUnique({
        where: { id: targetStationId },
        select: { name: true, code: true }
      });
      stationName = st?.name ?? null;
    }

    // Fetch vehicles
    const vehicles = await prisma.vehicle.findMany({
      where: andConditions.length > 0 ? { AND: andConditions } : {},
      select: {
        id: true,
        assetCode: true,
        registrationNumber: true,
        displayName: true,
        vehicleClass: true,
        vehicleType: true,
        operationalStatus: true,
        eligibilityState: true,
        ownershipCategory: true,
        fuelPercent: true,
        lastSeenAt: true,
        pucExpiry: true,
        insuranceExpiry: true,
        fitnessExpiry: true,
        odometerKm: true,
        driverName: true,
        stationId: true,
        station: { select: { id: true, name: true, code: true } },
        maintenance: {
          where: { status: { in: ['SCHEDULED', 'IN_PROGRESS', 'OVERDUE'] } },
          select: { id: true, ticketCode: true, severity: true, title: true, blocksAvailability: true }
        },
        allocations: {
          where: { lifecycle: { in: ['RESERVED', 'AWAITING_HANDOVER', 'ACTIVE'] } },
          select: { id: true, lifecycle: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 500
    });

    const now = new Date();
    const fifteenDaysMs = 15 * 86_400_000;
    const staleTelemetryMs = 48 * 3600_000;

    const readyIds: string[] = [];
    const attentionIds: string[] = [];
    const groundedIds: string[] = [];
    const actions: FleetTriageAction[] = [];

    for (const v of vehicles) {
      const reg = v.registrationNumber || v.assetCode;
      const vStation = v.station?.name ?? stationName ?? 'Central Fleet';

      // Compliance flags
      const isPucExpired = v.pucExpiry ? v.pucExpiry < now : false;
      const isInsuranceExpired = v.insuranceExpiry ? v.insuranceExpiry < now : false;
      const isFitnessExpired = v.fitnessExpiry ? v.fitnessExpiry < now : false;
      const hasExpiredDoc = isPucExpired || isInsuranceExpired || isFitnessExpired;

      const isPucExpiring = !isPucExpired && v.pucExpiry && v.pucExpiry.getTime() - now.getTime() <= fifteenDaysMs;
      const isInsuranceExpiring = !isInsuranceExpired && v.insuranceExpiry && v.insuranceExpiry.getTime() - now.getTime() <= fifteenDaysMs;
      const isFitnessExpiring = !isFitnessExpired && v.fitnessExpiry && v.fitnessExpiry.getTime() - now.getTime() <= fifteenDaysMs;
      const hasExpiringDoc = isPucExpiring || isInsuranceExpiring || isFitnessExpiring;

      // Operational & Status flags
      const isStatusOut = ['MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED'].includes(v.operationalStatus);
      const isRestricted = ['RESTRICTED', 'PENDING_VERIFICATION', 'INELIGIBLE'].includes(v.eligibilityState);
      const isUnverified = v.ownershipCategory !== 'GOVERNMENT_FLEET';
      const hasCriticalMaintenance = v.maintenance.some((m) => m.severity === 'CRITICAL' || m.severity === 'HIGH' || m.blocksAvailability);
      const hasRoutineMaintenance = v.maintenance.length > 0 && !hasCriticalMaintenance;

      const isAllocated = v.allocations.length > 0;
      const isLowFuel = v.fuelPercent !== null && v.fuelPercent !== undefined && v.fuelPercent < 40;
      const isCriticalFuel = v.fuelPercent !== null && v.fuelPercent !== undefined && v.fuelPercent < 20;
      const isStale = !v.lastSeenAt || now.getTime() - v.lastSeenAt.getTime() > staleTelemetryMs;

      // Mission Lane determination
      if (hasExpiredDoc || isStatusOut || isRestricted || isUnverified || hasCriticalMaintenance) {
        groundedIds.push(v.id);
      } else if (hasExpiringDoc || isLowFuel || isAllocated || hasRoutineMaintenance || isStale) {
        attentionIds.push(v.id);
      } else {
        readyIds.push(v.id);
      }

      // Generate 1-Click Action Cards (Executive Managerial Actions)
      if (actions.length < 8) {
        if (hasExpiredDoc || hasExpiringDoc) {
          const expiredDocName = isPucExpired ? 'PUC' : isInsuranceExpired ? 'Insurance' : isFitnessExpired ? 'Fitness' : isPucExpiring ? 'PUC' : isInsuranceExpiring ? 'Insurance' : 'Fitness';
          const isUrgent = isPucExpired || isInsuranceExpired || isFitnessExpired;
          actions.push({
            id: `act-comp-${v.id}-${expiredDocName.toLowerCase()}`,
            type: 'COMPLIANCE_RENEWAL',
            vehicleId: v.id,
            vehicleLabel: `${reg} (${v.displayName})`,
            assetCode: v.assetCode,
            stationName: vStation,
            title: `1-Click Fast Renewal: ${expiredDocName} for ${reg}`,
            description: `${expiredDocName} certificate ${isUrgent ? 'expired' : 'expires in <15 days'}. Upload new slip or commit 1-click renewal.`,
            priority: isUrgent ? 'high' : 'medium',
            impact: isUrgent ? 'Restores legal compliance to lift standdown' : 'Prevents upcoming grounding on active patrol route',
            actionUrl: `/compliance?search=${encodeURIComponent(v.assetCode)}`,
            actionPayload: {
              document: expiredDocName.toUpperCase(),
              vehicleId: v.id
            }
          });
        }

        if (isLowFuel && actions.length < 8) {
          actions.push({
            id: `act-fuel-${v.id}`,
            type: 'FUEL_ROUTING',
            vehicleId: v.id,
            vehicleLabel: `${reg} (${v.displayName})`,
            assetCode: v.assetCode,
            stationName: vStation,
            title: `IOCL Fuel Routing Order: ${reg}`,
            description: `Fuel reserve at ${v.fuelPercent}%. Route to Indian Oil Company depot (Padav / City Center) for 40L standard refuel voucher.`,
            priority: isCriticalFuel ? 'high' : 'medium',
            impact: 'Restores full 120km rapid incident response endurance',
            actionPayload: {
              targetStation: 'IOCL Padav Fleet Depot',
              liters: 40,
              vehicleId: v.id
            }
          });
        }

        if ((hasRoutineMaintenance || hasCriticalMaintenance || v.odometerKm > 80000) && actions.length < 8) {
          actions.push({
            id: `act-maint-${v.id}`,
            type: 'MAINTENANCE_SCHEDULE',
            vehicleId: v.id,
            vehicleLabel: `${reg} (${v.displayName})`,
            assetCode: v.assetCode,
            stationName: vStation,
            title: `Preventive Maintenance: ${reg}`,
            description: hasCriticalMaintenance
              ? 'Critical ticket open. Authorize immediate Police Motor Transport Workshop bay assignment.'
              : 'Preemptive 10,000 km inspection recommended to avoid road breakdown.',
            priority: hasCriticalMaintenance ? 'high' : 'medium',
            impact: 'Zero breakdown risk during VIP movement & emergency bandobast',
            actionUrl: `/maintenance?vehicleId=${v.id}`,
            actionPayload: {
              workshop: 'Police Motor Transport Workshop (Gwalior)',
              vehicleId: v.id
            }
          });
        }
      }
    }

    // Sort actions: high priority first
    const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
    actions.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

    const deterministicSummary = `Fleet readiness audit for ${stationName ? `${stationName}` : 'Gwalior District Fleet'}: ${readyIds.length} vehicles mission-ready for instant dispatch, ${attentionIds.length} vehicles requiring supervisory attention (fuel/compliance/maintenance), and ${groundedIds.length} vehicles grounded.`;

    const deterministicResponse: FleetReadinessResponse = {
      provider: null,
      model: null,
      latencyMs: 0,
      attempts: [],
      degraded: true,
      summary: deterministicSummary,
      lanes: {
        ready: {
          count: readyIds.length,
          vehicleIds: readyIds,
          description: `${readyIds.length} patrol assets fully compliant, fueled, and primed for immediate field missions.`
        },
        attention: {
          count: attentionIds.length,
          vehicleIds: attentionIds,
          description: `${attentionIds.length} assets require routine intervention: certificates expiring, low fuel reserve, or scheduled maintenance.`
        },
        grounded: {
          count: groundedIds.length,
          vehicleIds: groundedIds,
          description: `${groundedIds.length} assets unallocatable due to expired certificates, active maintenance tickets, or restriction.`
        }
      },
      actions: actions.slice(0, 6),
      stationId: targetStationId,
      stationName,
      totalVehicles: vehicles.length,
      generatedAt: new Date().toISOString()
    };

    // AI Enrichment
    let finalResponse = deterministicResponse;

    try {
      const promptData = `
Scope: ${stationName ? `Police Station ${stationName}` : 'All Gwalior Police Stations (District-wide)'}
Total Vehicles Analyzed: ${vehicles.length}
Ready Count: ${readyIds.length}
Attention Count: ${attentionIds.length}
Grounded Count: ${groundedIds.length}
Key Issues:
${actions.map((a) => `- [${a.priority.toUpperCase()}] ${a.title}: ${a.description}`).join('\n')}
`;

      const aiResult = await generate(
        [
          { role: 'system', content: FLEET_READINESS_SYSTEM },
          { role: 'user', content: `DATA (untrusted facts):\n<<<DATA\n${promptData}\nDATA>>>` }
        ],
        {
          preferred: settings.preferredProvider,
          order: settings.fallbackOrder,
          maxTokens: 700,
          temperature: 0.1,
          json: true
        }
      );

      if (aiResult.text) {
        const parsed = parseJsonObject(aiResult.text);
        if (parsed && typeof parsed.summary === 'string') {
          finalResponse = {
            ...metaOf(aiResult),
            summary: parsed.summary.trim(),
            lanes: {
              ready: {
                count: readyIds.length,
                vehicleIds: readyIds,
                description:
                  (parsed.lanes as Record<string, { description?: string }>)?.ready?.description ||
                  deterministicResponse.lanes.ready.description
              },
              attention: {
                count: attentionIds.length,
                vehicleIds: attentionIds,
                description:
                  (parsed.lanes as Record<string, { description?: string }>)?.attention?.description ||
                  deterministicResponse.lanes.attention.description
              },
              grounded: {
                count: groundedIds.length,
                vehicleIds: groundedIds,
                description:
                  (parsed.lanes as Record<string, { description?: string }>)?.grounded?.description ||
                  deterministicResponse.lanes.grounded.description
              }
            },
            actions: actions.slice(0, 6),
            stationId: targetStationId,
            stationName,
            totalVehicles: vehicles.length,
            generatedAt: new Date().toISOString()
          };
        }
      }
    } catch {
      // Degraded fallback
      finalResponse = deterministicResponse;
    }

    await logAi('vehicles/readiness-triage', finalResponse);
    if (!finalResponse.degraded) {
      cache.set(cacheKey, { at: Date.now(), value: finalResponse });
    }

    return ok(finalResponse);
  });
}
