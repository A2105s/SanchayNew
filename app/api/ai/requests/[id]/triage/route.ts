import { ok, readJson } from '@/lib/cloud/http';
import { prisma } from '@/lib/db/prisma';
import { DomainError } from '@/lib/cloud/errors';
import { generate } from '@/lib/ai/providers';
import { REQUEST_TRIAGE_SYSTEM } from '@/lib/ai/prompts';
import { aiRoute, logAi, metaOf, parseJsonObject } from '@/lib/ai/route';
import type { RequestTriageResponse } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return aiRoute(
    request,
    `ai/requests/${id}/triage`,
    'draftRequest',
    async ({ settings }) => {
      const assetRequest = await prisma.assetRequest.findUnique({
        where: { id },
        include: {
          requestingOrg: { select: { name: true } },
          vehicle: {
            select: {
              id: true,
              assetCode: true,
              registrationNumber: true,
              displayName: true,
              vehicleClass: true,
              operationalStatus: true,
              pucExpiry: true,
              insuranceExpiry: true,
              fitnessExpiry: true,
              stationId: true
            }
          }
        }
      });

      if (!assetRequest) throw new DomainError('Request not found.', 404);

      const vehicle = assetRequest.vehicle;
      const openTickets = vehicle
        ? await prisma.maintenanceRecord.findMany({
            where: { vehicleId: vehicle.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
            select: { id: true, title: true, severity: true }
          })
        : [];

      // Vehicle seating estimates by class
      const classCapacity: Record<string, number> = {
        PATROL_CAR: 4,
        MOTORCYCLE: 2,
        VAN: 8,
        HEAVY: 3
      };
      const estCapacity = vehicle
        ? (classCapacity[vehicle.vehicleClass] ?? 4)
        : (classCapacity[assetRequest.requestedClass] ?? 4);

      const tripStart = new Date(assetRequest.startAt);
      const tripEnd = new Date(assetRequest.endAt);

      // Deterministic rule checks
      const passengerFit = assetRequest.passengers <= estCapacity;
      const pucValid = !vehicle?.pucExpiry || vehicle.pucExpiry >= tripEnd;
      const insValid = !vehicle?.insuranceExpiry || vehicle.insuranceExpiry >= tripEnd;
      const fitValid = !vehicle?.fitnessExpiry || vehicle.fitnessExpiry >= tripEnd;
      const allComplianceValid = pucValid && insValid && fitValid;

      const factsText = [
        `Request Code: ${assetRequest.requestCode}`,
        `Purpose: ${assetRequest.purpose}`,
        `Destination: ${assetRequest.destination ?? 'Not specified'}`,
        `Requesting Org: ${assetRequest.requestingOrg.name}`,
        `Requested Class: ${assetRequest.requestedClass}`,
        `Passengers: ${assetRequest.passengers}`,
        `Trip Window: ${tripStart.toISOString()} to ${tripEnd.toISOString()}`,
        vehicle
          ? `Assigned Vehicle: ${vehicle.registrationNumber} (${vehicle.assetCode}, ${vehicle.displayName})`
          : 'Assigned Vehicle: None assigned yet',
        `Estimated Seating Capacity: ${estCapacity}`,
        `Passenger Capacity Check: ${passengerFit ? 'PASS' : `FAIL (${assetRequest.passengers} passengers exceeds capacity of ${estCapacity})`}`,
        `Compliance Check: ${allComplianceValid ? 'PASS' : `FAIL (PUC: ${pucValid ? 'OK' : 'EXPIRED'}, Insurance: ${insValid ? 'OK' : 'EXPIRED'}, Fitness: ${fitValid ? 'OK' : 'EXPIRED'})`}`,
        `Open Maintenance Tickets: ${openTickets.length} (${openTickets.map((t) => `${t.severity} - ${t.title}`).join(', ') || 'None'})`
      ].join('\n');

      const result = await generate(
        [
          { role: 'system', content: REQUEST_TRIAGE_SYSTEM },
          { role: 'user', content: `DATA (untrusted facts):\n<<<DATA\n${factsText}\nDATA>>>` }
        ],
        {
          preferred: settings.preferredProvider,
          order: settings.fallbackOrder,
          maxTokens: 500,
          temperature: 0.1,
          json: true
        }
      );

      const parsed = result.text ? parseJsonObject(result.text) : null;
      let triage: RequestTriageResponse;

      if (parsed && typeof parsed.recommendation === 'string') {
        const rec = ['APPROVE', 'REJECT', 'REQUEST_CHANGES'].includes(parsed.recommendation as string)
          ? (parsed.recommendation as RequestTriageResponse['recommendation'])
          : passengerFit && allComplianceValid && openTickets.length === 0
            ? 'APPROVE'
            : 'REQUEST_CHANGES';

        triage = {
          ...metaOf(result),
          recommendation: rec,
          confidence: Math.min(99, Math.max(70, Number(parsed.confidence) || 90)),
          summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 300) : 'Audited requisition parameters.',
          complianceCheck: {
            valid: allComplianceValid,
            note: typeof (parsed.complianceCheck as Record<string, unknown>)?.note === 'string'
              ? String((parsed.complianceCheck as Record<string, unknown>).note)
              : allComplianceValid
                ? 'All mandatory certificates valid across requested trip window.'
                : 'Compliance expires before or during the trip window.'
          },
          capacityFit: {
            fits: passengerFit,
            passengers: assetRequest.passengers,
            vehicleCapacity: estCapacity,
            note: typeof (parsed.capacityFit as Record<string, unknown>)?.note === 'string'
              ? String((parsed.capacityFit as Record<string, unknown>).note)
              : passengerFit
                ? `Fits ${assetRequest.passengers} passengers within ${estCapacity} seats.`
                : `Overcapacity: ${assetRequest.passengers} passengers requested for ${estCapacity}-seater.`
          },
          maintenanceCheck: {
            ticketsCount: openTickets.length,
            note: typeof (parsed.maintenanceCheck as Record<string, unknown>)?.note === 'string'
              ? String((parsed.maintenanceCheck as Record<string, unknown>).note)
              : openTickets.length === 0
                ? '0 open maintenance tickets.'
                : `${openTickets.length} open maintenance ticket(s) on file.`
          },
          suggestedComment: typeof parsed.suggestedComment === 'string'
            ? parsed.suggestedComment.slice(0, 500)
            : rec === 'APPROVE'
              ? 'Requisition verified. Vehicle and schedule are compliant with municipal transport policies.'
              : 'Please amend passenger list or request a larger vehicle class to satisfy safety regulations.'
        };
      } else {
        // Deterministic fallback
        const rec = passengerFit && allComplianceValid && openTickets.length === 0 ? 'APPROVE' : 'REQUEST_CHANGES';
        triage = {
          ...metaOf({ ...result, degraded: true }),
          recommendation: rec,
          confidence: 85,
          summary: rec === 'APPROVE'
            ? 'Deterministic audit: passenger count, compliance certificates, and maintenance status meet all standards.'
            : 'Deterministic audit: safety or compliance warnings identified on this request.',
          complianceCheck: {
            valid: allComplianceValid,
            note: allComplianceValid ? 'Certificates valid across window.' : 'Compliance expiration issue detected.'
          },
          capacityFit: {
            fits: passengerFit,
            passengers: assetRequest.passengers,
            vehicleCapacity: estCapacity,
            note: passengerFit ? `Fits within ${estCapacity} seats.` : 'Exceeds seating capacity.'
          },
          maintenanceCheck: {
            ticketsCount: openTickets.length,
            note: `${openTickets.length} open tickets.`
          },
          suggestedComment: rec === 'APPROVE'
            ? 'Approved: Requisition meets compliance and capacity requirements.'
            : 'Changes requested: please verify passenger seating capacity or vehicle assignment.'
        };
      }

      await logAi('request-triage', triage);
      return ok(triage);
    },
    'request.review'
  );
}

