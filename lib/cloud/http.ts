import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { DomainError } from '@/lib/cloud/errors';
import { zodMessage } from '@/lib/validation/schemas';

/** Standard success envelope. */
export function ok<T>(data: T, operationId?: string): NextResponse {
  return NextResponse.json(operationId ? { success: true, data, operationId } : { success: true, data });
}

/** Standard failure envelope at an explicit status. */
export function fail(error: string, status = 400): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Maps thrown errors to the standard envelope:
 *  - ZodError          -> 400 with the first issue path/message
 *  - DomainError       -> its carried status
 *  - everything else   -> 500 with a generic message (details logged server-side)
 */
export function handleRouteError(scope: string, error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return fail(zodMessage(error), 400);
  }
  if (error instanceof DomainError) {
    return fail(error.message, error.status);
  }
  console.error(`[${scope}]`, error);
  return fail('An unexpected error occurred. Please try again.', 500);
}

/** Safely parse a JSON body; throws a DomainError(400) on malformed input. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DomainError('Request body must be valid JSON.', 400);
  }
}
