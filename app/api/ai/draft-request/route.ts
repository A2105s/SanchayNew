import { z } from 'zod';
import { ok, readJson } from '@/lib/cloud/http';
import { DomainError } from '@/lib/cloud/errors';
import { generate } from '@/lib/ai/providers';
import { DRAFT_SYSTEM } from '@/lib/ai/prompts';
import { aiRoute, logAi, metaOf, parseJsonObject } from '@/lib/ai/route';
import { searchVehicles } from '@/lib/cloud/ops/search';
import { vehicleSearchSchema } from '@/lib/validation/schemas';
import type { VehicleCardView, VehicleView } from '@/types';
import type { DraftCandidate, DraftRequestFields, DraftRequestResponse } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const body = z.object({
  text: z.string().trim().min(8, 'Describe what you need.').max(800),
  provider: z.enum(['auto', 'gemini', 'nvidia', 'openrouter', 'groq', 'mistral']).optional()
});

const CLASSES = ['PATROL_CAR', 'MOTORCYCLE', 'VAN', 'HEAVY'] as const;
const iso = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/**
 * Drafts only. Never submits and never approves. Candidates are the user's normal scoped search results
 * (eligible government-fleet vehicles only), not something the model chose.
 */
export async function POST(request: Request) {
  return aiRoute(
    request,
    'ai/draft-request',
    'draftRequest',
    async ({ user, settings }) => {
      const input = body.parse(await readJson(request));
      const now = new Date();
      const result = await generate(
        [
          { role: 'system', content: DRAFT_SYSTEM },
          { role: 'user', content: `DATA:\nCurrent time (Asia/Kolkata): ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })} (ISO ${now.toISOString()}).\n\nUser sentence (untrusted):\n<<<TEXT\n${input.text}\nTEXT>>>` }
        ],
        { preferred: input.provider ?? settings.preferredProvider, order: settings.fallbackOrder, maxTokens: 500, temperature: 0.1, json: true }
      );
      const parsed = result.text ? parseJsonObject(result.text) : null;
      if (!parsed) {
        await logAi('draft-request', { ...result, degraded: true });
        throw new DomainError('The AI engines could not understand that right now. You can still fill the request form by hand.', 503, 'AI_UNAVAILABLE');
      }

      const warnings: string[] = [];
      const cls = CLASSES.includes(parsed.requestedClass as (typeof CLASSES)[number]) ? (parsed.requestedClass as DraftRequestFields['requestedClass']) : 'VAN';
      if (!CLASSES.includes(parsed.requestedClass as (typeof CLASSES)[number])) warnings.push('Vehicle class was not clear, so Van was assumed. Please check it.');
      let startAt = iso(parsed.startAt);
      let endAt = iso(parsed.endAt);
      if (!startAt || !endAt) warnings.push('Start and end time were not clear. Choose them before checking availability.');
      if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) {
        warnings.push('The end time was not after the start time, so both were cleared.');
        startAt = null;
        endAt = null;
      }
      if (startAt && Date.parse(startAt) < Date.now()) warnings.push('The start time is in the past.');
      const passengers = Math.min(60, Math.max(1, Math.round(Number(parsed.passengers) || 1)));
      const draft: DraftRequestFields = {
        requestedClass: cls,
        purpose: typeof parsed.purpose === 'string' ? parsed.purpose.trim().slice(0, 200) : input.text.slice(0, 200),
        destination: typeof parsed.destination === 'string' && parsed.destination.trim() ? parsed.destination.trim().slice(0, 160) : null,
        passengers,
        startAt,
        endAt,
        accountableOfficer: typeof parsed.accountableOfficer === 'string' && parsed.accountableOfficer.trim() ? parsed.accountableOfficer.trim().slice(0, 120) : null
      };

      let candidates: DraftCandidate[] = [];
      if (startAt && endAt) {
        try {
          const found = await searchVehicles(
            user,
            vehicleSearchSchema.parse({ scope: 'discover', vehicleClass: cls, from: startAt, to: endAt, availableOnly: 'true', pageSize: '5' })
          );
          candidates = (found.items as (VehicleView | VehicleCardView)[]).slice(0, 5).map((v) => {
            const card = v as VehicleCardView;
            return {
              vehicleId: v.id,
              assetCode: v.assetCode,
              label: `${card.registrationMasked ?? (v as VehicleView).registrationNumber} - ${v.displayName}`,
              organizationName: v.organizationName,
              reason: card.availability ? `${card.availability.state.toLowerCase()} for the requested window` : 'eligible'
            };
          });
        } catch {
          warnings.push('Availability could not be checked right now.');
        }
        if (candidates.length === 0) warnings.push('No eligible vehicle of that class is available for the window. Try a different time or class.');
      }

      const out: DraftRequestResponse = { ...metaOf(result), draft, candidates, warnings };
      await logAi('draft-request', out);
      return ok(out);
    },
    'request.create'
  );
}
