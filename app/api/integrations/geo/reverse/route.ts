import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { fail, handleRouteError } from '@/lib/cloud/http';
import { reverseGeocode as reverseGeocodeMapbox, isMapboxConfigured } from '@/lib/integrations/mapbox/client';
import { reverseGeocodeNominatim, NOMINATIM_ATTRIBUTION } from '@/lib/integrations/nominatim/client';
import { GEO_ATTRIBUTION } from '@/lib/integrations/mapbox/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/geo/reverse?lat=…&lng=…&provider=nominatim
 *
 * Turns a captured coordinate into a readable label (incident locations, device check-ins).
 * Supports both Nominatim (OpenStreetMap) with rate-limiting & caching, and Mapbox.
 */
export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    const preferredProvider = searchParams.get('provider');

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return fail('Provide a numeric lat and lng.', 400);
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return fail('Coordinates are out of range.', 400);
    }

    let result;
    let attribution = GEO_ATTRIBUTION;

    if (preferredProvider === 'nominatim' || !isMapboxConfigured()) {
      result = await reverseGeocodeNominatim(lat, lng);
      attribution = NOMINATIM_ATTRIBUTION;
    } else {
      result = await reverseGeocodeMapbox(lat, lng);
      attribution = GEO_ATTRIBUTION;
      if (result.status === 'unauthorized' || result.status === 'provider_error') {
        result = await reverseGeocodeNominatim(lat, lng);
        attribution = NOMINATIM_ATTRIBUTION;
      }
    }

    if (result.status === 'ok' || result.status === 'not_configured' || result.status === 'invalid_request') {
      return NextResponse.json({ success: true, data: { ...result, attribution } });
    }

    switch (result.status) {
      case 'unauthorized':
        return fail('Address lookup is unavailable: the map service rejected the configured token.', 502);
      case 'rate_limited':
        return fail('Address lookup is temporarily busy. Please try again in a moment.', 429);
      default:
        return fail('Address lookup is unavailable right now.', 503);
    }
  } catch (error) {
    return handleRouteError('integrations/geo/reverse', error);
  }
}
