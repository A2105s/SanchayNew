import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { verifyAuditChain } from '@/lib/cloud/audit';
import { mapAudit } from '@/lib/cloud/mappers';
import type { BackendEvent } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mapEvent(ev: BackendEvent) {
  return {
    id: ev.id,
    operationId: ev.operationId,
    level: ev.level,
    category: ev.category,
    action: ev.action,
    status: ev.status,
    recordCount: ev.recordCount ?? undefined,
    message: ev.message,
    details: ev.details ?? undefined,
    createdAt: ev.createdAt.toISOString()
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireSession(request, { permission: 'audit.read' });
  if (!auth.ok) return auth.response;

  try {
    const limit = Math.min(2000, Math.max(10, Number(request.nextUrl.searchParams.get('limit') || '200')));

    const [auditRows, eventRows, verify] = await Promise.all([
      prisma.auditLog.findMany({ orderBy: { seq: 'desc' }, take: limit }),
      prisma.backendEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
      verifyAuditChain(Math.max(limit, 500))
    ]);

    return NextResponse.json({
      success: true,
      data: {
        audit: auditRows.map(mapAudit),
        events: eventRows.map(mapEvent),
        verify
      }
    });
  } catch (error) {
    console.error('[cloud/activity]', error);
    return NextResponse.json({ success: false, error: 'Activity log is not available.' }, { status: 503 });
  }
}
