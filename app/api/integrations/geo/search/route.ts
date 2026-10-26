import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { fail, handleRouteError } from '@/lib/cloud/http';
import { searchPlaces as searchPlacesMapbox, isMapboxConfigured } from '@/lib/integrations/mapbox/client';
import { searchPlacesNominatim, NOMINATIM_ATTRIBUTION } from '@/lib/integrations/nominatim/client';
import { GEO_ATTRIBUTION, type GeoSearchResult } from '@/lib/integrations/mapbox/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/geo/search?q=…&proximity=lng,lat&limit=5&provider=nominatim
 *
 * Session-authenticated address typeahead used by BOTH the vehicles module (trip locations,
 * last known position, incident locations) and the spaces module (asset addresses).
 * Supports both Nominatim (OpenStreetMap) and Mapbox.
 */
export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') ?? '';
    const rawLimit = Number(searchParams.get('limit') ?? '5');
    const proximity = parseProximity(searchParams.get('proximity'));
    const preferredProvider = searchParams.get('provider');
    const limit = Number.isFinite(rawLimit) ? rawLimit : 5;

    let result: GeoSearchResult;
    let attribution = GEO_ATTRIBUTION;

    if (preferredProvider === 'nominatim' || !isMapboxConfigured()) {
      result = await searchPlacesNominatim(query, { proximity, limit });
      attribution = NOMINATIM_ATTRIBUTION;
    } else {
      result = await searchPlacesMapbox(query, { proximity, limit });
      attribution = GEO_ATTRIBUTION;
      if (result.status === 'unauthorized' || result.status === 'provider_error') {
        result = await searchPlacesNominatim(query, { proximity, limit });
        attribution = NOMINATIM_ATTRIBUTION;
      }
    }

    if (result.status === 'ok' || result.status === 'not_configured' || result.status === 'invalid_request') {
      const data: GeoSearchResult & { attribution: string } = { ...result, attribution };
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
