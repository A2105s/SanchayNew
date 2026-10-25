import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/cloud/context';
import { prisma } from '@/lib/db/prisma';
import { getAllocationView } from '@/lib/cloud/ops/allocations';
import { orgTree } from '@/lib/auth/scope';
import { DEFAULT_FLEET_SETTINGS, FLEET_SETTINGS_KEY, mergeFleetSettings } from '@/lib/cloud/errors';
import { handleRouteError, ok } from '@/lib/cloud/http';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;
  try {
    const sp = request.nextUrl.searchParams;
    const lifecycle = sp.get('lifecycle');
    const overdue = sp.get('overdue') === 'true';
    const tree = await orgTree(auth.user);

    const and: Prisma.AllocationWhereInput[] = [];
    if (tree !== null) {
      and.push({ OR: [{ vehicle: { organizationId: { in: tree } } }, { request: { requestingOrgId: { in: tree } } }] });
    }
    if (lifecycle) and.push({ lifecycle });
    if (overdue) {
      const row = await prisma.appSetting.findUnique({ where: { key: FLEET_SETTINGS_KEY } });
      const settings = row ? mergeFleetSettings(row.value) : DEFAULT_FLEET_SETTINGS;
      const cutoff = new Date(Date.now() - settings.returnGraceMinutes * 60000);
      and.push({ lifecycle: 'ACTIVE', endAt: { lt: cutoff } });
    }

    const rows = await prisma.allocation.findMany({ where: and.length ? { AND: and } : {}, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true } });
    const views = await Promise.all(rows.map((r) => getAllocationView(auth.user, r.id)));
    return ok(views);
  } catch (error) {
    return handleRouteError('cloud/allocations:get', error);
  }
}
