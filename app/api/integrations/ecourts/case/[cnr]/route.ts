import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/cloud/context';
import { writeAudit } from '@/lib/cloud/audit';
import { fail, handleRouteError } from '@/lib/cloud/http';
import { prisma } from '@/lib/db/prisma';
import type { Permission } from '@/lib/auth/roles';
import { getCaseByCnr } from '@/lib/integrations/ecourts/client';
import { normaliseCnr } from '@/lib/integrations/ecourts/cnr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/ecourts/case/{cnr}[?refresh=1]
 *
 * Vehicles-module only: attaches court-case evidence to a vehicle review. Every call is audited
 * (it exposes party names and case history), and the response is served from the local cache
 * unless the caller is an authorised verifier explicitly asking for fresh data.
 *
 * Deliberately absent: any lookup by registration number. eCourts has no such index, and a
 * name or plate match is never treated as proof of ownership, seizure or eligibility.
 */
export async function GET(request: Request, ctx: { params: Promise<{ cnr: string }> }) {
  const { cnr: rawCnr } = await ctx.params;
  const refresh = new URL(request.url).searchParams.get('refresh') === '1';

  // A refresh re-bills the provider, so it needs the evidence-verification capability.
  const required: Permission = refresh ? 'eligibility.verify' : 'fleet.read';
  const auth = await requirePermission(request, required, { entityType: 'ExternalLookup', entityId: rawCnr });
  if (!auth.ok) return auth.response;

  try {
    const cnr = normaliseCnr(rawCnr);
    if (!cnr) {
      return fail('Enter a valid 16-character CNR, e.g. DLHC010001232024.', 400);
    }

    const result = await getCaseByCnr(cnr, { refresh });

    if (result.status === 'not_configured') {
      // Not an error: the vehicles module keeps working, the card just says "not configured".
      return NextResponse.json({
        success: true,
        data: {
          configured: false,
          cnr,
          case: null,
          message: 'Court-case verification is not configured on this server.'
        }
      });
    }

    switch (result.status) {
      case 'invalid_request':
        return fail('Enter a valid 16-character CNR, e.g. DLHC010001232024.', 400);
      case 'not_found':
        await auditLookup(auth.user, auth.correlationId, cnr, 'NotFound', result.cached);
        return fail('No eCourts record was found for that CNR.', 404);
      case 'unauthorized':
        return fail('Court-case verification is unavailable: the eCourts credential was rejected.', 502);
      case 'rate_limited':
        return fail('Court-case verification is temporarily rate-limited. Try again shortly.', 429);
      case 'timeout':
      case 'provider_error':
        return fail('eCourts is unavailable right now. This is not a negative result — try again later.', 503);
      default:
        break;
    }

    await auditLookup(auth.user, auth.correlationId, cnr, refresh ? 'Refreshed' : 'Lookup', result.cached);

    return NextResponse.json({
      success: true,
      data: {
        configured: true,
        cnr,
        case: result.case,
        cached: result.cached,
        fetchedAt: result.fetchedAt,
        /** Reminder for the UI: this is evidence for a human decision, not an eligibility verdict. */
        interpretation:
          'Court data is supporting evidence. It does not by itself establish ownership, seizure or eligibility.'
      }
    });
  } catch (error) {
    return handleRouteError('integrations/ecourts/case', error);
  }
}

async function auditLookup(
  user: { username: string; role: string; organizationId: string | null },
  correlationId: string,
  cnr: string,
  action: 'Lookup' | 'Refreshed' | 'NotFound',
  cached: boolean
): Promise<void> {
  try {
    await writeAudit(prisma, {
      entityType: 'ExternalLookup',
      entityId: cnr,
      action: `Ecourts${action}`,
      fieldName: 'cache',
      newValue: cached ? 'hit' : 'miss',
      performedBy: user.username,
      performedByRole: user.role,
      organizationId: user.organizationId,
      correlationId
    });
  } catch (error) {
    // Audit failures must never break a read-only lookup; log without any case content.
    console.error('[ecourts:audit]', error instanceof Error ? error.message : 'unknown');
  }
}
