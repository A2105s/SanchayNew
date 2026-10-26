import 'server-only';

import { readCache, writeCache } from '@/lib/integrations/shared/cache';
import { normaliseCnr } from './cnr';
import { assessVehicleRelevance, type VehicleRelevance } from './vehicle-relevance';

/**
 * eCourts India partner API — vehicle-relevant slice only.
 *
 * Verified live (2026-10-26) against https://webapi.ecourtsindia.com:
 *  - Real paths live under /api/partner/… . The paths printed in the provider's endpoint table
 *    (/api/Case/{cnr}, /api/CauseList/…) return 401 even with a valid token.
 *  - Auth is a server-side bearer token (`eci_live_…`, 41 chars).
 *  - There is no vehicle-registration lookup. The only vehicle-relevant entries are:
 *      · GET /api/partner/case/{cnr}        – case detail, parties, citations, order metadata
 *      · GET /api/partner/case/{cnr}/provisions – the statutory citations for the case
 *    Both are billable, so results are cached in ExternalDataCache.
 *  - `case/{cnr}` already embeds the complete order text (files[].markdownContent). Sanchay
 *    deliberately keeps only the file names: order bodies are court records, not cache filler.
 */

const DEFAULT_BASE_URL = 'https://webapi.ecourtsindia.com';
const TIMEOUT_MS = 15_000;

const PROVIDER_CASE = 'ECOURTS_CASE';

/** Live matters move; disposed ones do not. Short TTL for the former keeps evidence current. */
const TTL_ACTIVE_MS = 24 * 60 * 60 * 1000;
const TTL_DISPOSED_MS = 30 * 24 * 60 * 60 * 1000;

export type EcourtsStatus =
  | 'ok'
  | 'not_configured'
  | 'not_found'
  | 'unauthorized'
  | 'rate_limited'
  | 'provider_error'
  | 'timeout'
  | 'invalid_request';

export interface EcourtsCase {
  cnr: string;
  caseNumber: string | null;
  caseType: { code: string | null; label: string | null };
  status: { code: string | null; label: string | null };
  court: { code: string | null; label: string | null };
  stateCode: string | null;
  districtCode: string | null;
  judicialSection: string | null;
  filingDate: string | null;
  registrationDate: string | null;
  firstHearingDate: string | null;
  lastHearingDate: string | null;
  nextHearingDate: string | null;
  decisionDate: string | null;
  disposalType: string | null;
  caseDurationDays: number | null;
  judges: string[];
  petitioners: string[];
  petitionerAdvocates: string[];
  respondents: string[];
  respondentAdvocates: string[];
  actsAndSections: string[];
  hasOrders: boolean;
  hasJudgments: boolean;
  orderCount: number;
  judgmentCount: number;
  hearingCount: number;
  /** Filenames only — never the order text. */
  orders: Array<{ file: string; markdownAvailable: boolean }>;
  /** Whether this case says anything about a vehicle, and why. */
  vehicleRelevance: VehicleRelevance;
  provider: 'eCourts India';
  retrievedAt: string;
  /** True when the payload was served from ExternalDataCache (no credits spent). */
  cached: boolean;
  requestId: string | null;
}

export interface EcourtsCaseResult {
  status: EcourtsStatus;
  case: EcourtsCase | null;
  cached: boolean;
  fetchedAt: string | null;
}

export function isEcourtsConfigured(): boolean {
  return getEcourtsToken().length > 0;
}

export function getEcourtsToken(): string {
  return (process.env.ECOURTS_API_TOKEN || '').trim();
}

function getBaseUrl(): string {
  return (process.env.ECOURTS_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/u, '');
}

// ---------------------------------------------------------------------------
// Normalisation helpers (the provider returns loose, sometimes-null shapes)
// ---------------------------------------------------------------------------

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        // Defensive: the API documents plain string arrays, but tolerate objects.
        const record = item as Record<string, unknown>;
        return asString(record.name ?? record.title ?? record.act ?? record.section ?? '') ?? '';
      }
      return '';
    })
    .filter((item) => item.length > 0);
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function label(lookup: unknown, code: string | null): string | null {
  if (!code || !lookup || typeof lookup !== 'object') return null;
  const value = (lookup as Record<string, unknown>)[code];
  return typeof value === 'string' ? value : null;
}

// ---------------------------------------------------------------------------
// Provider call
// ---------------------------------------------------------------------------

interface RawCaseResponse {
  data?: {
    courtCaseData?: Record<string, unknown>;
    entityInfo?: Record<string, unknown>;
    descriptions?: { enumLookup?: Record<string, unknown> };
    files?: { files?: Array<Record<string, unknown>> };
  };
  meta?: { request_id?: string };
}

async function fetchCase(cnr: string): Promise<
  { status: 'ok'; body: RawCaseResponse } | { status: Exclude<EcourtsStatus, 'ok' | 'invalid_request'> }
> {
  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}/api/partner/case/${encodeURIComponent(cnr)}`, {
      headers: { Authorization: `Bearer ${getEcourtsToken()}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store'
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    console.warn('[ecourts] case lookup failed:', timedOut ? 'timeout' : 'network');
    return { status: timedOut ? 'timeout' : 'provider_error' };
  }

  if (response.status === 404) return { status: 'not_found' };
  if (response.status === 401 || response.status === 403) {
    console.warn('[ecourts] token rejected', response.status);
    return { status: 'unauthorized' };
  }
  if (response.status === 402) return { status: 'unauthorized' }; // no credits left
  if (response.status === 429) return { status: 'rate_limited' };
  if (!response.ok) {
    console.warn('[ecourts] case lookup http', response.status);
    return { status: 'provider_error' };
  }

  try {
    return { status: 'ok', body: (await response.json()) as RawCaseResponse };
  } catch {
    console.warn('[ecourts] case lookup returned non-JSON body');
    return { status: 'provider_error' };
  }
}

