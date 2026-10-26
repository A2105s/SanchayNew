/**
 * Which eCourts material actually tells Sanchay something about a *vehicle*.
 *
 * Verified against the live eCourts India API (2026-10) and its enum reference:
 *  - There is NO lookup by registration / chassis / engine number. Vehicle identifiers never
 *    appear in the API, so a case can never be discovered *from* a plate number.
 *  - The vehicle-relevant signal lives in (a) motor-accident case types, (b) Motor Vehicles Act
 *    citations, and (c) the seizure/custody facts an officer records against the CNR.
 *
 * Consequence for the vehicles module: a case is attached to a vehicle by an authorised person
 * holding a CNR (or by a party-name search), and the result is *evidence for human review* -
 * never an automatic eligibility decision.
 */

/** Case-type codes that concern motor vehicles (from GET /api/partner/enums → caseType). */
export const VEHICLE_CASE_TYPES = ['MACA', 'MCOC'] as const;

export type VehicleCaseType = (typeof VEHICLE_CASE_TYPES)[number];

/** Case-type labels, for display without another provider call. */
export const VEHICLE_CASE_TYPE_LABELS: Record<VehicleCaseType, string> = {
  MACA: 'Motor Accident Claims Appeal',
  MCOC: 'Motor Vehicle Compensation Case'
};

/** Act/section fragments that point at a vehicle-related dispute. */
const VEHICLE_ACT_PATTERNS: RegExp[] = [
  /motor\s*vehicles?\s*act/i,
  /\bm\.?v\.?\s*act\b/i,
  /\bsection\s*(?:184|185|279|304\s*a|338|379|411)\b/i,
  /motor\s*accident/i
];

/** Words that make a judgment summary relevant to custody/ownership of a vehicle. */
const VEHICLE_KEYWORD_PATTERNS: RegExp[] = [
  /\bvehicle\b/i,
  /\bseiz(?:ed|ure)\b/i,
  /\bconfiscat(?:ed|ion)\b/i,
  /\bimpound(?:ed)?\b/i,
  /\baccident\b/i,
  /\bfir\b/i
];

export interface VehicleRelevanceInput {
  caseType?: string | null;
  actsAndSections?: readonly string[] | null;
  /** Optional free-text signals, e.g. AI keywords or the disposal note. */
  keywords?: readonly string[] | null;
}

export interface VehicleRelevance {
  /** True when the case plausibly concerns a vehicle at all. */
  relevant: boolean;
  /** Why it matched - shown to the reviewer so a human can judge it, not just a boolean. */
  reasons: string[];
}

/**
 * Conservative classifier. It never decides eligibility; it only decides whether a case is
 * worth showing to an officer reviewing a vehicle. A non-match is not proof of no restriction.
 */
export function assessVehicleRelevance(input: VehicleRelevanceInput): VehicleRelevance {
  const reasons: string[] = [];

  const caseType = (input.caseType ?? '').toUpperCase();
  if ((VEHICLE_CASE_TYPES as readonly string[]).includes(caseType)) {
    reasons.push(`Motor-vehicle case type (${caseType})`);
  }

  for (const citation of input.actsAndSections ?? []) {
    if (typeof citation !== 'string') continue;
    if (VEHICLE_ACT_PATTERNS.some((pattern) => pattern.test(citation))) {
      reasons.push(`Cites ${citation}`);
      break;
    }
  }

  for (const keyword of input.keywords ?? []) {
    if (typeof keyword !== 'string') continue;
    if (VEHICLE_KEYWORD_PATTERNS.some((pattern) => pattern.test(keyword))) {
      reasons.push(`Mentions "${keyword}"`);
      break;
    }
  }

  return { relevant: reasons.length > 0, reasons };
}
