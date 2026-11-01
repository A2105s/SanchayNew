import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/cloud/context';
import { prisma } from '@/lib/db/prisma';
import { createRequest, buildRequestView } from '@/lib/cloud/ops/requests';
import { requestInputSchema } from '@/lib/validation/schemas';
import { orgTree } from '@/lib/auth/scope';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';
import { DomainError } from '@/lib/cloud/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;
  try {
    const sp = request.nextUrl.searchParams;
    const stateFilter = sp.get('state');
    const mine = sp.get('mine') === 'true';
    const needsMyDecision = sp.get('needsMyDecision') === 'true';
    const requestingStationId = sp.get('requestingStationId');
    const providerStationId = sp.get('providerStationId');
    const requestedClass = sp.get('requestedClass');
    const tree = await orgTree(auth.user);

    const and: Record<string, unknown>[] = [];

    if (auth.user.role === 'STATION_OFFICER' && auth.user.stationId) {
      if (needsMyDecision) {
        and.push({
          providerStationId: auth.user.stationId,
          state: { in: ['SUBMITTED', 'UNDER_REVIEW', 'PENDING_APPROVAL'] }
        });
      } else if (mine) {
        and.push({
          OR: [
            { requestingStationId: auth.user.stationId },
            { requesterUsername: auth.user.username }
          ]
        });
      } else {
        and.push({
          OR: [
            { requestingStationId: auth.user.stationId },
            { providerStationId: auth.user.stationId }
          ]
        });
      }
    } else {
      if (tree !== null) {
        const or: Record<string, unknown>[] = [{ requestingOrgId: { in: tree } }, { approverOrgId: { in: tree } }];
        and.push({ OR: or });
      }
      if (mine) and.push({ requesterUsername: auth.user.username });
      if (needsMyDecision) {
        and.push({ state: { in: ['SUBMITTED', 'UNDER_REVIEW', 'PENDING_APPROVAL'] } });
      }
    }

    if (stateFilter) and.push({ state: stateFilter });
    if (requestingStationId) and.push({ requestingStationId });
    if (providerStationId) and.push({ providerStationId });
    if (requestedClass) and.push({ requestedClass });

    const rows = await prisma.assetRequest.findMany({ where: and.length ? { AND: and } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
    const views = await Promise.all(rows.map((r) => buildRequestView(r.id, auth.user)));
    return ok(views);
  } catch (error) {
    return handleRouteError('cloud/requests:get', error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'request.create', { entityType: 'Request', entityId: 'new' });
  if (!auth.ok) return auth.response;
  try {
    const body = await readJson(request);
    const input = requestInputSchema.parse(body);
    if (!input.accountablePhone || input.accountablePhone.trim().length < 10) {
      throw new DomainError('Accountable officer phone number is required and must have at least 10 digits.', 400);
    }
    const idempotencyKey = request.headers.get('Idempotency-Key');
    const view = await createRequest(auth.user, input, idempotencyKey, auth.correlationId);
    return ok(view);
  } catch (error) {
    return handleRouteError('cloud/requests:post', error);
  }
}
