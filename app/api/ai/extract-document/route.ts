import { NextResponse } from 'next/server';
import { ok } from '@/lib/cloud/http';
import { DomainError } from '@/lib/cloud/errors';
import { generate } from '@/lib/ai/providers';
import { EXTRACT_SYSTEM } from '@/lib/ai/prompts';
import { aiRoute, logAi, metaOf, parseJsonObject } from '@/lib/ai/route';
import type { ExtractKind, ExtractResponse, ExtractedFields } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const KINDS: ExtractKind[] = ['RC', 'INSURANCE', 'PUC', 'FITNESS'];

const str = (v: unknown, max = 80): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const int = (v: unknown, lo: number, hi: number): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/**
 * Reads a photo of a vehicle document and returns SUGGESTED field values for the registration form.
 * It stores nothing and changes nothing on any vehicle; a person must review and submit the form.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return aiRoute(
    request,
    'ai/extract-document',
    'extractDocument',
    async ({ settings }) => {
      const form = await request.formData();
      const file = form.get('file');
      const kindRaw = String(form.get('kind') ?? 'RC').toUpperCase() as ExtractKind;
      if (!(file instanceof File)) throw new DomainError('Choose an image of the document.', 400);
      if (!KINDS.includes(kindRaw)) throw new DomainError('Unknown document type.', 400);
      if (!MIME.has(file.type)) throw new DomainError('Only JPEG, PNG or WebP images are supported.', 415);
      if (file.size > MAX_BYTES) throw new DomainError('The image is larger than 8 MB.', 413);

      const bytes = Buffer.from(await file.arrayBuffer());
      const result = await generate(
        [
          { role: 'system', content: EXTRACT_SYSTEM },
          { role: 'user', content: `Document type: ${kindRaw}. Read this image and return the JSON.`, images: [{ mimeType: file.type, base64: bytes.toString('base64') }] }
        ],
        { preferred: settings.preferredProvider, order: settings.fallbackOrder, needVision: true, maxTokens: 700, temperature: 0, json: true, timeoutMs: 40_000 }
      );
      const parsed = result.text ? parseJsonObject(result.text) : null;
      const f = (parsed?.fields ?? null) as Record<string, unknown> | null;
      if (!parsed || !f) {
        await logAi('extract-document', { ...result, degraded: true });
        throw new DomainError('The AI engines could not read this document right now. Please enter the details by hand.', 503, 'AI_UNAVAILABLE');
      }
      const fields: ExtractedFields = {
        registrationNumber: str(f.registrationNumber, 20)?.toUpperCase() ?? null,
        chassisNumber: str(f.chassisNumber, 30)?.toUpperCase() ?? null,
        engineNumber: str(f.engineNumber, 30)?.toUpperCase() ?? null,
        makeModel: str(f.makeModel, 80),
        year: int(f.year, 1980, new Date().getFullYear() + 1),
        fuelType: str(f.fuelType, 30),
        color: str(f.color, 30),
        seating: int(f.seating, 1, 80),
        expiryDate: typeof f.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.expiryDate) ? f.expiryDate : null,
        ownerName: str(f.ownerName, 100)
      };
      const confidence: ExtractResponse['confidence'] = {};
      const rawConf = (parsed.confidence ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(fields) as (keyof ExtractedFields)[]) {
        const c = rawConf[key];
        if (c === 'high' || c === 'medium' || c === 'low') confidence[key] = c;
      }
      const out: ExtractResponse = { ...metaOf(result), kind: kindRaw, fields, confidence, notes: str(parsed.notes, 300) ?? '' };
      await logAi('extract-document', out);
      return ok(out);
    },
    'vehicle.register'
  );
}
