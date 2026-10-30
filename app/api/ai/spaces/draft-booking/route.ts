import { z } from 'zod';
import { ok, readJson } from '@/lib/cloud/http';
import { DomainError } from '@/lib/cloud/errors';
import { generate } from '@/lib/ai/providers';
import { DRAFT_SPACE_SYSTEM } from '@/lib/ai/prompts';
import { aiRoute, logAi, metaOf, parseJsonObject } from '@/lib/ai/route';
import { searchSpaces } from '@/lib/cloud/ops/spaces';
import { bookingPolicyRejection } from '@/lib/fleet/spaces';
import type { SpaceView } from '@/types';
import type { DraftSpaceBookingFields, DraftSpaceBookingResponse, DraftSpaceCandidate } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  text: z.string().trim().min(8, 'Describe the facility and window you need.').max(800),
  provider: z.enum(['auto', 'gemini', 'nvidia', 'openrouter', 'groq', 'mistral']).optional()
});

const CATEGORIES = ['MEETING_ROOM', 'TRAINING_HALL', 'AUDITORIUM', 'OFFICE', 'COMMUNITY_HALL', 'STORE', 'OTHER'] as const;

const iso = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

export async function POST(request: Request) {
  return aiRoute(
    request,
    'ai/spaces/draft-booking',
    'draftRequest',
    async ({ user, settings }) => {
      const input = bodySchema.parse(await readJson(request));
      const now = new Date();

      const result = await generate(
        [
          { role: 'system', content: DRAFT_SPACE_SYSTEM },
          {
            role: 'user',
            content: `DATA:\nCurrent time (Asia/Kolkata): ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })} (ISO ${now.toISOString()}).\n\nUser sentence (untrusted):\n<<<TEXT\n${input.text}\nTEXT>>>`
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

      const parsed = result.text ? parseJsonObject(result.text) : null;
      if (!parsed) {
        await logAi('spaces/draft-booking', { ...result, degraded: true });
        throw new DomainError('The AI assistant could not parse your request right now. You can browse and select a space manually.', 503, 'AI_UNAVAILABLE');
      }

      const warnings: string[] = [];
      const category = CATEGORIES.includes(parsed.category as (typeof CATEGORIES)[number])
        ? (parsed.category as (typeof CATEGORIES)[number])
        : 'MEETING_ROOM';

      let startAt = iso(parsed.startAt);
      let endAt = iso(parsed.endAt);

      if (!startAt || !endAt) {
        warnings.push('Start or end time could not be resolved cleanly from your input. Please verify dates.');
      }
      if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) {
        warnings.push('End time must be after start time.');
        startAt = null;
        endAt = null;
      }
      if (startAt && Date.parse(startAt) < Date.now()) {
        warnings.push('The requested slot is in the past.');
      }

      const attendees = Math.min(2000, Math.max(1, Math.round(Number(parsed.attendees) || Number(parsed.minCapacity) || 10)));
      const minCapacity = Math.min(2000, Math.max(1, Math.round(Number(parsed.minCapacity) || attendees)));
      const amenities = Array.isArray(parsed.amenities)
        ? parsed.amenities.filter((a): a is string => typeof a === 'string').slice(0, 8)
        : [];

      const draft: DraftSpaceBookingFields = {
        category,
        minCapacity,
        purpose: typeof parsed.purpose === 'string' ? parsed.purpose.trim().slice(0, 200) : input.text.slice(0, 200),
        attendees,
        startAt,
        endAt,
        amenities,
        district: typeof parsed.district === 'string' ? parsed.district.trim().slice(0, 80) : null
      };

      let candidates: DraftSpaceCandidate[] = [];
      if (startAt && endAt) {
        try {
          const found = await searchSpaces(user, {
            category,
            minCapacity,
            from: startAt,
            to: endAt,
            availableOnly: true
          });

          const startDate = new Date(startAt);
          const endDate = new Date(endAt);

          candidates = found.spaces
            .filter((space) => {
              const rejection = bookingPolicyRejection(
                {
                  operationalState: space.operationalState as SpaceView['operationalState'],
                  operatingHours: space.operatingHours,
                  minBookingHours: space.minBookingHours,
                  maxBookingHours: space.maxBookingHours,
                  bookingLeadDays: space.bookingLeadDays,
                  capacity: space.capacity
                },
                startDate,
                endDate,
                now,
                attendees
              );
              return rejection === null;
            })
            .slice(0, 5)
            .map((space) => {
              // Calculate compatibility score (closer capacity to attendees + matched amenities)
              let score = 100;
              const capDiff = space.capacity - attendees;
              if (capDiff < 0) score -= 30;
              else if (capDiff > 100) score -= 15;

              const matchedAmenities = amenities.filter((req) =>
                space.amenities.some((have) => have.toLowerCase().includes(req.toLowerCase()))
              );
              score += matchedAmenities.length * 10;

              return {
                spaceId: space.id,
                assetCode: space.assetCode,
                name: space.name,
                buildingOrCampus: space.buildingOrCampus ?? null,
                district: space.district ?? null,
                category: space.category,
                capacity: space.capacity,
                areaSqft: space.areaSqft ?? null,
                score: Math.min(100, Math.max(50, score)),
                reason: `Available for requested window (${space.capacity} seats, ${space.areaSqft ? `${space.areaSqft} sq ft` : 'standard hall'})`
              };
            })
            .sort((a, b) => b.score - a.score);
        } catch {
          warnings.push('Live slot availability check encountered a transient error.');
        }

        if (candidates.length === 0) {
          warnings.push('No available space matched all criteria for this exact time. Broadening filters or shifting times may help.');
        }
      }

      const response: DraftSpaceBookingResponse = {
        ...metaOf(result),
        draft,
        candidates,
        warnings
      };

      await logAi('spaces/draft-booking', response);
      return ok(response);
    },
    'space.book'
  );
}

