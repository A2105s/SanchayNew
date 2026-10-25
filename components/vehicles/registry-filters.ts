import type {
  EligibilityState,
  OperationalStatus,
  OwnershipCategory,
  Sector,
  VehicleClass,
  VehicleSearchParams
} from '@/types';

/**
 * URL <-> VehicleSearchParams for the server-side paginated registry (spec 14).
 * Filters are persisted in the URL so they survive navigation and reload.
 */

export const PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface RegistryFilters {
  q: string;
  vehicleClass: string;
  sector: string;
  stationId: string;
  operationalStatus: string;
  eligibility: string;
  ownership: string;
  complianceState: string; // '' | expired | expiring | ok
  staleTelemetry: boolean;
  sort: NonNullable<VehicleSearchParams['sort']>;
  dir: 'asc' | 'desc';
  view: 'table' | 'cards';
  page: number;
}

export const DEFAULT_FILTERS: RegistryFilters = {
  q: '',
  vehicleClass: '',
  sector: '',
  stationId: '',
  operationalStatus: '',
  eligibility: '',
  ownership: '',
  complianceState: '',
  staleTelemetry: false,
  sort: 'assetCode',
  dir: 'asc',
  view: 'table',
  page: 1
};

export function parseFilters(sp: URLSearchParams): RegistryFilters {
  const get = (k: string, d: string) => sp.get(k) ?? d;
  const sort = get('sort', 'assetCode');
  const validSort: RegistryFilters['sort'] = (['assetCode', 'registration', 'status', 'lastSeen'] as const).includes(
    sort as never
  )
    ? (sort as RegistryFilters['sort'])
    : 'assetCode';
  return {
    q: get('q', ''),
    vehicleClass: get('class', ''),
    sector: get('sector', ''),
    stationId: get('station', ''),
    operationalStatus: get('op', ''),
    eligibility: get('elig', ''),
    ownership: get('own', ''),
    complianceState: get('compliance', ''),
    staleTelemetry: get('stale', '') === '1',
    sort: validSort,
    dir: get('dir', 'asc') === 'desc' ? 'desc' : 'asc',
    view: get('view', 'table') === 'cards' ? 'cards' : 'table',
    page: Math.max(1, Number(get('page', '1')) || 1)
  };
}

export function filtersToQuery(f: RegistryFilters): string {
  const sp = new URLSearchParams();
  const put = (k: string, v: string, def: string) => {
    if (v && v !== def) sp.set(k, v);
  };
  put('q', f.q, '');
  put('class', f.vehicleClass, '');
  put('sector', f.sector, '');
  put('station', f.stationId, '');
  put('op', f.operationalStatus, '');
  put('elig', f.eligibility, '');
  put('own', f.ownership, '');
  put('compliance', f.complianceState, '');
  if (f.staleTelemetry) sp.set('stale', '1');
  put('sort', f.sort, 'assetCode');
  put('dir', f.dir, 'asc');
  put('view', f.view, 'table');
  if (f.page > 1) sp.set('page', String(f.page));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Build the server search query string for GET /api/cloud/vehicles/search. */
export function toSearchQuery(f: RegistryFilters, scope: 'own' | 'discover', extra?: Partial<VehicleSearchParams>): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set('q', f.q);
  if (f.vehicleClass) sp.set('vehicleClass', f.vehicleClass as VehicleClass);
  if (f.sector) sp.set('sector', f.sector as Sector);
  if (f.stationId) sp.set('stationId', f.stationId);
  if (f.operationalStatus) sp.set('operationalStatus', f.operationalStatus as OperationalStatus);
  if (f.eligibility) sp.set('eligibility', f.eligibility as EligibilityState);
  if (f.ownership) sp.set('ownership', f.ownership as OwnershipCategory);
  if (f.complianceState) sp.set('complianceState', f.complianceState);
  if (f.staleTelemetry) sp.set('staleTelemetry', 'true');
  sp.set('scope', scope);
  sp.set('sort', f.sort);
  sp.set('dir', f.dir);
  sp.set('page', String(f.page));
  sp.set('pageSize', String(PAGE_SIZE));
  if (extra?.from) sp.set('from', extra.from);
  if (extra?.to) sp.set('to', extra.to);
  if (extra?.availableOnly) sp.set('availableOnly', 'true');
  return sp.toString();
}

export function hasActiveFilters(f: RegistryFilters): boolean {
  return Boolean(
    f.q ||
      f.vehicleClass ||
      f.sector ||
      f.stationId ||
      f.operationalStatus ||
      f.eligibility ||
      f.ownership ||
      f.complianceState ||
      f.staleTelemetry
  );
}
