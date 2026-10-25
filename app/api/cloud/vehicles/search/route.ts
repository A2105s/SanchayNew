import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/cloud/context';
import { searchVehicles } from '@/lib/cloud/ops/search';
import { vehicleSearchSchema } from '@/lib/validation/schemas';
import { handleRouteError, ok } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const raw: Record<string, string> = {};
    for (const [key, value] of sp.entries()) raw[key] = value;
    const params = vehicleSearchSchema.parse(raw);
    const result = await searchVehicles(auth.user, params);
    return ok(result);
  } catch (error) {
    return handleRouteError('cloud/vehicles/search', error);
  }
}
