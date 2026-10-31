// AI types shared by the server (lib/ai, app/api/ai) and the UI (components/ai).

export type AiProviderId = 'gemini' | 'nvidia' | 'openrouter' | 'groq' | 'mistral';
export type AiRouting = 'auto' | AiProviderId;

export interface ProviderAttempt {
  provider: AiProviderId;
  model: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  message: string;
}

/** Every generation response carries which engine answered and what was tried (drives the engine bar). */
export interface AiMeta {
  provider: AiProviderId | null;
  model: string | null;
  latencyMs: number;
  attempts: ProviderAttempt[];
  /** True when no model answered and a deterministic (non-AI) answer is returned instead. Never faked. */
  degraded: boolean;
}

export interface AiProviderHealth {
  id: AiProviderId;
  name: string;
  model: string;
  configured: boolean;
  vision: boolean;
  ok: boolean;
  status: number;
  latencyMs: number;
  message: string;
}

export interface AiFeatureToggles {
  copilot: boolean;
  draftRequest: boolean;
  polish: boolean;
  extractDocument: boolean;
  pulse: boolean;
}

export interface AiSettings {
  enabled: boolean;
  preferredProvider: AiRouting;
  fallbackOrder: AiProviderId[];
  /** When false (default) registration numbers are replaced by asset codes before anything reaches a model. */
  shareRegistration: boolean;
  features: AiFeatureToggles;
}

export interface AiHealthResult {
  enabled: boolean;
  anyConfigured: boolean;
  /** Admin feature switches, so the UI can hide helpers that are turned off */
  features: AiFeatureToggles;
  /** Only populated for callers with settings.manage */
  providers: AiProviderHealth[];
}

// ---- Copilot ----
export interface CopilotTurn {
  role: 'user' | 'assistant';
  content: string;
}
export interface CopilotRequest {
  question: string;
  history?: CopilotTurn[];
  provider?: AiRouting;
}
export interface CopilotAction {
  label: string;
  href: string;
}
export interface CopilotResponse extends AiMeta {
  answer: string;
  suggestedActions: CopilotAction[];
  /** What the answer was grounded on, e.g. "Fleet summary (148 vehicles)". Shown as sources. */
  grounding: string[];
}

// ---- Pulse ----
export interface PulseAction {
  label: string;
  href: string;
  priority: 'high' | 'medium' | 'low';
}
export interface PulseResponse extends AiMeta {
  summary: string;
  highlights: string[];
  recommendedActions: PulseAction[];
  generatedAt: string;
}

// ---- Polish ----
export type PolishKind = 'incident' | 'maintenance' | 'handover' | 'return' | 'request-purpose' | 'space-spec';
export interface PolishRequest {
  kind: PolishKind;
  text: string;
  provider?: AiRouting;
}
export interface PolishResponse extends AiMeta {
  original: string;
  polished: string;
  changes: string[];
}

// ---- Draft request ----
export interface DraftRequestBody {
  text: string;
  provider?: AiRouting;
}
export interface DraftRequestFields {
  requestedClass: 'PATROL_CAR' | 'MOTORCYCLE' | 'VAN' | 'HEAVY';
  purpose: string;
  destination: string | null;
  passengers: number;
  startAt: string | null;
  endAt: string | null;
  accountableOfficer: string | null;
}
export interface DraftCandidate {
  vehicleId: string;
  assetCode: string;
  label: string;
  organizationName: string;
  reason: string;
}
export interface DraftRequestResponse extends AiMeta {
  draft: DraftRequestFields;
  candidates: DraftCandidate[];
  warnings: string[];
}

// ---- Space Draft Booking ----
export interface DraftSpaceBookingBody {
  text: string;
  provider?: AiRouting;
}
export interface DraftSpaceBookingFields {
  category: string;
  minCapacity: number;
  purpose: string;
  attendees: number;
  startAt: string | null;
  endAt: string | null;
  amenities: string[];
  district: string | null;
}
export interface DraftSpaceCandidate {
  spaceId: string;
  assetCode: string;
  name: string;
  buildingOrCampus: string | null;
  district: string | null;
  category: string;
  capacity: number;
  areaSqft: number | null;
  score: number;
  reason: string;
}
export interface DraftSpaceBookingResponse extends AiMeta {
  draft: DraftSpaceBookingFields;
  candidates: DraftSpaceCandidate[];
  warnings: string[];
}

