import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/cloud/context';
import { buildReport } from '@/lib/cloud/ops/reports';
import type { ReportKind } from '@/types';
import { handleRouteError, ok } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const auth = await requirePermission(request, 'report.read');
  if (!auth.ok) return auth.response;
  try {
    const { kind } = await ctx.params;
    const sp = request.nextUrl.searchParams;
    const report = await buildReport(auth.user, kind as ReportKind, {
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      organizationId: sp.get('organizationId') ?? undefined,
      vehicleClass: sp.get('vehicleClass') ?? undefined,
      status: sp.get('status') ?? undefined
    });
    return ok(report);
  } catch (error) {
    return handleRouteError('cloud/reports/[kind]', error);
  }
}
