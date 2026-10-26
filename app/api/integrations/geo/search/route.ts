import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { fail, handleRouteError } from '@/lib/cloud/http';
import { searchPlaces } from '@/lib/integrations/mapbox/client';
import { GEO_ATTRIBUTION, type GeoSearchResult } from '@/lib/integrations/mapbox/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/geo/search?q=…&proximity=lng,lat&limit=5
 *
 * Session-authenticated address typeahead used by BOTH the vehicles module (trip locations,
 * last known position, incident locations) and the spaces module (asset addresses).
 * It reads no Sanchay data, so it needs a session but no domain permission.
 *
 * The Mapbox token stays server-side; the browser only ever sees normalised places.
 */
export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') ?? '';
    const rawLimit = Number(searchParams.get('limit') ?? '5');
    const proximity = parseProximity(searchParams.get('proximity'));

    const result = await searchPlaces(query, {
      proximity,
      limit: Number.isFinite(rawLimit) ? rawLimit : 5
    });

    if (result.status === 'ok' || result.status === 'not_configured' || result.status === 'invalid_request') {
      const data: GeoSearchResult & { attribution: string } = { ...result, attribution: GEO_ATTRIBUTION };
      return NextResponse.json({ success: true, data });
    }

    return failureFor(result.status);
  } catch (error) {
    return handleRouteError('integrations/geo/search', error);
  }
}

/** Parses "lng,lat" - Mapbox's coordinate order - into a proximity bias. */
function parseProximity(raw: string | null): { lat: number; lng: number } | undefined {
  if (!raw) return undefined;
  const [lngRaw, latRaw] = raw.split(',');
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

function failureFor(status: 'unauthorized' | 'rate_limited' | 'provider_error' | 'timeout') {
  switch (status) {
    case 'unauthorized':
      // A rejected/expired token is a server configuration problem, not the operator's fault.
      return fail('Address search is unavailable: the map service rejected the configured token.', 502);
    case 'rate_limited':
      return fail('Address search is temporarily busy. Please try again in a moment.', 429);
    case 'timeout':
    case 'provider_error':
    default:
      return fail('Address search is unavailable right now. You can still type the address manually.', 503);
  }
}
