import { z } from 'zod';
import { ok, readJson } from '@/lib/cloud/http';
import { generate } from '@/lib/ai/providers';
import { AUTO_DISPATCH_SYSTEM } from '@/lib/ai/prompts';
import { aiRoute, logAi, metaOf, parseJsonObject } from '@/lib/ai/route';
import { prisma } from '@/lib/db/prisma';
import { orgTree } from '@/lib/auth/scope';
import { Prisma } from '@prisma/client';
import type { AutoDispatchCandidate, AutoDispatchResponse } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  text: z.string().trim().optional(),
  intent: z.string().trim().optional(),
  stationId: z.string().trim().nullish(),
  provider: z.enum(['auto', 'gemini', 'nvidia', 'openrouter', 'groq', 'mistral']).optional()
}).refine((data) => Boolean(data.text || data.intent), {
  message: 'Mission text or intent is required.'
});

const CLASSES = ['PATROL_CAR', 'MOTORCYCLE', 'VAN', 'HEAVY'] as const;

function parseIntentFallback(text: string): {
  purpose: string;
  classNeeded: (typeof CLASSES)[number];
  passengerCount: number;
  destination: string | null;
  urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
} {
  const lower = text.toLowerCase();

  // Class detection
  let classNeeded: (typeof CLASSES)[number] = 'PATROL_CAR';
  if (lower.includes('bike') || lower.includes('motorcycle') || lower.includes('pulsar')) {
    classNeeded = 'MOTORCYCLE';
  } else if (lower.includes('van') || lower.includes('bus') || lower.includes('force')) {
    classNeeded = 'VAN';
  } else if (lower.includes('truck') || lower.includes('heavy') || lower.includes('crane')) {
    classNeeded = 'HEAVY';
  }

  // Passengers
  const paxMatch = text.match(/(\d+)\s*(?:person|officer|pax|passenger|people|constable|staff|personnel|jawan)/i);
  let passengerCount = paxMatch ? parseInt(paxMatch[1], 10) : classNeeded === 'MOTORCYCLE' ? 1 : 4;
  if (passengerCount < 1) passengerCount = 1;
  if (passengerCount > 50) passengerCount = 50;

  // Urgency
  let urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY' = 'ROUTINE';
  if (lower.includes('sos') || lower.includes('riot') || lower.includes('immediate') || lower.includes('critical')) {
    urgency = 'EMERGENCY';
  } else if (lower.includes('urgent') || lower.includes('vip') || lower.includes('escort') || lower.includes('chase')) {
    urgency = 'URGENT';
  }

  // Destination / Purpose
  let destination: string | null = null;
  const destMatch = text.match(/(?:at|to|near|in|for)\s+([A-Z][a-zA-Z0-9\s]{2,25})/);
  if (destMatch) {
    destination = destMatch[1].trim();
  }

  return {
    purpose: text.slice(0, 160),
    classNeeded,
    passengerCount,
    destination,
    urgency
  };
}

