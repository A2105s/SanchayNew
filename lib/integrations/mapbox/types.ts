/**
 * Normalised address result. Deliberately provider-agnostic: if the geocoding provider is
 * swapped later, the UI contract in `components/maps/AddressSearch` does not change.
 *
 * These types are imported by client components, so this file must stay free of server-only code.
 */
export interface GeoPlace {
  /** Provider feature id (Mapbox `id`). */
  id: string;
  /** Short label, e.g. "Gwalior Fort". */
  name: string;
  /** Full readable address, e.g. "Fort View Colony, Gird, Gwalior, Madhya Pradesh, India". */
  address: string;
  lat: number;
  lng: number;
  /** Primary feature type: address | place | locality | neighborhood | poi … */
  type: string;
  /** Provider relevance score (0-1). */
  relevance: number;
}

export type GeoLookupStatus =
  | 'ok'
  | 'not_configured'
  | 'unauthorized'
  | 'rate_limited'
  | 'provider_error'
  | 'timeout'
  | 'invalid_request';

/** Provider attribution that must be shown wherever results are displayed. */
export const GEO_ATTRIBUTION = 'Search results © Mapbox';

export interface GeoSearchResult {
  status: GeoLookupStatus;
  configured: boolean;
  places: GeoPlace[];
}

export interface GeoReverseResult {
  status: GeoLookupStatus;
  configured: boolean;
  place: GeoPlace | null;
}