// ---- Space Approver Triage ----
export interface SpaceTriageBody {
  bookingId: string;
  provider?: AiRouting;
}
export interface SpaceTriageResponse extends AiMeta {
  recommendation: 'APPROVE' | 'REJECT' | 'NEEDS_REVIEW';
  confidence: number;
  summary: string;
  safetyAnalysis: {
    status: 'SAFE' | 'WARNING' | 'CRITICAL';
    sqFtPerAttendee: number | null;
    note: string;
  };
  departmentFit: {
    aligned: boolean;
    note: string;
  };
  suggestedNote: string;
}

// ---- Vehicle Request Approver Triage ----
export interface RequestTriageBody {
  provider?: AiRouting;
}
export interface RequestTriageResponse extends AiMeta {
  recommendation: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';
  confidence: number;
  summary: string;
  complianceCheck: {
    valid: boolean;
    note: string;
  };
  capacityFit: {
    fits: boolean;
    passengers: number;
    vehicleCapacity: number;
    note: string;
  };
  maintenanceCheck: {
    ticketsCount: number;
    note: string;
  };
  suggestedComment: string;
}

// ---- Space Pulse ----
export interface SpacePulseAction {
  label: string;
  href: string;
  priority: 'high' | 'medium' | 'low';
}
export interface SpacePulseResponse extends AiMeta {
  summary: string;
  idleCount: number;
  busyCount: number;
  blockedCount: number;
  highlights: string[];
  recommendations: SpacePulseAction[];
  generatedAt: string;
}

// ---- Document extraction ----
export type ExtractKind = 'RC' | 'INSURANCE' | 'PUC' | 'FITNESS';
export interface ExtractedFields {
  registrationNumber: string | null;
  chassisNumber: string | null;
  engineNumber: string | null;
  makeModel: string | null;
  year: number | null;
  fuelType: string | null;
  color: string | null;
  seating: number | null;
  expiryDate: string | null;
  ownerName: string | null;
}
export interface ExtractResponse extends AiMeta {
  kind: ExtractKind;
  fields: ExtractedFields;
  confidence: Partial<Record<keyof ExtractedFields, 'high' | 'medium' | 'low'>>;
  notes: string;
}

// ---- Fleet Readiness Triage ----
export interface FleetTriageAction {
  id: string;
  type: 'COMPLIANCE_RENEWAL' | 'FUEL_ROUTING' | 'MAINTENANCE_SCHEDULE' | 'STATION_TRANSFER' | 'INSPECTION';
  vehicleId: string;
  vehicleLabel: string;
  assetCode: string;
  stationName?: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  impact: string;
  /** Action metadata for 1-click execution */
  actionPayload?: Record<string, unknown>;
  actionUrl?: string;
}

export interface FleetReadinessLane {
  count: number;
  vehicleIds: string[];
  description: string;
}

export interface FleetReadinessResponse extends AiMeta {
  summary: string;
  lanes: {
    ready: FleetReadinessLane;
    attention: FleetReadinessLane;
    grounded: FleetReadinessLane;
  };
  actions: FleetTriageAction[];
  stationId: string | null;
  stationName: string | null;
  totalVehicles: number;
  generatedAt: string;
}

// ---- Auto-Dispatch ----
export interface AutoDispatchCandidate {
  vehicleId: string;
  assetCode: string;
  registrationNumber: string;
  displayName: string;
  vehicleClass: string;
  suitabilityScore: number;
  suitabilityReason: string;
  fuelPercent?: number | null;
  assignedDriver?: {
    name: string;
    phone?: string | null;
  } | null;
  stationName: string;
  complianceStatus: 'OK' | 'EXPIRING' | 'EXPIRED';
  readinessState: 'READY' | 'ATTENTION' | 'GROUNDED';
}

export interface AutoDispatchResponse extends AiMeta {
  missionIntent: string;
  parsedRequirements: {
    purpose: string;
    classNeeded: 'PATROL_CAR' | 'MOTORCYCLE' | 'VAN' | 'HEAVY';
    passengerCount: number;
    destination?: string | null;
    urgency?: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  };
  recommendations: AutoDispatchCandidate[];
  suggestedAction?: {
    vehicleId: string;
    driverName?: string;
    actionLabel: string;
    dispatchPayload: {
      vehicleId: string;
      purpose: string;
      startAt: string;
      endAt?: string | null;
      passengers: number;
    };
  } | null;
  warnings: string[];
  generatedAt: string;
}

