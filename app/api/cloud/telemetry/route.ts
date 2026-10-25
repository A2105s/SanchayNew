import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/cloud/context';
import { getLiveDeltas } from '@/lib/cloud/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission(request, 'fleet.read');
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json({ success: true, data: await getLiveDeltas(auth.user) });
  } catch (error) {
    console.error('[cloud/telemetry]', error);
    return NextResponse.json({ success: false, error: 'Live telemetry is not available.' }, { status: 503 });
  }
}
