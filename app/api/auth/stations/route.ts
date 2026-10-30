import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/stations
 *
 * Public, read-only: the police-station login directory for the login page's
 * "Sign in as police station" picker. Exposes all active police stations from
 * the database so operators can choose any station to sign into.
 */
export async function GET() {
  try {
    const stations = await prisma.station.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        operators: {
          where: { role: 'STATION_OFFICER', active: true },
          select: { username: true },
          take: 1
        }
      },
      orderBy: { name: 'asc' }
    });

    const data = stations.map((s) => {
      const assignedUsername = s.operators[0]?.username;
      const slug = s.code.replace(/-police-station$/i, '').toLowerCase();
      const username = assignedUsername ?? `station.${slug}`;
      return {
        username,
        station: s.name
      };
    });

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[auth/stations]', error);
    return NextResponse.json({ success: false, error: 'Could not load the station directory.' }, { status: 500 });
  }
}