function normaliseCase(body: RawCaseResponse, cached: boolean): EcourtsCase | null {
  const ccd = body.data?.courtCaseData;
  if (!ccd) return null;
  const entity = body.data?.entityInfo ?? {};
  const lookup = body.data?.descriptions?.enumLookup ?? {};

  const cnr = asString(ccd.cnr) ?? asString(entity.cnr);
  if (!cnr) return null;

  const caseTypeCode = asString(ccd.caseType);
  const statusCode = asString(ccd.caseStatus);
  const courtCode = asString(ccd.cnrCourtCode) ?? asString(ccd.courtName);

  const citations = asStringArray(ccd.provisions ?? ccd.actsAndSections);
  const keywords = asStringArray(ccd.aiKeywords);

  const orders = (body.data?.files?.files ?? []).flatMap((file) => {
    const name = asString(file.pdfFile) ?? asString(file.fileName);
    if (!name) return [];
    return [{ file: name, markdownAvailable: Boolean(asString(file.markdownFile) ?? file.markdownContent) }];
  });

  const vehicleRelevance = assessVehicleRelevance({
    caseType: caseTypeCode,
    actsAndSections: citations,
    keywords
  });

  return {
    cnr,
    caseNumber: asString(ccd.caseNumber),
    caseType: { code: caseTypeCode, label: label(lookup.caseType, caseTypeCode) },
    status: { code: statusCode, label: label(lookup.caseStatus, statusCode) },
    court: { code: courtCode, label: label(lookup.courtCode, courtCode) },
    stateCode: asString(ccd.stateCode),
    districtCode: asString(ccd.districtCode),
    judicialSection: asString(ccd.judicialSection),
    filingDate: asString(ccd.filingDate),
    registrationDate: asString(ccd.registrationDate),
    firstHearingDate: asString(ccd.firstHearingDate),
    lastHearingDate: asString(ccd.lastHearingDate) ?? asString(entity.lastDateOfHearing),
    nextHearingDate: asString(ccd.nextHearingDate) ?? asString(entity.nextDateOfHearing),
    decisionDate: asString(ccd.decisionDate),
    disposalType: asString(ccd.disposalType),
    caseDurationDays: ccd.caseDurationDays == null ? null : asNumber(ccd.caseDurationDays),
    judges: asStringArray(ccd.judges ?? ccd.judgeCode),
    petitioners: asStringArray(ccd.petitioners),
    petitionerAdvocates: asStringArray(ccd.petitionerAdvocates),
    respondents: asStringArray(ccd.respondents),
    respondentAdvocates: asStringArray(ccd.respondentAdvocates),
    actsAndSections: citations,
    hasOrders: asBoolean(ccd.hasOrders) || orders.length > 0,
    hasJudgments: asBoolean(ccd.hasJudgments),
    orderCount: asNumber(ccd.orderCount),
    judgmentCount: asNumber(ccd.judgmentCount),
    hearingCount: asNumber(ccd.hearingCount),
    orders,
    vehicleRelevance,
    provider: 'eCourts India',
    retrievedAt: new Date().toISOString(),
    cached,
    requestId: asString(body.meta?.request_id)
  };
}

// ---------------------------------------------------------------------------
// Public API (cached)
// ---------------------------------------------------------------------------

/**
 * Looks up one case by CNR.
 *
 * `refresh: true` bypasses the cache and re-bills the provider, so callers must gate it on an
 * explicit operator action and an elevated permission.
 */
export async function getCaseByCnr(rawCnr: string, options: { refresh?: boolean } = {}): Promise<EcourtsCaseResult> {
  const cnr = normaliseCnr(rawCnr);
  if (!cnr) return { status: 'invalid_request', case: null, cached: false, fetchedAt: null };

  if (!isEcourtsConfigured()) {
    return { status: 'not_configured', case: null, cached: false, fetchedAt: null };
  }

  if (!options.refresh) {
    const hit = await readCache<EcourtsCase>(PROVIDER_CASE, cnr);
    if (hit) {
      return {
        status: hit.status === 'NOT_FOUND' ? 'not_found' : 'ok',
        case: hit.status === 'NOT_FOUND' ? null : { ...hit.payload, cached: true },
        cached: true,
        fetchedAt: hit.fetchedAt.toISOString()
      };
    }
  }

  const result = await fetchCase(cnr);
  if (result.status !== 'ok') {
    // Transient failures are never cached; only a definitive "no such case" is.
    if (result.status === 'not_found') {
      await writeCache(PROVIDER_CASE, cnr, { cnr }, { status: 'NOT_FOUND', ttlMs: TTL_ACTIVE_MS });
    }
    return {
      status: result.status,
      case: null,
      cached: false,
      fetchedAt: null
    };
  }

  const normalised = normaliseCase(result.body, false);
  if (!normalised) {
    console.warn('[ecourts] case payload had no courtCaseData');
    return { status: 'provider_error', case: null, cached: false, fetchedAt: null };
  }

  const disposed = (normalised.status.code ?? '').toUpperCase() === 'DISPOSED' || Boolean(normalised.decisionDate);
  await writeCache(PROVIDER_CASE, cnr, normalised, {
    status: 'OK',
    ttlMs: disposed ? TTL_DISPOSED_MS : TTL_ACTIVE_MS
  });

  return { status: 'ok', case: normalised, cached: false, fetchedAt: normalised.retrievedAt };
}
