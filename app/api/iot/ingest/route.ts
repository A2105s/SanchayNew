import { NextResponse } from 'next/server';
import { ingestTelemetry } from '@/lib/cloud/ops/devices';
import { ingestPayloadSchema, zodMessage } from '@/lib/validation/schemas';
import { DomainError } from '@/lib/cloud/errors';
import { ZodError } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearer(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/u.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Device telemetry ingestion. Authenticated per device via:
 *   X-Device-Code: <device code>
 *   Authorization: Bearer <device ingest key>
 * No cookie session is involved. A device may only write telemetry for its bound vehicle.
 */
export async function POST(request: Request) {
  const deviceCode = request.headers.get('x-device-code') || request.headers.get('X-Device-Code');
  const presentedKey = extractBearer(request);
  if (!deviceCode || !presentedKey) {
    return NextResponse.json({ success: false, error: 'Missing device code or ingest key.' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => {
      throw new DomainError('Request body must be valid JSON.', 400);
    });
    const payload = ingestPayloadSchema.parse(body);
    const result = await ingestTelemetry(deviceCode, presentedKey, payload);
    return NextResponse.json({ success: true, data: result }, { status: 202 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ success: false, error: zodMessage(error) }, { status: 400 });
    }
    if (error instanceof DomainError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error('[iot/ingest]', error);
    return NextResponse.json({ success: false, error: 'Telemetry could not be ingested.' }, { status: 500 });
  }
}
