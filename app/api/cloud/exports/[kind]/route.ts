import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/cloud/context';
import { buildReport, reportToCsv, REPORT_KINDS } from '@/lib/cloud/ops/reports';
import { writeAudit } from '@/lib/cloud/audit';
import { prisma } from '@/lib/db/prisma';
import { DomainError } from '@/lib/cloud/errors';
import type { ReportKind } from '@/types';
import { handleRouteError } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * CSV export: identical scope + masking as the on-screen report, row cap from settings
 * (reportToCsv emits only report.rows which are already capped), formula-injection guard
 * (in reportToCsv), and the export is written to the audit ledger.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const auth = await requirePermission(request, 'export');
  if (!auth.ok) return auth.response;

  try {
    const { kind } = await ctx.params;
    if (!REPORT_KINDS.includes(kind as ReportKind)) throw new DomainError(`Unknown export kind "${kind}".`, 404);

    const sp = request.nextUrl.searchParams;
    const report = await buildReport(auth.user, kind as ReportKind, {
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      organizationId: sp.get('organizationId') ?? undefined,
      vehicleClass: sp.get('vehicleClass') ?? undefined,
      status: sp.get('status') ?? undefined
    });

    const csv = reportToCsv(report);

    await writeAudit(prisma, {
      entityType: 'Export',
      entityId: kind,
      action: 'ExportGenerated',
      newValue: `rows=${report.rows.length};truncated=${report.truncated}`,
      performedBy: auth.user.username,
      performedByRole: auth.user.role,
      organizationId: auth.user.organizationId,
      correlationId: auth.correlationId,
      reason: `Export ${kind}`
    });

    const filename = `sanchay-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return handleRouteError('cloud/exports/[kind]', error);
  }
}
