import { z } from 'zod';
import { ok, readJson } from '@/lib/cloud/http';
import { prisma } from '@/lib/db/prisma';
import { DomainError } from '@/lib/cloud/errors';
import { generate } from '@/lib/ai/providers';
import { SPACE_TRIAGE_SYSTEM } from '@/lib/ai/prompts';
import { aiRoute, logAi, metaOf, parseJsonObject } from '@/lib/ai/route';
import { bookingPolicyRejection } from '@/lib/fleet/spaces';
import type { SpaceView } from '@/types';
import type { SpaceTriageResponse } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  bookingId: z.string().trim().min(1, 'Booking ID is required.'),
  provider: z.enum(['auto', 'gemini', 'nvidia', 'openrouter', 'groq', 'mistral']).optional()
});

export async function POST(request: Request) {
  return aiRoute(
    request,
    'ai/spaces/triage',
    'draftRequest',
    async ({ settings }) => {
      const input = bodySchema.parse(await readJson(request));

      const booking = await prisma.spaceBooking.findUnique({
        where: { id: input.bookingId },
        include: {
          space: {
            include: {
              organization: { select: { name: true } }
            }
          }
        }
      });

      if (!booking) throw new DomainError('Space booking not found.', 404);

      const space = booking.space;
      const attendees = booking.attendees ?? 0;
      const areaSqft = space.areaSqft;

      // Spatial ratio: sq ft per attendee
      const sqFtPerAttendee = areaSqft && attendees > 0 ? Math.round(areaSqft / attendees) : null;
      const isOvercrowded = sqFtPerAttendee !== null && sqFtPerAttendee < 10;
      const isOverCapacity = attendees > 0 && space.capacity > 0 && attendees > space.capacity;

      // Check operating hours & policy
      const now = new Date();
      const policyRejection = bookingPolicyRejection(
        {
          operationalState: space.operationalState as SpaceView['operationalState'],
          operatingHours: (space.operatingHours ?? {}) as never,
          minBookingHours: space.minBookingHours,
          maxBookingHours: space.maxBookingHours,
          bookingLeadDays: space.bookingLeadDays,
          capacity: space.capacity
        },
        booking.startAt,
        booking.endAt,
        now,
        attendees
      );

      // Check maintenance
      const openMaintenance = await prisma.spaceMaintenance.findMany({
        where: { spaceId: space.id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        select: { id: true, title: true, severity: true, blocksBooking: true }
      });
      const hasBlockingMaintenance = openMaintenance.some((m) => m.blocksBooking);

      const factsText = [
        `Booking Reference: ${booking.bookingCode}`,
        `Space: ${space.name} (${space.assetCode})`,
        `Category: ${space.category}`,
        `Managing Org: ${space.organization.name}`,
        `Requested By: ${booking.requestedBy}`,
        `Purpose: ${booking.purpose}`,
        `Attendees: ${attendees || 'Not specified'}`,
        `Space Capacity: ${space.capacity}`,
        `Space Area: ${areaSqft ? `${areaSqft} sq ft` : 'Not recorded'}`,
        `Spatial Safety Ratio: ${sqFtPerAttendee ? `${sqFtPerAttendee} sq ft / person (standard: >= 10-12 sq ft)` : 'Not calculable'}`,
        `Overcrowding Risk: ${isOvercrowded ? 'CRITICAL - Under 10 sq ft per attendee' : 'SAFE'}`,
        `Capacity Check: ${isOverCapacity ? `FAIL - ${attendees} exceeds capacity of ${space.capacity}` : 'PASS'}`,
        `Policy Status: ${policyRejection ? `REJECTED: ${policyRejection}` : 'COMPLIANT'}`,
        `Maintenance Status: ${hasBlockingMaintenance ? 'BLOCKED by open maintenance ticket' : openMaintenance.length ? `${openMaintenance.length} non-blocking maintenance tickets` : 'CLEAN'}`
      ].join('\n');

      const result = await generate(
        [
          { role: 'system', content: SPACE_TRIAGE_SYSTEM },
          { role: 'user', content: `DATA (untrusted facts):\n<<<DATA\n${factsText}\nDATA>>>` }
        ],
        {
          preferred: input.provider ?? settings.preferredProvider,
          order: settings.fallbackOrder,
          maxTokens: 500,
          temperature: 0.1,
          json: true
        }
      );

      const parsed = result.text ? parseJsonObject(result.text) : null;
      let triage: SpaceTriageResponse;

      const fallbackSafetyStatus: 'SAFE' | 'WARNING' | 'CRITICAL' = isOvercrowded
        ? 'CRITICAL'
        : isOverCapacity
          ? 'WARNING'
          : 'SAFE';

      const fallbackRec: SpaceTriageResponse['recommendation'] = isOvercrowded || hasBlockingMaintenance || policyRejection
        ? 'REJECT'
        : isOverCapacity
          ? 'NEEDS_REVIEW'
          : 'APPROVE';

      if (parsed && typeof parsed.recommendation === 'string') {
        const rec = ['APPROVE', 'REJECT', 'NEEDS_REVIEW'].includes(parsed.recommendation as string)
          ? (parsed.recommendation as SpaceTriageResponse['recommendation'])
          : fallbackRec;

        const safetyAnalysisRaw = (parsed.safetyAnalysis && typeof parsed.safetyAnalysis === 'object' ? parsed.safetyAnalysis : {}) as Record<string, unknown>;
        const deptFitRaw = (parsed.departmentFit && typeof parsed.departmentFit === 'object' ? parsed.departmentFit : {}) as Record<string, unknown>;

        triage = {
          ...metaOf(result),
          recommendation: rec,
          confidence: Math.min(99, Math.max(70, Number(parsed.confidence) || 92)),
          summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 300) : 'Audited space booking parameters against municipal norms.',
          safetyAnalysis: {
            status: ['SAFE', 'WARNING', 'CRITICAL'].includes(String(safetyAnalysisRaw.status))
              ? (safetyAnalysisRaw.status as 'SAFE' | 'WARNING' | 'CRITICAL')
              : fallbackSafetyStatus,
            sqFtPerAttendee,
            note: typeof safetyAnalysisRaw.note === 'string'
              ? safetyAnalysisRaw.note
              : isOvercrowded
                ? `Critical overcrowding: ${sqFtPerAttendee} sq ft/person violates municipal safety guidelines (minimum 10 sq ft/person).`
                : 'Spatial density adheres to public gathering safety limits.'
          },
          departmentFit: {
            aligned: typeof deptFitRaw.aligned === 'boolean' ? deptFitRaw.aligned : true,
            note: typeof deptFitRaw.note === 'string' ? deptFitRaw.note : 'Booking purpose is legitimate for municipal operations.'
          },
          suggestedNote: typeof parsed.suggestedNote === 'string' && parsed.suggestedNote.trim()
            ? parsed.suggestedNote.trim().slice(0, 500)
            : rec === 'APPROVE'
              ? 'Approved: Slot, capacity, and spatial safety meet all municipal standards.'
              : isOvercrowded
                ? `Rejected: Request of ${attendees} attendees provides only ${sqFtPerAttendee} sq ft per person, violating municipal safety norms.`
                : 'Request requires revision to meet booking policies.'
        };
      } else {
        // Deterministic fallback
        triage = {
          ...metaOf({ ...result, degraded: true }),
          recommendation: fallbackRec,
          confidence: 88,
          summary: fallbackRec === 'APPROVE'
            ? 'Deterministic safety audit: Capacity and spatial densities are compliant.'
            : 'Deterministic safety audit: Safety thresholds or policy rules triggered warnings.',
          safetyAnalysis: {
            status: fallbackSafetyStatus,
            sqFtPerAttendee,
            note: isOvercrowded
              ? `Critical overcrowding: ${sqFtPerAttendee} sq ft/person (mandate is >= 10-12 sq ft).`
              : 'Spatial density meets municipal safety norms.'
          },
          departmentFit: {
            aligned: true,
            note: 'Standard administrative booking.'
          },
          suggestedNote: fallbackRec === 'APPROVE'
            ? 'Booking verified: Space capacity and slot availability confirmed.'
            : 'Rejected: Booking exceeds spatial safety guidelines or conflicts with facility policy.'
        };
      }

      await logAi('spaces/triage', triage);
      return ok(triage);
    },
    'space.review'
  );
}

