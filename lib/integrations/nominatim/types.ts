import type { GeoPlace, GeoLookupStatus, GeoSearchResult, GeoReverseResult } from '@/lib/integrations/mapbox/types';

export type { GeoPlace, GeoLookupStatus, GeoSearchResult, GeoReverseResult };

/** Required attribution under the OpenStreetMap Foundation and ODbL license */
export const NOMINATIM_ATTRIBUTION = 'Data © OpenStreetMap contributors, ODbL 1.0 (https://osm.org/copyright)';

export interface NominatimRawAddress {
  road?: string;
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state_district?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
  amenity?: string;
  police?: string;
  hospital?: string;
  office?: string;
  [key: string]: string | undefined;
}

export interface NominatimRawPlace {
  place_id: number;
  licence?: string;
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  class?: string;
  type?: string;
  place_rank?: number;
  importance?: number;
  addresstype?: string;
  name?: string;
  display_name: string;
  address?: NominatimRawAddress;
  boundingbox?: [string, string, string, string];
}
