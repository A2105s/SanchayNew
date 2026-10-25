import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/cloud/context';
import { getFleetSnapshot } from '@/lib/cloud/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;

  try {
    const data = await getFleetSnapshot(auth.user);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[cloud/snapshot]', error);
    return NextResponse.json({ success: false, error: 'Cloud data is not available.' }, { status: 503 });
  }
}