export async function POST(request: Request) {
  return aiRoute(request, 'ai/vehicles/auto-dispatch', 'draftRequest', async ({ user, settings }) => {
    const raw = await readJson(request);
    const input = bodySchema.parse(raw);
    const missionText = (input.intent || input.text || '').trim();

    // Determine station scoping
    let targetStationId: string | null = null;
    if (user.role === 'STATION_OFFICER' || user.role === 'FIELD_STAFF') {
      targetStationId = user.stationId ?? null;
    } else if (input.stationId) {
      targetStationId = input.stationId;
    }

    const fallbackParsed = parseIntentFallback(missionText);

    // AI Intent Analysis
    let parsedRequirements = fallbackParsed;
    let aiMeta = {
      provider: null as import('@/types/ai').AiProviderId | null,
      model: null as string | null,
      latencyMs: 0,
      attempts: [] as import('@/types/ai').ProviderAttempt[],
      degraded: true
    };

    try {
      const now = new Date();
      const aiResult = await generate(
        [
          { role: 'system', content: AUTO_DISPATCH_SYSTEM },
          {
            role: 'user',
            content: `DATA:\nCurrent time (IST): ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.\nMission intent: <<<${missionText}>>>`
          }
        ],
        {
          preferred: input.provider ?? settings.preferredProvider,
          order: settings.fallbackOrder,
          maxTokens: 500,
          temperature: 0.1,
          json: true
        }
      );

      aiMeta = metaOf(aiResult);
      if (aiResult.text) {
        const parsed = parseJsonObject(aiResult.text);
        if (parsed && typeof parsed.parsedRequirements === 'object') {
          const pr = parsed.parsedRequirements as Record<string, unknown>;
          parsedRequirements = {
            purpose: typeof pr.purpose === 'string' ? pr.purpose.slice(0, 160) : fallbackParsed.purpose,
            classNeeded: CLASSES.includes(pr.classNeeded as (typeof CLASSES)[number])
              ? (pr.classNeeded as (typeof CLASSES)[number])
              : fallbackParsed.classNeeded,
            passengerCount: Math.min(50, Math.max(1, Number(pr.passengerCount) || fallbackParsed.passengerCount)),
            destination: typeof pr.destination === 'string' ? pr.destination.slice(0, 100) : fallbackParsed.destination,
            urgency: ['ROUTINE', 'URGENT', 'EMERGENCY'].includes(String(pr.urgency))
              ? (pr.urgency as 'ROUTINE' | 'URGENT' | 'EMERGENCY')
              : fallbackParsed.urgency
          };
        }
      }
    } catch {
      // AI fallback gracefully continues
    }

    // Query candidate vehicles
    const andConditions: Prisma.VehicleWhereInput[] = [
      { ownershipCategory: 'GOVERNMENT_FLEET' },
      { eligibilityState: 'ELIGIBLE' },
      { operationalStatus: 'ACTIVE' }
    ];

    const tree = await orgTree(user);
    if (tree !== null) {
      andConditions.push({ organizationId: { in: tree } });
    }

    if (targetStationId) {
      andConditions.push({ stationId: targetStationId });
    }

    const eligibleVehicles = await prisma.vehicle.findMany({
      where: { AND: andConditions },
      select: {
        id: true,
        assetCode: true,
        registrationNumber: true,
        displayName: true,
        vehicleClass: true,
        vehicleType: true,
        makeModel: true,
        seating: true,
        fuelPercent: true,
        driverName: true,
        driverPhone: true,
        pucExpiry: true,
        insuranceExpiry: true,
        fitnessExpiry: true,
        station: { select: { id: true, name: true, code: true } },
        allocations: {
          where: { lifecycle: { in: ['RESERVED', 'AWAITING_HANDOVER', 'ACTIVE'] } },
          select: { id: true, lifecycle: true }
        },
        maintenance: {
          where: { status: { in: ['SCHEDULED', 'IN_PROGRESS', 'OVERDUE'] } },
          select: { id: true }
        }
      },
      take: 20
    });

    const now = new Date();
    const fifteenDaysMs = 15 * 86_400_000;
    const candidates: AutoDispatchCandidate[] = [];

    for (const v of eligibleVehicles) {
      const reg = v.registrationNumber || v.assetCode;
      const isPucExpired = v.pucExpiry ? v.pucExpiry < now : false;
      const isInsuranceExpired = v.insuranceExpiry ? v.insuranceExpiry < now : false;
      const isFitnessExpired = v.fitnessExpiry ? v.fitnessExpiry < now : false;
      const hasExpired = isPucExpired || isInsuranceExpired || isFitnessExpired;

      const isExpiring =
        !hasExpired &&
        ((v.pucExpiry && v.pucExpiry.getTime() - now.getTime() <= fifteenDaysMs) ||
          (v.insuranceExpiry && v.insuranceExpiry.getTime() - now.getTime() <= fifteenDaysMs) ||
          (v.fitnessExpiry && v.fitnessExpiry.getTime() - now.getTime() <= fifteenDaysMs));

      const isAllocated = v.allocations.length > 0;
      const hasOpenMaintenance = v.maintenance.length > 0;
      const seatingCap = v.seating ?? (v.vehicleClass === 'MOTORCYCLE' ? 2 : 5);
      const fuel = v.fuelPercent ?? 65;

      // Readiness state
      let readinessState: 'READY' | 'ATTENTION' | 'GROUNDED' = 'READY';
      if (hasExpired || hasOpenMaintenance) {
        readinessState = 'GROUNDED';
      } else if (isExpiring || isAllocated || fuel < 40) {
        readinessState = 'ATTENTION';
      }

      // Suitability scoring
      let score = 50;

      // Class match
      if (v.vehicleClass === parsedRequirements.classNeeded) {
        score += 15;
      } else if (
        (parsedRequirements.classNeeded === 'PATROL_CAR' && v.vehicleClass === 'VAN') ||
        (parsedRequirements.classNeeded === 'VAN' && v.vehicleClass === 'PATROL_CAR')
      ) {
        score += 5;
      }

      // Seating capacity fit
      if (seatingCap >= parsedRequirements.passengerCount) {
        score += 15;
      } else {
        score -= 30; // Under capacity
      }

      // Fuel status
      if (fuel >= 75) {
        score += 15;
      } else if (fuel >= 40) {
        score += 8;
      } else {
        score -= 20;
      }

      // Active allocation status
      if (isAllocated) {
        score -= 35;
      } else {
        score += 10;
      }

      // Driver readiness
      if (v.driverName) {
        score += 10;
      }

      // Compliance
      if (hasExpired) {
        score -= 40;
      } else if (isExpiring) {
        score -= 10;
      } else {
        score += 5;
      }

      const suitabilityScore = Math.max(10, Math.min(99, score));

      // Build explanation
      const reasons: string[] = [];
      if (v.vehicleClass === parsedRequirements.classNeeded) reasons.push(`Matches ${parsedRequirements.classNeeded}`);
      if (seatingCap >= parsedRequirements.passengerCount) reasons.push(`Fits ${parsedRequirements.passengerCount} officers (${seatingCap}-seater)`);
      if (fuel >= 70) reasons.push(`${fuel}% fuel`);
      if (v.driverName) reasons.push(`Driver: ${v.driverName}`);
      if (isAllocated) reasons.push('Currently on active duty/reservation');
      if (fuel < 40) reasons.push('Low fuel');

      candidates.push({
        vehicleId: v.id,
        assetCode: v.assetCode,
        registrationNumber: reg,
        displayName: v.displayName,
        vehicleClass: v.vehicleClass,
        suitabilityScore,
        suitabilityReason: reasons.join(' · ') || 'Available government patrol asset',
        fuelPercent: v.fuelPercent,
        assignedDriver: v.driverName ? { name: v.driverName, phone: v.driverPhone } : null,
        stationName: v.station?.name ?? 'Central Station',
        complianceStatus: hasExpired ? 'EXPIRED' : isExpiring ? 'EXPIRING' : 'OK',
        readinessState
      });
    }

    // Sort by suitability score descending
    candidates.sort((a, b) => b.suitabilityScore - a.suitabilityScore);

    const warnings: string[] = [];
    if (candidates.length === 0) {
      warnings.push('No eligible government-fleet patrol vehicles found for this station/scope.');
    } else if (candidates[0].suitabilityScore < 60) {
      warnings.push('Top candidate has sub-optimal parameters (low fuel or capacity constraint).');
    }

    // Top candidate recommendation
    const top = candidates.length > 0 ? candidates[0] : null;
    const shiftHours = parsedRequirements.urgency === 'EMERGENCY' ? 4 : 8;
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + shiftHours * 3600_000);

    const suggestedAction = top
      ? {
          vehicleId: top.vehicleId,
          driverName: top.assignedDriver?.name ?? 'Designated Station Officer',
          actionLabel: `Deploy ${top.registrationNumber} (${top.assetCode})`,
          dispatchPayload: {
            vehicleId: top.vehicleId,
            purpose: parsedRequirements.purpose,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            passengers: parsedRequirements.passengerCount
          }
        }
      : null;

    const out: AutoDispatchResponse = {
      ...aiMeta,
      missionIntent: missionText,
      parsedRequirements,
      recommendations: candidates.slice(0, 5),
      suggestedAction,
      warnings,
      generatedAt: new Date().toISOString()
    };

    await logAi('vehicles/auto-dispatch', out);
    return ok(out);
  });
}
