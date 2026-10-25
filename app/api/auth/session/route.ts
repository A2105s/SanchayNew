import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ success: true, data: auth.user });
}
