// Shared view models for Sanchay (client + server). Dates are ISO strings on the wire.
// Aligned with SANCHAY_Full_Specification (files 13-19). Spaces types are added in a later phase.
// KEEP status concepts SEPARATE (spec 13): operational status / eligibility / availability (computed) / request state / allocation lifecycle.

export type Role = 'ADMIN' | 'ORG_ADMIN' | 'DEPT_OFFICER' | 'STATION_OFFICER' | 'FIELD_STAFF' | 'AUDITOR';

export type Permission =
  | 'fleet.read'
  | 'vehicle.register'
  | 'vehicle.edit'
  | 'vehicle.delete'
  | 'eligibility.verify'
  | 'restriction.manage'
  | 'maintenance.write'
  | 'trip.write'
  | 'incident.write'
  | 'request.create'
  | 'request.review'
  | 'handover.record'
  | 'return.record'
  | 'return.inspect'
  | 'extension.decide'
  | 'transfer.create'
  | 'transfer.review'
  | 'device.manage'
  | 'document.read'
  | 'document.write'
  | 'audit.read'
  | 'report.read'
  | 'export'
  | 'settings.manage'
  | 'operators.manage';

export type VehicleStatus = 'MOVING' | 'IDLE' | 'BREAKDOWN' | 'OFFLINE'; // live motion state from telemetry only
export type OperationalStatus = 'ACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE' | 'RETIRED';
export type OwnershipCategory = 'GOVERNMENT_FLEET' | 'SEIZED_IMPOUNDED' | 'OTHER_UNVERIFIED';
export type EligibilityState = 'ELIGIBLE' | 'RESTRICTED' | 'PENDING_VERIFICATION' | 'INELIGIBLE';
export type VehicleClass = 'PATROL_CAR' | 'MOTORCYCLE' | 'VAN' | 'HEAVY';
export type Sector =
  | 'GMC_WASTE'
  | 'AMBULANCE_108'
  | 'POLICE_PATROL'
  | 'PWD_HEAVY'
  | 'HEALTH_VAN'
  | 'ELECTION_REQUISITION';
export type GpsSource = 'AIS_140' | 'QR_PWA' | 'MANUAL_CSV' | 'SIMULATED';
export type TelemetryFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';

export interface SessionUser {
  username: string;
  displayName: string;
  role: Role;
  organizationId: string | null;
  stationId: string | null;
}

export interface OrganizationView {
  id: string;
  code: string;
  name: string;
  kind: string;
  parentId: string | null;
}

export interface StationView {
  id: string;
  code: string;
  name: string;
  organizationId: string | null;
  zone: string;
  district: string;
  lat: number;
  lng: number;
  inchargeName: string | null;
  phone: string | null;
  inventory: Record<VehicleClass, number>; // ELIGIBLE government-fleet vehicles only
}

// ---------------------------------------------------------------------------
// Eligibility (server-side decision, spec 15). Never a bare boolean.
// ---------------------------------------------------------------------------

export type EligibilityDecisionResult = 'eligible' | 'ineligible' | 'needs_review';

export interface EligibilityReason {
  code: string; // e.g. OWNERSHIP_NOT_VERIFIED, SEIZED_CUSTODY, ACTIVE_RESTRICTION, MAINTENANCE_WINDOW, OUT_OF_SERVICE, COMPLIANCE_EXPIRED
  message: string;
  blocking: boolean;
}

export interface EligibilityDecision {
  result: EligibilityDecisionResult;
  state: EligibilityState;
  reasons: EligibilityReason[];
  policyVersion: string;
  evaluatedAt: string;
}

export type AvailabilityState =
  | 'AVAILABLE'
  | 'ALLOCATED' // eligible but has an overlapping reservation/allocation
  | 'UNAVAILABLE' // operational status / maintenance window
  | 'RESTRICTED'
  | 'PENDING_VERIFICATION'
  | 'INELIGIBLE';

