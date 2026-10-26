import 'server-only';

import { readCache, writeCache } from '@/lib/integrations/shared/cache';
import STATIONS_DATA from '@/lib/data/gwalior-police-stations.json';
import DEPARTMENTS_DATA from '@/lib/data/gwalior-departments.json';
import {
  NOMINATIM_ATTRIBUTION,
  type GeoPlace,
  type GeoReverseResult,
  type GeoSearchResult,
  type NominatimRawPlace
} from './types';

/**
 * OpenStreetMap Nominatim Client for Sanchay.
 *
 * Implements strict compliance with the OpenStreetMap Foundation Nominatim Usage Policy:
 * 1. User-Agent identification: Custom descriptive User-Agent with contact info.
 * 2. Rate-Limiting: Strict server-side queuing enforcing at least 1,100ms between upstream calls (<= 1 req/sec).
 * 3. Multi-tier Caching: In-memory LRU + persistent PostgreSQL ExternalDataCache to prevent repeat queries.
 * 4. Local short-circuit: Known Gwalior police stations and government departments resolve instantly from verified local datasets.
 * 5. Geographic bias: Prioritizes Gwalior district bounding box (26.05-26.35 N, 78.05-78.35 E).
 */

const NOMINATIM_BASE_URL = (process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org').replace(/\/+$/, '');
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'SanchayFleetApp/1.0 (Gwalior Municipal & Police Operations; contact: fleet@sanchay.local)';
const NOMINATIM_EMAIL = process.env.NOMINATIM_EMAIL || 'fleet@sanchay.local';

/** Minimum interval between outgoing upstream requests to stay within OSM 1 req/sec policy */
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// In-memory LRU cache
const MEMORY_TTL_MS = 10 * 60 * 1000;
const MEMORY_MAX_ENTRIES = 200;
const memory = new Map<string, { at: number; value: GeoSearchResult | GeoReverseResult }>();

function memoryGet<T extends GeoSearchResult | GeoReverseResult>(key: string): T | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > MEMORY_TTL_MS) {
    memory.delete(key);
    return null;
  }
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

// ---------------------------------------------------------------------------
// Rate Limiter / Serialized Request Queue for OSM Compliance
// ---------------------------------------------------------------------------

let lastRequestTime = 0;
let queuePromise: Promise<void> = Promise.resolve();

async function scheduleRequest<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const now = Date.now();
    const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastRequestTime));
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastRequestTime = Date.now();
    return fn();
  };

  const next = queuePromise.then(run, run);
  queuePromise = next.then(() => undefined, () => undefined);
  return next;
}

// ---------------------------------------------------------------------------
// Normalisation Helpers
// ---------------------------------------------------------------------------

function formatNominatimPlace(raw: NominatimRawPlace): GeoPlace {
  const name = raw.name || raw.address?.amenity || raw.address?.road || raw.display_name.split(',')[0].trim();
  return {
    id: `osm-${raw.osm_type || 'node'}-${raw.osm_id || raw.place_id}`,
    name,
    address: raw.display_name,
    lat: Number(raw.lat),
    lng: Number(raw.lon),
    type: raw.type || raw.class || 'place',
    relevance: Math.min(1, Math.max(0.1, Number(raw.importance || 0.5)))
  };
}

// ---------------------------------------------------------------------------
// Local Dataset Short-Circuit (Zero-Latency Gwalior Matches)
// ---------------------------------------------------------------------------

