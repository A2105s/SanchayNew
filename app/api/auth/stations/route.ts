import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/stations
 *
 * Public, read-only: the police-station login directory for the login page's
 * "Sign in as police station" picker. Exposes only station names and their
 * operator usernames — no emails, phones or hashes. Actual authentication is
 * still username + password with the brute-force throttle applied.
 */
export async function GET() {
  try {
    const officers = await prisma.operator.findMany({
      where: { role: 'STATION_OFFICER', active: true, station: { isNot: null } },
      select: { username: true, displayName: true, station: { select: { name: true, code: true } } },
      orderBy: { username: 'asc' }
    });
    return NextResponse.json({
      success: true,
      data: officers.map((o) => ({ username: o.username, station: o.station?.name ?? o.displayName }))
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load the station directory.' }, { status: 500 });
  }
}
