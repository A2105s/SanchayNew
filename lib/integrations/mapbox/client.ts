import 'server-only';

import { GEO_ATTRIBUTION, type GeoPlace, type GeoReverseResult, type GeoSearchResult } from './types';

/**
 * Mapbox Geocoding v5.
 *
 * Why Geocoding v5 and not the Search Box API: a single forward call returns the coordinates
 * plus the formatted address, whereas Search Box needs `suggest` + `retrieve` (two calls and a
 * session token) for the same result. This app needs address -> coordinates, not place ids.
 *
 * Token handling: the token is read from the environment on the server only. It is never
 * interpolated into an error message and never returned to the browser.
 */

const GEOCODE_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

/** Bounded network budget - address search must never block a form for long. */
const TIMEOUT_MS = 6000;

/**
 * In-memory, per-process cache. Mapbox's terms do not permit retaining geocoding responses,
 * so this is intentionally short-lived and never written to the database. It exists only to
 * collapse the duplicate lookups a typeahead produces (same prefix, two users, one page view).
 */
const MEMORY_TTL_MS = 5 * 60 * 1000;
const MEMORY_MAX_ENTRIES = 200;
const memory = new Map<string, { at: number; value: GeoSearchResult | GeoReverseResult }>();

function memoryGet<T extends GeoSearchResult | GeoReverseResult>(key: string): T | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > MEMORY_TTL_MS) {
    memory.delete(key);
    return null;
  }
  // Refresh LRU position.
  memory.delete(key);
  memory.set(key, hit);
  return hit.value as T;
}

function memorySet(key: string, value: GeoSearchResult | GeoReverseResult): void {
  memory.set(key, { at: Date.now(), value });
  while (memory.size > MEMORY_MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

/** Server-side token. Prefers a server-only name, falls back to the public pk. token. */
export function getMapboxToken(): string {
  return (process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || process.env.MapBox_Token || '').trim();
}

export function isMapboxConfigured(): boolean {
  return getMapboxToken().length > 0;
}

interface MapboxFeature {
  id?: string;
  text?: string;
  place_name?: string;
  place_type?: string[];
  relevance?: number;
  center?: [number, number];
}

function toPlace(feature: MapboxFeature): GeoPlace | null {
  const center = feature.center;
  if (!Array.isArray(center) || center.length !== 2) return null;
  const [lng, lat] = center;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    id: feature.id ?? `${lat},${lng}`,
    name: feature.text ?? feature.place_name ?? 'Unnamed place',
    address: feature.place_name ?? feature.text ?? '',
    lat,
    lng,
    type: feature.place_type?.[0] ?? 'unknown',
    relevance: typeof feature.relevance === 'number' ? feature.relevance : 0
  };
}

type FailureStatus = 'unauthorized' | 'rate_limited' | 'provider_error' | 'timeout';

/** Maps an HTTP status to a status the UI can explain without leaking provider detail. */
function statusForHttp(code: number): FailureStatus {
  if (code === 401 || code === 403) return 'unauthorized';
  if (code === 429) return 'rate_limited';
  return 'provider_error';
}

async function requestFeatures(path: string, query: URLSearchParams): Promise<{ status: 'ok'; features: MapboxFeature[] } | { status: FailureStatus }> {
  const token = getMapboxToken();
  if (!token) return { status: 'unauthorized' };

  query.set('access_token', token);
  const url = `${GEOCODE_BASE}/${path}.json?${query.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
  } catch (error) {
    // AbortError covers the timeout; anything else is a network failure.
    const name = error instanceof Error ? error.name : '';
    console.warn('[mapbox] geocoding request failed:', name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network');
    return { status: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'provider_error' };
  }

  if (!response.ok) {
    console.warn('[mapbox] geocoding http', response.status);
    return { status: statusForHttp(response.status) };
  }

  let body: { features?: MapboxFeature[] };
  try {
    body = (await response.json()) as { features?: MapboxFeature[] };
  } catch {
    console.warn('[mapbox] geocoding returned non-JSON body');
    return { status: 'provider_error' };
  }

  return { status: 'ok', features: Array.isArray(body.features) ? body.features : [] };
}

export interface SearchOptions {
  /** Bias results toward a point (e.g. the operator's city). */
  proximity?: { lat: number; lng: number };
  limit?: number;
  /** ISO country filter; defaults to India because every Sanchay asset is in MP. */
  country?: string;
}

/**
 * Forward geocoding for the address typeahead.
 * Results are *suggestions*: the caller must let a human confirm them before saving.
 */
export async function searchPlaces(rawQuery: string, options: SearchOptions = {}): Promise<GeoSearchResult> {
  if (!isMapboxConfigured()) return { status: 'not_configured', configured: false, places: [] };

  const query = rawQuery.trim().replace(/\s+/g, ' ');
  if (query.length < 2) return { status: 'invalid_request', configured: true, places: [] };

  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
  const country = options.country ?? 'in';
  const proximity = options.proximity;
  const cacheKey = `s|${country}|${limit}|${proximity ? `${proximity.lng},${proximity.lat}` : ''}|${query.toLowerCase()}`;

  const cached = memoryGet<GeoSearchResult>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    autocomplete: 'true',
    language: 'en',
    limit: String(limit),
    country,
    types: 'address,place,locality,neighborhood,poi'
  });
  if (proximity) params.set('proximity', `${proximity.lng},${proximity.lat}`);

  const result = await requestFeatures(encodeURIComponent(query), params);
  const value: GeoSearchResult =
    result.status === 'ok'
      ? { status: 'ok', configured: true, places: result.features.map(toPlace).filter((p): p is GeoPlace => p !== null) }
      : { status: result.status, configured: true, places: [] };

  if (value.status === 'ok') memorySet(cacheKey, value);
  return value;
}

/**
 * Reverse geocoding: coordinates -> nearest readable address.
 *
 * Gwalior street-level reverse results are noisy (they can resolve to a shop inside a building),
 * so this is only used to *describe* a captured point, never to overwrite a verified address.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoReverseResult> {
  if (!isMapboxConfigured()) return { status: 'not_configured', configured: false, place: null };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { status: 'invalid_request', configured: true, place: null };
  }

  const cacheKey = `r|${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = memoryGet<GeoReverseResult>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({ language: 'en', limit: '1', types: 'address,place,locality,neighborhood' });
  const result = await requestFeatures(`${lng.toFixed(6)},${lat.toFixed(6)}`, params);

  const value: GeoReverseResult =
    result.status === 'ok'
      ? { status: 'ok', configured: true, place: toPlace(result.features[0] ?? {}) }
      : { status: result.status, configured: true, place: null };

  if (value.status === 'ok') memorySet(cacheKey, value);
  return value;
}

export { GEO_ATTRIBUTION };