function findLocalGwaliorPlaces(query: string, limit = 5): GeoPlace[] {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];

  const tokens = q.split(/\s+/).filter(Boolean);
  const results: GeoPlace[] = [];

  // Match police stations
  for (const s of STATIONS_DATA) {
    const hay = `${s.name} ${s.hindiName || ''} ${s.code} ${s.zone}`.toLowerCase();
    const matches = tokens.every((tok) => hay.includes(tok));
    if (matches) {
      results.push({
        id: `local-station-${s.code}`,
        name: s.name,
        address: `${s.name}, ${s.zone} Zone, Gwalior, Madhya Pradesh, India`,
        lat: s.lat,
        lng: s.lng,
        type: 'police_station',
        relevance: 1.0
      });
      if (results.length >= limit) return results;
    }
  }

  // Match government departments
  for (const d of DEPARTMENTS_DATA) {
    const hay = `${d.name} ${d.hindiName || ''} ${d.code} ${d.head}`.toLowerCase();
    const matches = tokens.every((tok) => hay.includes(tok));
    if (matches) {
      results.push({
        id: `local-dept-${d.code}`,
        name: d.name,
        address: `${d.name}, ${d.address}`,
        lat: 26.2183,
        lng: 78.1828,
        type: 'government_office',
        relevance: 0.95
      });
      if (results.length >= limit) return results;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API Functions
// ---------------------------------------------------------------------------

export interface NominatimSearchOptions {
  limit?: number;
  proximity?: { lat: number; lng: number };
  bounded?: boolean;
}

/**
 * Forward Geocoding via Nominatim with OSM Rate-Limiting & Caching.
 */
export async function searchPlacesNominatim(
  query: string,
  options: NominatimSearchOptions = {}
): Promise<GeoSearchResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { status: 'invalid_request', configured: true, places: [] };
  }

  // 1. Check local Gwalior verified directory short-circuit
  const localMatches = findLocalGwaliorPlaces(trimmed, options.limit ?? 5);
  if (localMatches.length > 0) {
    return { status: 'ok', configured: true, places: localMatches };
  }

  // 2. Check memory cache
  const cacheKey = `search:${trimmed.toLowerCase()}:${options.limit ?? 5}`;
  const memHit = memoryGet<GeoSearchResult>(cacheKey);
  if (memHit) return memHit;

  // 3. Check persistent database cache
  const dbHit = await readCache<GeoPlace[]>('nominatim', cacheKey);
  if (dbHit?.payload) {
    const result: GeoSearchResult = { status: 'ok', configured: true, places: dbHit.payload };
    memorySet(cacheKey, result);
    return result;
  }

  // 4. Construct Nominatim query with Gwalior viewbox bias
  const params = new URLSearchParams({
    q: trimmed,
    format: 'json',
    addressdetails: '1',
    limit: String(Math.min(10, Math.max(1, options.limit ?? 5))),
    viewbox: '78.05,26.35,78.35,26.05', // Gwalior bounding box
    bounded: options.bounded ? '1' : '0'
  });
  if (NOMINATIM_EMAIL) {
    params.set('email', NOMINATIM_EMAIL);
  }

  const url = `${NOMINATIM_BASE_URL}/search?${params.toString()}`;

  try {
    const rawPlaces = await scheduleRequest(async () => {
      const res = await fetch(url, {
        headers: {
          'User-Agent': NOMINATIM_USER_AGENT,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });

      if (res.status === 429) {
        throw new Error('RATE_LIMITED');
      }
      if (!res.ok) {
        throw new Error(`PROVIDER_HTTP_${res.status}`);
      }

      return (await res.json()) as NominatimRawPlace[];
    });

    const places = (Array.isArray(rawPlaces) ? rawPlaces : []).map(formatNominatimPlace);
    const result: GeoSearchResult = { status: 'ok', configured: true, places };

    memorySet(cacheKey, result);
    void writeCache('nominatim', cacheKey, places, { status: 'OK', ttlMs: CACHE_TTL_MS });

    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'unknown';
    if (msg === 'RATE_LIMITED') {
      return { status: 'rate_limited', configured: true, places: [] };
    }
    if (msg.includes('timeout') || msg.includes('AbortError')) {
      return { status: 'timeout', configured: true, places: [] };
    }
    console.warn('[nominatim:search] failed:', msg);
    return { status: 'provider_error', configured: true, places: [] };
  }
}

/**
 * Reverse Geocoding via Nominatim with Coordinate Quantisation & Caching.
 */
export async function reverseGeocodeNominatim(lat: number, lng: number): Promise<GeoReverseResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { status: 'invalid_request', configured: true, place: null };
  }

  // Quantise coordinates to 4 decimal places (~11m precision) so telemetry jitter hits cache
  const qLat = Number(lat.toFixed(4));
  const qLng = Number(lng.toFixed(4));
  const cacheKey = `rev:${qLat}:${qLng}`;

  // 1. Check memory cache
  const memHit = memoryGet<GeoReverseResult>(cacheKey);
  if (memHit) return memHit;

  // 2. Check persistent database cache
  const dbHit = await readCache<GeoPlace>('nominatim', cacheKey);
  if (dbHit?.payload) {
    const result: GeoReverseResult = { status: 'ok', configured: true, place: dbHit.payload };
    memorySet(cacheKey, result);
    return result;
  }

  // 3. Construct Nominatim reverse request
  const params = new URLSearchParams({
    lat: String(qLat),
    lon: String(qLng),
    format: 'json',
    addressdetails: '1',
    zoom: '18'
  });
  if (NOMINATIM_EMAIL) {
    params.set('email', NOMINATIM_EMAIL);
  }

  const url = `${NOMINATIM_BASE_URL}/reverse?${params.toString()}`;

  try {
    const rawPlace = await scheduleRequest(async () => {
      const res = await fetch(url, {
        headers: {
          'User-Agent': NOMINATIM_USER_AGENT,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });

      if (res.status === 429) {
        throw new Error('RATE_LIMITED');
      }
      if (!res.ok) {
        throw new Error(`PROVIDER_HTTP_${res.status}`);
      }

      return (await res.json()) as NominatimRawPlace;
    });

    if (!rawPlace || !rawPlace.lat || !rawPlace.lon) {
      const emptyResult: GeoReverseResult = { status: 'ok', configured: true, place: null };
      return emptyResult;
    }

    const place = formatNominatimPlace(rawPlace);
    const result: GeoReverseResult = { status: 'ok', configured: true, place };

    memorySet(cacheKey, result);
    void writeCache('nominatim', cacheKey, place, { status: 'OK', ttlMs: CACHE_TTL_MS });

    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'unknown';
    if (msg === 'RATE_LIMITED') {
      return { status: 'rate_limited', configured: true, place: null };
    }
    if (msg.includes('timeout') || msg.includes('AbortError')) {
      return { status: 'timeout', configured: true, place: null };
    }
    console.warn('[nominatim:reverse] failed:', msg);
    return { status: 'provider_error', configured: true, place: null };
  }
}

export function isNominatimConfigured(): boolean {
  return true; // Nominatim is open and requires no secret API key
}

export { NOMINATIM_ATTRIBUTION };