export interface AvailabilityView {
  state: AvailabilityState;
  reasons: string[];
  /** Range the check was made for (null = "right now") */
  from: string | null;
  to: string | null;
  asOf: string;
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

/** Full record. Only returned for vehicles inside the caller's organization scope. */
export interface VehicleView {
  id: string;
  assetCode: string;
  registrationNumber: string;
  registrationNormalized: string;
  displayName: string;
  sector: Sector;
  vehicleClass: VehicleClass;
  vehicleType: string;
  organizationId: string;
  organizationName: string;
  managingUnit: string | null;
  stationId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  status: VehicleStatus; // live motion
  operationalStatus: OperationalStatus;
  ownershipCategory: OwnershipCategory;
  eligibilityState: EligibilityState;
  eligibilityReasons: EligibilityReason[];
  eligibilityPolicyVersion: string | null;
  eligibilityEvaluatedAt: string | null;
  makeModel: string | null;
  year: number | null;
  fuelType: string | null;
  seating: number | null;
  color: string | null;
  chassisNumber: string | null;
  engineNumber: string | null;
  odometerKm: number;
  gpsSource: GpsSource;
  lat: number | null;
  lng: number | null;
  speedKmph: number;
  heading: number;
  ignition: boolean;
  fuelPercent: number | null;
  /** Device time of last accepted event vs server ingestion time (spec 17) */
  lastSeenAt: string | null;
  lastIngestedAt: string | null;
  telemetryFreshness: TelemetryFreshness;
  idleSince: string | null;
  pucExpiry: string | null;
  insuranceExpiry: string | null;
  fitnessExpiry: string | null;
  maintenanceRisk: number;
  hoursWeek: number;
  photoUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Duplicate candidates flagged for review (never silently merged) */
  duplicateOf: string[];
}

/**
 * What another organization (or a request search) is allowed to see about an ELIGIBLE government-fleet vehicle.
 * Masked: registration, driver, odometer, documents, exact position. Non-eligible foreign vehicles are never returned.
 */
export interface VehicleCardView {
  id: string;
  assetCode: string;
  registrationMasked: string; // e.g. MP07-**-1234 (full only for own organization)
  displayName: string;
  vehicleClass: VehicleClass;
  vehicleType: string;
  makeModel: string | null;
  seating: number | null;
  fuelType: string | null;
  organizationId: string;
  organizationName: string;
  stationName: string | null;
  operationalStatus: OperationalStatus;
  eligibilityState: EligibilityState;
  availability: AvailabilityView;
  telemetryFreshness: TelemetryFreshness;
  lastSeenAt: string | null;
  nextMaintenanceDue: string | null;
  /** True when the caller's organization owns/controls it (own vehicles show full detail elsewhere) */
  isOwn: boolean;
  photoUrl: string | null;
}

export interface VehicleSearchParams {
  q?: string;
  vehicleClass?: VehicleClass;
  sector?: Sector;
  organizationId?: string;
  stationId?: string;
  operationalStatus?: OperationalStatus;
  eligibility?: EligibilityState;
  ownership?: OwnershipCategory;
  complianceState?: 'expired' | 'expiring' | 'ok';
  staleTelemetry?: boolean;
  /** Availability for a date range (ISO). When set, results carry availability for that range */
  from?: string;
  to?: string;
  availableOnly?: boolean;
  scope?: 'own' | 'discover'; // own = my organization inventory; discover = eligible vehicles of other organizations
  page?: number;
  pageSize?: number; // max 100
  sort?: 'assetCode' | 'registration' | 'status' | 'lastSeen';
  dir?: 'asc' | 'desc';
}

export interface VehicleSearchResult {
  items: (VehicleView | VehicleCardView)[];
  total: number;
  page: number;
  pageSize: number;
  asOf: string;
  /** Distinguishes the three empty states (spec 14) */
  emptyReason: null | 'NO_MATCH' | 'NO_ACCESS';
  from: string | null;
  to: string | null;
}

export interface OwnershipVerificationView {
  id: string;
  vehicleId: string;
  category: OwnershipCategory;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUPERSEDED';
  evidenceRef: string;
  evidenceNote: string | null;
  submittedBy: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionNote: string | null;
  createdAt: string;
}

export interface RestrictionView {
  id: string;
  vehicleId: string;
  type: 'LEGAL_CUSTODY' | 'COURT_ORDER' | 'SAFETY' | 'MAINTENANCE_HOLD' | 'COMPLIANCE' | 'OTHER';
  reasonCode: string;
  description: string | null;
  evidenceRef: string | null;
  authority: string;
  decidedBy: string;
  decidedAt: string;
  reviewAt: string | null;
  expiresAt: string | null;
  liftedAt: string | null;
  liftedBy: string | null;
  liftReason: string | null;
  active: boolean;
}

export interface DocumentView {
  id: string;
  vehicleId: string;
  kind: 'RC' | 'INSURANCE' | 'PUC' | 'FITNESS' | 'OWNERSHIP_EVIDENCE' | 'HANDOVER_EVIDENCE' | 'OTHER';
  title: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface TripView {
  id: string;
  tripCode: string;
  vehicleId: string;
  driverName: string;
  purpose: string;
  status: 'ONGOING' | 'COMPLETED' | 'ABORTED';
  startedAt: string;
  endedAt: string | null;
  startAddress: string;
  endAddress: string | null;
  startOdometer: number;
  endOdometer: number | null;
  distanceKm: number | null;
  durationMin: number | null;
  fuelLiters: number | null;
  allocationId: string | null;
}

export type MaintenanceSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type MaintenanceStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';

export interface MaintenanceView {
  id: string;
  ticketCode: string;
  vehicleId: string;
  title: string;
  severity: MaintenanceSeverity;
  status: MaintenanceStatus;
  dueDate: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  blocksAvailability: boolean;
  completedAt: string | null;
  odometerKm: number | null;
  costInr: number;
  vendor: string | null;
  notes: string | null;
  raisedBy: string;
  createdAt: string;
}

export interface LegalRecordView {
  id: string;
  vehicleId: string;
  type: 'CHALLAN' | 'COURT_CASE' | 'ACCIDENT' | 'SEIZURE';
  referenceNo: string;
  date: string;
  description: string;
  status: 'PENDING' | 'ACTIVE' | 'APPEALED' | 'RESOLVED';
  amountInr: number | null;
  nextActionAt: string | null;
  authority: string;
}

export interface IncidentView {
  id: string;
  incidentCode: string;
  vehicleId: string;
  type: 'SOS' | 'BREAKDOWN' | 'ACCIDENT' | 'DAMAGE' | 'GEOFENCE' | 'OTHER';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  reporterName: string;
  lat: number | null;
  lng: number | null;
  offlineCaptured: boolean;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  acknowledgedBy: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface FuelLogView {
  id: string;
  vehicleId: string;
  liters: number;
  costInr: number | null;
  odometerKm: number | null;
  source: 'MANUAL' | 'SENSOR';
  loggedBy: string;
  loggedAt: string;
}

// ---------------------------------------------------------------------------
// Requests -> approvals -> allocations (spec 16)
// ---------------------------------------------------------------------------

export type RequestState =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export type AllocationLifecycle =
  | 'RESERVED'
  | 'AWAITING_HANDOVER'
  | 'ACTIVE'
  | 'RETURNED_PENDING_INSPECTION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'INCIDENT_HOLD';

export interface ApprovalStepView {
  id: string;
  requestId: string;
  stepOrder: number;
  approverOrgId: string;
  approverOrgName: string;
  decision: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'ESCALATED' | 'SKIPPED';
  decidedBy: string | null;
  decidedByRole: string | null;
  comment: string | null;
  decidedAt: string | null;
}

export interface AssetRequestView {
  id: string;
  requestCode: string;
  requestingOrgId: string;
  requestingOrgName: string;
  requesterUsername: string;
  requesterName: string;
  vehicleId: string | null;
  vehicleLabel: string | null; // masked label for foreign vehicles
  vehicleOrgName: string | null;
  requestedClass: VehicleClass;
  purpose: string;
  destination: string | null;
  passengers: number;
  startAt: string;
  endAt: string;
  accountableOfficer: string;
  accountablePhone: string | null;
  contactPhone: string | null;
  state: RequestState;
  approverOrgId: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  steps: ApprovalStepView[];
  allocationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HandoverRecordView {
  id: string;
  allocationId: string;
  handedOverBy: string;
  receivedBy: string;
  conditionNotes: string;
  odometerKm: number | null;
  fuelPercent: number | null;
  checklist: { item: string; present: boolean }[];
  evidenceRef: string | null;
  acknowledgedAt: string;
}

export interface ReturnRecordView {
  id: string;
  allocationId: string;
  returnedBy: string;
  receivedBy: string;
  returnedAt: string;
  conditionNotes: string;
  odometerKm: number | null;
  fuelPercent: number | null;
  discrepancies: string | null;
  evidenceRef: string | null;
  inspectionRequired: boolean;
  inspectionStatus: 'PENDING' | 'ACCEPTED' | 'DISPUTED' | 'NOT_REQUIRED';
  inspectedBy: string | null;
  inspectedAt: string | null;
  inspectionNotes: string | null;
}

export interface ExtensionView {
  id: string;
  allocationId: string;
  requestedBy: string;
  newEndAt: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface AllocationView {
  id: string;
  allocationCode: string;
  requestId: string;
  vehicleId: string;
  vehicleLabel: string; // masked for foreign users
  startAt: string;
  endAt: string;
  lifecycle: AllocationLifecycle;
  /** Derived: ACTIVE and past endAt (spec 16 RETURN_DUE) */
  returnDue: boolean;
  overdueHours: number;
  holdReason: string | null;
  cancelReason: string | null;
  handover: HandoverRecordView | null;
  returnRecord: ReturnRecordView | null;
  extensions: ExtensionView[];
  createdAt: string;
}

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Other fleet views
// ---------------------------------------------------------------------------

export type TransferStatus = 'PENDING' | 'ALLOCATED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

export interface TransferView {
  id: string;
  transferCode: string;
  requesterStationId: string;
  sourceStationId: string;
  destinationStationId: string;
  requestedBy: string;
  startAt: string;
  endAt: string;
  counts: Record<VehicleClass, number>;
  purpose: string;
  comments: string | null;
  status: TransferStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
}

export type DeviceKind = 'GPS_TRACKER' | 'OBD_DONGLE' | 'FUEL_SENSOR' | 'SOS_BUTTON' | 'DASHCAM' | 'TEMP_SENSOR';
export type DeviceStatus = 'ONLINE' | 'STALE' | 'OFFLINE' | 'UNPROVISIONED';

export interface DeviceView {
  id: string;
  deviceCode: string;
  kind: DeviceKind;
  vehicleId: string | null;
  protocol: 'AIS_140' | 'MQTT' | 'HTTP' | 'BLE';
  status: DeviceStatus;
  simulated: boolean;
  hasIngestKey: boolean;
  ingestKeyPrefix: string | null;
  firmware: string | null;
  batteryPct: number | null;
  signalDbm: number | null;
  lastSeenAt: string | null;
  provisionedAt: string | null;
  notes: string | null;
}

export interface AuditEntryView {
  id: string;
  seq: number;
  entityType: string;
  entityId: string;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  performedBy: string;
  performedByRole: string | null;
  organizationId: string | null;
  correlationId: string | null;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILED';
  performedAt: string;
  reason: string | null;
  prevHash: string | null;
  hash: string | null;
}

export interface OperatorView {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  organizationId: string | null;
  stationId: string | null;
  active: boolean;
  lastLoginAt: string | null;
}

/** All thresholds are configuration (spec 17) - never scattered constants. */
export interface FleetSettings {
  idleThresholdHours: number;
  complianceWarnDays: number;
  complianceCriticalDays: number;
  telemetryFreshMinutes: number; // FRESH while an event is newer than this (default 10)
  telemetryOfflineMinutes: number; // device OFFLINE after this (default 60)
  eligibilityPolicyVersion: string; // bumped when policy rules change
  requestExpiryHours: number; // unreviewed SUBMITTED requests expire after this (default 72)
  returnGraceMinutes: number; // before an ACTIVE allocation counts as overdue
  exportRowLimit: number; // hard cap per export (default 5000)
  maxBookingHorizonDays: number;
  requireInspectionOnReturn: boolean;
  allowSelfApproval: boolean; // separation of duties; default false
}

/** Everything list/dashboard screens need, already SCOPED to the caller's organization tree. */
export interface FleetSnapshot {
  me: SessionUser;
  generatedAt: string;
  dataVersion: string;
  settings: FleetSettings;
  organizations: OrganizationView[];
  stations: StationView[];
  vehicles: VehicleView[]; // own-scope only (capped; use /vehicles/search for paging)
  vehicleTotal: number;
  devices: DeviceView[];
  incidents: IncidentView[];
  maintenance: MaintenanceView[];
  requests: AssetRequestView[]; // requests I raised, or that need my organization's decision
  allocations: AllocationView[];
  transfers: TransferView[];
  trips: TripView[];
  unreadNotifications: number;
}

export interface VehicleDetail {
  vehicle: VehicleView | VehicleCardView;
  /** True when the caller is outside the owning organization: sensitive sections are omitted */
  masked: boolean;
  eligibility: EligibilityDecision;
  availability: AvailabilityView;
  ownership: OwnershipVerificationView[];
  restrictions: RestrictionView[];
  documents: DocumentView[]; // metadata only; content via signed URL
  trips: TripView[];
  maintenance: MaintenanceView[];
  legal: LegalRecordView[];
  incidents: IncidentView[];
  fuelLogs: FuelLogView[];
  devices: DeviceView[];
  allocations: AllocationView[]; // upcoming + history within access rules
  audit: AuditEntryView[];
}

/** Standard API envelope used by every /api/cloud/* route. */
export type ApiResult<T> = { success: true; data: T; operationId?: string } | { success: false; error: string; code?: string };

// ---------------------------------------------------------------------------
// Mutation payloads (POST bodies). Server validates with zod equivalents and NEVER trusts
// organizationId, role, eligibility, status, approver or approval result from the client.
// ---------------------------------------------------------------------------

export interface VehicleInput {
  registrationNumber: string;
  displayName: string;
  sector: Sector;
  vehicleClass: VehicleClass;
  vehicleType: string;
  managingUnit?: string | null;
  stationId?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  makeModel?: string | null;
  year?: number | null;
  fuelType?: string | null;
  seating?: number | null;
  color?: string | null;
  chassisNumber?: string | null;
  engineNumber?: string | null;
  odometerKm?: number;
  gpsSource?: GpsSource;
  lat?: number | null;
  lng?: number | null;
  pucExpiry?: string | null;
  insuranceExpiry?: string | null;
  fitnessExpiry?: string | null;
  notes?: string | null;
  /** Declared by the registrant; becomes effective only after verification. Default OTHER_UNVERIFIED. */
  claimedOwnership?: OwnershipCategory;
}

/** POST /api/cloud/vehicles/[id]/actions */
export type VehicleAction =
  | { type: 'update'; patch: Partial<VehicleInput> }
  | { type: 'setOperationalStatus'; status: OperationalStatus; reason: string }
  | { type: 'assignDriver'; driverName: string; driverPhone?: string | null }
  | { type: 'submitOwnership'; category: OwnershipCategory; evidenceRef: string; evidenceNote?: string }
  | { type: 'decideOwnership'; verificationId: string; decision: 'VERIFIED' | 'REJECTED'; note?: string } // verifier must differ from submitter
  | { type: 'addRestriction'; restrictionType: RestrictionView['type']; reasonCode: string; description?: string; evidenceRef?: string; authority: string; reviewAt?: string; expiresAt?: string }
  | { type: 'liftRestriction'; restrictionId: string; reason: string }
  | { type: 'reevaluateEligibility' }
  | { type: 'renewCompliance'; document: 'PUC' | 'INSURANCE' | 'FITNESS'; newExpiry: string; reference?: string }
  | { type: 'startTrip'; driverName: string; purpose: string; startAddress: string; startOdometer: number; allocationId?: string }
  | { type: 'endTrip'; tripId: string; endAddress: string; endOdometer: number; fuelLiters?: number }
  | { type: 'raiseMaintenance'; title: string; severity: MaintenanceSeverity; dueDate?: string; windowStart?: string; windowEnd?: string; blocksAvailability?: boolean; notes?: string; vendor?: string }
  | { type: 'updateMaintenance'; ticketId: string; status: MaintenanceStatus; costInr?: number; notes?: string }
  | { type: 'logIncident'; incidentType: IncidentView['type']; severity: IncidentView['severity']; message: string; lat?: number; lng?: number; offlineCaptured?: boolean }
  | { type: 'resolveIncident'; incidentId: string; resolution: 'ACKNOWLEDGED' | 'RESOLVED' }
  | { type: 'logFuel'; liters: number; costInr?: number; odometerKm?: number }
  | { type: 'addLegalRecord'; record: Omit<LegalRecordView, 'id' | 'vehicleId'> }
  | { type: 'updateLegalRecord'; recordId: string; status: LegalRecordView['status']; nextActionAt?: string | null }
  | { type: 'retire'; reason: string }; // never a hard delete of lifecycle records

/** POST /api/cloud/vehicles/bulk */
export type VehicleBulkAction =
  | { type: 'import'; rows: VehicleInput[] }
  | { type: 'reassignStation'; ids: string[]; stationId: string };

/** POST /api/cloud/requests  (creates DRAFT or SUBMITTED when submit=true). Header Idempotency-Key supported. */
export interface RequestInput {
  vehicleId?: string | null;
  requestedClass: VehicleClass;
  purpose: string;
  destination?: string;
  passengers: number;
  startAt: string;
  endAt: string;
  accountableOfficer: string;
  accountablePhone?: string;
  contactPhone?: string;
  submit?: boolean;
}

/** POST /api/cloud/requests/[id]/actions. Approver is resolved on the server from the org hierarchy. */
export type RequestAction =
  | { type: 'update'; patch: Partial<Omit<RequestInput, 'submit'>> } // DRAFT / CHANGES_REQUESTED only
  | { type: 'submit' }
  | { type: 'startReview' }
  | { type: 'approve'; comment?: string } // re-checks eligibility + availability inside the transaction, then creates the Allocation
  | { type: 'reject'; reason: string }
  | { type: 'requestChanges'; comment: string }
  | { type: 'escalate'; comment?: string }
  | { type: 'cancel'; reason?: string };

/** POST /api/cloud/allocations/[id]/actions */
export type AllocationAction =
  | { type: 'prepareHandover' } // RESERVED -> AWAITING_HANDOVER
  | { type: 'recordHandover'; receivedBy: string; conditionNotes: string; odometerKm?: number; fuelPercent?: number; checklist: { item: string; present: boolean }[]; evidenceRef?: string } // -> ACTIVE
  | { type: 'recordReturn'; receivedBy: string; conditionNotes: string; odometerKm?: number; fuelPercent?: number; discrepancies?: string; evidenceRef?: string } // ACTIVE -> RETURNED_PENDING_INSPECTION (or COMPLETED when inspection not required)
  | { type: 'inspect'; decision: 'ACCEPTED' | 'DISPUTED'; notes?: string }
  | { type: 'requestExtension'; newEndAt: string; reason: string }
  | { type: 'decideExtension'; extensionId: string; decision: 'APPROVED' | 'REJECTED'; note?: string } // re-checks conflicts
  | { type: 'hold'; reason: string } // -> INCIDENT_HOLD
  | { type: 'releaseHold' }
  | { type: 'cancel'; reason: string };

/** POST /api/cloud/transfers and /api/cloud/transfers/[id]/actions (station pool counts of ELIGIBLE vehicles) */
export interface TransferInput {
  sourceStationId: string;
  destinationStationId: string;
  startAt: string;
  endAt: string;
  counts: Partial<Record<VehicleClass, number>>;
  purpose: string;
  comments?: string;
}
export type TransferAction =
  | { type: 'approve' }
  | { type: 'reject'; reason: string }
  | { type: 'complete' }
  | { type: 'cancel' };

/** POST /api/cloud/devices and /api/cloud/devices/[id]/actions */
export interface DeviceInput {
  deviceCode: string;
  kind: DeviceKind;
  protocol: DeviceView['protocol'];
  vehicleId?: string | null;
  firmware?: string;
  simulated?: boolean;
  notes?: string;
}
export type DeviceAction =
  | { type: 'bind'; vehicleId: string | null }
  | { type: 'setSimulated'; simulated: boolean }
  | { type: 'rotateKey' } // returns the new plaintext key ONCE
  | { type: 'decommission' };

/** Response of POST /api/cloud/devices and rotateKey: the plaintext key is shown exactly once. */
export interface DeviceProvisionResult {
  device: DeviceView;
  ingestKey: string | null;
}

/**
 * POST /api/iot/ingest  Headers: `X-Device-Code: <code>` and `Authorization: Bearer <device ingest key>`.
 * A device can only write telemetry for the vehicle it is bound to. Never changes eligibility/status of the registry.
 */
export interface IngestPayload {
  recordedAt?: string; // device clock; rejected when older than the last accepted event (replay) or > 5 min in the future
  lat: number;
  lng: number;
  accuracyM?: number;
  speedKmph?: number;
  heading?: number;
  ignition?: boolean;
  fuelPercent?: number;
  batteryV?: number;
  batteryPct?: number;
  signalDbm?: number;
  sos?: boolean;
}

/** Live position delta merged client-side (real from /api/cloud/telemetry or simulated placeholder). */
export interface LiveDelta {
  vehicleId: string;
  lat: number;
  lng: number;
  speedKmph: number;
  heading: number;
  ignition: boolean;
  status: VehicleStatus;
  fuelPercent: number | null;
  lastSeenAt: string;
  simulated: boolean;
}

// ---------------------------------------------------------------------------
// Reports (spec 18): every metric has a definition, window and scope
// ---------------------------------------------------------------------------

export type ReportKind =
  | 'fleet-composition'
  | 'maintenance'
  | 'restricted-unverified'
  | 'compliance-due'
  | 'active-allocations'
  | 'overdue-returns'
  | 'pending-approvals'
  | 'stale-telemetry'
  | 'utilization'
  | 'downtime'
  | 'approval-cycle-time'
  | 'allocation-history'
  | 'maintenance-history'
  | 'audit-events';

export interface ReportMetric {
  key: string;
  label: string;
  value: number | string | null;
  unit?: string;
  /** Plain-language definition: numerator / denominator / treatment of cancelled & expired */
  definition: string;
}

export interface ReportResult {
  kind: ReportKind;
  title: string;
  generatedAt: string;
  window: { from: string | null; to: string | null };
  scope: string; // e.g. "Organization: Gwalior Police (and sub-units)"
  metrics: ReportMetric[];
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | boolean | null>[];
  truncated: boolean;
}
