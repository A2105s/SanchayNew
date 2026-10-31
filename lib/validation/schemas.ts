import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums (aligned with types/index.ts and prisma CHECK constraints)
// ---------------------------------------------------------------------------

export const zVehicleClass = z.enum(['PATROL_CAR', 'MOTORCYCLE', 'VAN', 'HEAVY']);
export const zSector = z.enum(['GMC_WASTE', 'AMBULANCE_108', 'POLICE_PATROL', 'PWD_HEAVY', 'HEALTH_VAN', 'ELECTION_REQUISITION']);
export const zGpsSource = z.enum(['AIS_140', 'QR_PWA', 'MANUAL_CSV', 'SIMULATED']);
export const zOperationalStatus = z.enum(['ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED']);
export const zOwnershipCategory = z.enum(['GOVERNMENT_FLEET', 'SEIZED_IMPOUNDED', 'OTHER_UNVERIFIED']);
export const zEligibilityState = z.enum(['ELIGIBLE', 'RESTRICTED', 'PENDING_VERIFICATION', 'INELIGIBLE']);
export const zMaintenanceSeverity = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const zMaintenanceStatus = z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED']);
export const zRole = z.enum(['ADMIN', 'ORG_ADMIN', 'DEPT_OFFICER', 'STATION_OFFICER', 'FIELD_STAFF', 'AUDITOR']);
export const zIncidentType = z.enum(['SOS', 'BREAKDOWN', 'ACCIDENT', 'DAMAGE', 'GEOFENCE', 'OTHER']);
export const zIncidentSeverity = z.enum(['INFO', 'WARNING', 'CRITICAL']);
export const zLegalType = z.enum(['CHALLAN', 'COURT_CASE', 'ACCIDENT', 'SEIZURE']);
export const zLegalStatus = z.enum(['PENDING', 'ACTIVE', 'APPEALED', 'RESOLVED']);
export const zRestrictionType = z.enum(['LEGAL_CUSTODY', 'COURT_ORDER', 'SAFETY', 'MAINTENANCE_HOLD', 'COMPLIANCE', 'OTHER']);
export const zDeviceKind = z.enum(['GPS_TRACKER', 'OBD_DONGLE', 'FUEL_SENSOR', 'SOS_BUTTON', 'DASHCAM', 'TEMP_SENSOR']);
export const zDeviceProtocol = z.enum(['AIS_140', 'MQTT', 'HTTP', 'BLE']);
export const zDocumentKind = z.enum(['RC', 'INSURANCE', 'PUC', 'FITNESS', 'OWNERSHIP_EVIDENCE', 'HANDOVER_EVIDENCE', 'OTHER']);

const isoDate = z.string().trim().min(1).refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');
const isoDateNullable = z.union([isoDate, z.null()]);

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export const vehicleInputSchema = z.object({
  registrationNumber: z.string().trim().min(1).max(32),
  displayName: z.string().trim().min(1).max(120),
  sector: zSector,
  vehicleClass: zVehicleClass,
  vehicleType: z.string().trim().min(1).max(80),
  managingUnit: z.string().trim().max(120).nullish(),
  stationId: z.string().trim().min(1).nullish(),
  driverName: z.string().trim().max(120).nullish(),
  driverPhone: z.string().trim().max(20).nullish(),
  makeModel: z.string().trim().max(120).nullish(),
  year: z.number().int().min(1950).max(2100).nullish(),
  fuelType: z.string().trim().max(40).nullish(),
  seating: z.number().int().min(0).max(200).nullish(),
  color: z.string().trim().max(40).nullish(),
  chassisNumber: z.string().trim().max(64).nullish(),
  engineNumber: z.string().trim().max(64).nullish(),
  odometerKm: z.number().int().min(0).optional(),
  gpsSource: zGpsSource.optional(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  pucExpiry: isoDateNullable.optional(),
  insuranceExpiry: isoDateNullable.optional(),
  fitnessExpiry: isoDateNullable.optional(),
  notes: z.string().trim().max(2000).nullish(),
  claimedOwnership: zOwnershipCategory.optional()
});

export const vehiclePatchSchema = vehicleInputSchema.partial();

const checklistItem = z.object({ item: z.string().trim().min(1).max(120), present: z.boolean() });

export const vehicleActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update'), patch: vehiclePatchSchema }),
  z.object({ type: z.literal('setOperationalStatus'), status: zOperationalStatus, reason: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal('assignDriver'), driverName: z.string().trim().min(1).max(120), driverPhone: z.string().trim().max(20).nullish() }),
  z.object({ type: z.literal('submitOwnership'), category: zOwnershipCategory, evidenceRef: z.string().trim().min(1).max(300), evidenceNote: z.string().trim().max(2000).optional() }),
  z.object({ type: z.literal('decideOwnership'), verificationId: z.string().trim().min(1), decision: z.enum(['VERIFIED', 'REJECTED']), note: z.string().trim().max(2000).optional() }),
  z.object({
    type: z.literal('addRestriction'),
    restrictionType: zRestrictionType,
    reasonCode: z.string().trim().min(1).max(80),
    description: z.string().trim().max(2000).optional(),
    evidenceRef: z.string().trim().max(300).optional(),
    authority: z.string().trim().min(1).max(200),
    reviewAt: isoDate.optional(),
    expiresAt: isoDate.optional()
  }),
  z.object({ type: z.literal('liftRestriction'), restrictionId: z.string().trim().min(1), reason: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal('reevaluateEligibility') }),
  z.object({ type: z.literal('renewCompliance'), document: z.enum(['PUC', 'INSURANCE', 'FITNESS']), newExpiry: isoDate, reference: z.string().trim().max(120).optional() }),
  z.object({
    type: z.literal('startTrip'),
    driverName: z.string().trim().min(1).max(120),
    purpose: z.string().trim().min(1).max(500),
    startAddress: z.string().trim().min(1).max(300),
    startOdometer: z.number().int().min(0),
    allocationId: z.string().trim().optional()
  }),
  z.object({ type: z.literal('endTrip'), tripId: z.string().trim().min(1), endAddress: z.string().trim().min(1).max(300), endOdometer: z.number().int().min(0), fuelLiters: z.number().min(0).optional() }),
  z.object({
    type: z.literal('raiseMaintenance'),
    title: z.string().trim().min(1).max(200),
    severity: zMaintenanceSeverity,
    dueDate: isoDate.optional(),
    windowStart: isoDate.optional(),
    windowEnd: isoDate.optional(),
    blocksAvailability: z.boolean().optional(),
    notes: z.string().trim().max(2000).optional(),
    vendor: z.string().trim().max(120).optional()
  }),
  z.object({ type: z.literal('updateMaintenance'), ticketId: z.string().trim().min(1), status: zMaintenanceStatus, costInr: z.number().int().min(0).optional(), notes: z.string().trim().max(2000).optional() }),
  z.object({
    type: z.literal('logIncident'),
    incidentType: zIncidentType,
    severity: zIncidentSeverity,
    message: z.string().trim().min(1).max(1000),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    offlineCaptured: z.boolean().optional()
  }),
  z.object({ type: z.literal('resolveIncident'), incidentId: z.string().trim().min(1), resolution: z.enum(['ACKNOWLEDGED', 'RESOLVED']) }),
  z.object({ type: z.literal('logFuel'), liters: z.number().min(0), costInr: z.number().int().min(0).optional(), odometerKm: z.number().int().min(0).optional() }),
  z.object({
    type: z.literal('addLegalRecord'),
    record: z.object({
      type: zLegalType,
      referenceNo: z.string().trim().min(1).max(120),
      date: isoDate,
      description: z.string().trim().min(1).max(2000),
      status: zLegalStatus,
      amountInr: z.number().int().min(0).nullish(),
      nextActionAt: isoDateNullable.optional(),
      authority: z.string().trim().min(1).max(200)
    })
  }),
  z.object({ type: z.literal('updateLegalRecord'), recordId: z.string().trim().min(1), status: zLegalStatus, nextActionAt: isoDateNullable.optional() }),
  z.object({ type: z.literal('retire'), reason: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal('linkCourtCase'), cnr: z.string().trim().length(16).toUpperCase() }),
  z.object({ type: z.literal('refreshCourtCase'), recordId: z.string().trim().min(1) }),
  z.object({
    type: z.literal('releaseCustody'),
    reason: z.string().trim().min(1).max(500),
    authority: z.string().trim().min(1).max(200),
    releasedTo: z.string().trim().max(200).optional()
  }),
  z.object({ type: z.literal('markAuctionReady'), authority: z.string().trim().min(1).max(200) })
]);

export const vehicleBulkActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('import'), rows: z.array(vehicleInputSchema).min(1).max(5000) }),
  z.object({ type: z.literal('reassignStation'), ids: z.array(z.string().trim().min(1)).min(1).max(5000), stationId: z.string().trim().min(1) })
]);

// ---------------------------------------------------------------------------
// Vehicle search
// ---------------------------------------------------------------------------

export const vehicleSearchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  vehicleClass: zVehicleClass.optional(),
  sector: zSector.optional(),
  organizationId: z.string().trim().min(1).optional(),
  stationId: z.string().trim().min(1).optional(),
  operationalStatus: zOperationalStatus.optional(),
  eligibility: zEligibilityState.optional(),
  ownership: zOwnershipCategory.optional(),
  complianceState: z.enum(['expired', 'expiring', 'ok']).optional(),
  staleTelemetry: z.coerce.boolean().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  availableOnly: z.preprocess((v) => v === 'true' || v === true || v === '1', z.boolean()).optional(),
  scope: z.enum(['own', 'discover']).optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['assetCode', 'registration', 'status', 'lastSeen']).optional(),
  dir: z.enum(['asc', 'desc']).optional()
});

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const requestInputSchema = z.object({
  vehicleId: z.string().trim().min(1).nullish(),
  requestedClass: zVehicleClass,
  purpose: z.string().trim().min(1).max(500),
  destination: z.string().trim().max(300).optional(),
  passengers: z.number().int().min(1).max(200),
  startAt: isoDate,
  endAt: isoDate,
  accountableOfficer: z.string().trim().min(1).max(120),
  accountablePhone: z.string().trim().max(20).optional(),
  contactPhone: z.string().trim().max(20).optional(),
  submit: z.boolean().optional()
});

export const requestActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update'), patch: requestInputSchema.omit({ submit: true }).partial() }),
  z.object({ type: z.literal('submit') }),
  z.object({ type: z.literal('startReview') }),
  z.object({ type: z.literal('approve'), comment: z.string().trim().max(1000).optional() }),
  z.object({ type: z.literal('reject'), reason: z.string().trim().min(1).max(1000) }),
  z.object({ type: z.literal('requestChanges'), comment: z.string().trim().min(1).max(1000) }),
  z.object({ type: z.literal('escalate'), comment: z.string().trim().max(1000).optional() }),
  z.object({ type: z.literal('cancel'), reason: z.string().trim().max(1000).optional() })
]);

// ---------------------------------------------------------------------------
// Allocations
// ---------------------------------------------------------------------------

export const allocationActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('prepareHandover') }),
  z.object({
    type: z.literal('recordHandover'),
    receivedBy: z.string().trim().min(1).max(120),
    conditionNotes: z.string().trim().min(1).max(2000),
    odometerKm: z.number().int().min(0).optional(),
    fuelPercent: z.number().min(0).max(100).optional(),
    checklist: z.array(checklistItem).max(50),
    evidenceRef: z.string().trim().max(300).optional()
  }),
  z.object({
    type: z.literal('recordReturn'),
    receivedBy: z.string().trim().min(1).max(120),
    conditionNotes: z.string().trim().min(1).max(2000),
    odometerKm: z.number().int().min(0).optional(),
    fuelPercent: z.number().min(0).max(100).optional(),
    discrepancies: z.string().trim().max(2000).optional(),
    evidenceRef: z.string().trim().max(300).optional()
  }),
  z.object({ type: z.literal('inspect'), decision: z.enum(['ACCEPTED', 'DISPUTED']), notes: z.string().trim().max(2000).optional() }),
  z.object({ type: z.literal('requestExtension'), newEndAt: isoDate, reason: z.string().trim().min(1).max(1000) }),
  z.object({ type: z.literal('decideExtension'), extensionId: z.string().trim().min(1), decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(1000).optional() }),
  z.object({ type: z.literal('hold'), reason: z.string().trim().min(1).max(1000) }),
  z.object({ type: z.literal('releaseHold') }),
  z.object({ type: z.literal('cancel'), reason: z.string().trim().min(1).max(1000) })
]);

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export const transferCountsSchema = z
  .object({
    PATROL_CAR: z.number().int().min(0).optional(),
    MOTORCYCLE: z.number().int().min(0).optional(),
    VAN: z.number().int().min(0).optional(),
    HEAVY: z.number().int().min(0).optional()
  })
  .refine((c) => (c.PATROL_CAR ?? 0) + (c.MOTORCYCLE ?? 0) + (c.VAN ?? 0) + (c.HEAVY ?? 0) > 0, 'At least one vehicle must be requested.');

export const transferInputSchema = z.object({
  sourceStationId: z.string().trim().min(1),
  destinationStationId: z.string().trim().min(1),
  startAt: isoDate,
  endAt: isoDate,
  counts: transferCountsSchema,
  purpose: z.string().trim().min(1).max(500),
  comments: z.string().trim().max(1000).optional()
});

export const transferActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('approve') }),
  z.object({ type: z.literal('grant_clearance') }),
  z.object({ type: z.literal('grant_sanction') }),
  z.object({ type: z.literal('handover') }),
  z.object({ type: z.literal('reject'), reason: z.string().trim().min(1).max(1000).optional() }),
  z.object({ type: z.literal('complete') }),
  z.object({ type: z.literal('cancel') })
]);

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export const deviceInputSchema = z.object({
  deviceCode: z.string().trim().min(1).max(64),
  kind: zDeviceKind,
  protocol: zDeviceProtocol,
  vehicleId: z.string().trim().min(1).nullish(),
  firmware: z.string().trim().max(60).optional(),
  simulated: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional()
});

export const deviceActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bind'), vehicleId: z.union([z.string().trim().min(1), z.null()]) }),
  z.object({ type: z.literal('setSimulated'), simulated: z.boolean() }),
  z.object({ type: z.literal('rotateKey') }),
  z.object({ type: z.literal('decommission') })
]);

// ---------------------------------------------------------------------------
// IoT ingest (device auth via headers; payload has no deviceCode)
// ---------------------------------------------------------------------------

export const ingestPayloadSchema = z.object({
  recordedAt: isoDate.optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100000).optional(),
  speedKmph: z.number().min(0).max(400).optional(),
  heading: z.number().min(0).max(360).optional(),
  ignition: z.boolean().optional(),
  fuelPercent: z.number().min(0).max(100).optional(),
  batteryV: z.number().min(0).max(100).optional(),
  batteryPct: z.number().min(0).max(100).optional(),
  signalDbm: z.number().min(-200).max(0).optional(),
  sos: z.boolean().optional()
});

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const documentMetaSchema = z.object({
  kind: zDocumentKind,
  title: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(100),
  sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024),
  contentBase64: z.string().min(1),
  expiresAt: isoDateNullable.optional()
});

// ---------------------------------------------------------------------------
// Settings / Operators
// ---------------------------------------------------------------------------

export const fleetSettingsSchema = z.object({
  idleThresholdHours: z.number().min(1).max(8760),
  complianceWarnDays: z.number().min(1).max(365),
  complianceCriticalDays: z.number().min(0).max(365),
  telemetryFreshMinutes: z.number().min(1).max(1440),
  telemetryOfflineMinutes: z.number().min(1).max(10080),
  eligibilityPolicyVersion: z.string().trim().min(1).max(40),
  requestExpiryHours: z.number().min(1).max(8760),
  returnGraceMinutes: z.number().min(0).max(100000),
  exportRowLimit: z.number().int().min(1).max(1000000),
  maxBookingHorizonDays: z.number().min(1).max(3650),
  requireInspectionOnReturn: z.boolean(),
  allowSelfApproval: z.boolean()
});

export const operatorInputSchema = z.object({
  username: z.string().trim().min(3).max(60).regex(/^[a-zA-Z0-9._-]+$/u, 'Use letters, numbers, dot, underscore or hyphen.'),
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(160).optional(),
  phone: z.string().trim().max(20).optional(),
  role: zRole,
  organizationId: z.string().trim().min(1).nullish(),
  stationId: z.string().trim().min(1).nullish(),
  password: z.string().min(8).max(200)
});

export const operatorActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update'), displayName: z.string().trim().min(1).max(120).optional(), email: z.string().trim().email().max(160).nullish(), phone: z.string().trim().max(20).nullish(), role: zRole.optional(), organizationId: z.string().trim().min(1).nullish(), stationId: z.string().trim().min(1).nullish() }),
  z.object({ type: z.literal('setActive'), active: z.boolean() }),
  z.object({ type: z.literal('resetPassword'), password: z.string().min(8).max(200) }),
  z.object({ type: z.literal('delete') })
]);

export type VehicleInputParsed = z.infer<typeof vehicleInputSchema>;
export type VehicleActionParsed = z.infer<typeof vehicleActionSchema>;
export type VehicleBulkActionParsed = z.infer<typeof vehicleBulkActionSchema>;
export type VehicleSearchParsed = z.infer<typeof vehicleSearchSchema>;
export type RequestInputParsed = z.infer<typeof requestInputSchema>;
export type RequestActionParsed = z.infer<typeof requestActionSchema>;
export type AllocationActionParsed = z.infer<typeof allocationActionSchema>;
export type TransferInputParsed = z.infer<typeof transferInputSchema>;
export type TransferActionParsed = z.infer<typeof transferActionSchema>;
export type DeviceInputParsed = z.infer<typeof deviceInputSchema>;
export type DeviceActionParsed = z.infer<typeof deviceActionSchema>;
export type IngestPayloadParsed = z.infer<typeof ingestPayloadSchema>;
export type DocumentMetaParsed = z.infer<typeof documentMetaSchema>;
export type OperatorInputParsed = z.infer<typeof operatorInputSchema>;
export type OperatorActionParsed = z.infer<typeof operatorActionSchema>;

/** Flattens a ZodError into a short readable message for the API envelope. */
export function zodMessage(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return 'Invalid request payload.';
  const path = first.path.join('.');
  return path ? `${path}: ${first.message}` : first.message;
}

// ---------------------------------------------------------------------------
// Civic Spaces (spec files 01-12)
// ---------------------------------------------------------------------------

const zSpaceCategory = z.enum(['MEETING_ROOM', 'TRAINING_HALL', 'AUDITORIUM', 'OFFICE', 'COMMUNITY_HALL', 'STORE', 'OTHER']);
const zSpaceState = z.enum(['AVAILABLE', 'IDLE', 'RESTRICTED', 'RETIRED']);
const zDayKey = z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
const zHhMm = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const zSpaceOperatingHours = z.record(zDayKey, z.tuple([zHhMm, zHhMm]));

export const spaceFieldSchema = z.object({
  name: z.string().trim().min(2).max(160),
  category: zSpaceCategory,
  buildingOrCampus: z.string().trim().max(200).optional(),
  addressLine: z.string().trim().max(300).optional(),
  district: z.string().trim().max(80).optional(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  capacity: z.number().int().min(0).max(100000),
  areaSqft: z.number().int().min(0).nullish(),
  operationalState: zSpaceState.optional(),
  description: z.string().trim().max(2000).optional(),
  managerName: z.string().trim().max(120).optional(),
  contactOfficerName: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().max(20).optional(),
  amenities: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  accessibility: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  operatingHours: zSpaceOperatingHours.optional(),
  minBookingHours: z.number().int().min(1).max(24).optional(),
  maxBookingHours: z.number().int().min(1).max(72).optional(),
  bookingLeadDays: z.number().int().min(0).max(365).optional(),
  notes: z.string().trim().max(2000).optional()
});

export const spaceInputSchema = spaceFieldSchema;

export const spaceSearchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: zSpaceCategory.optional(),
  state: zSpaceState.optional(),
  minCapacity: z.coerce.number().int().min(0).optional(),
  from: isoDateNullable.optional(),
  to: isoDateNullable.optional(),
  availableOnly: z.coerce.boolean().optional()
});

export const spaceActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update'), patch: spaceFieldSchema.partial() }),
  z.object({ type: z.literal('setState'), state: zSpaceState, reason: z.string().trim().min(1).max(500) }),
  z.object({
    type: z.literal('raiseMaintenance'),
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    blocksBooking: z.boolean().optional()
  }),
  z.object({ type: z.literal('updateMaintenance'), ticketId: z.string().trim().min(1), status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']), resolutionNote: z.string().trim().max(2000).optional(), costInr: z.number().int().min(0).optional() })
]);

export const spaceBookingInputSchema = z.object({
  spaceId: z.string().trim().min(1),
  purpose: z.string().trim().min(3).max(500),
  attendees: z.number().int().min(1).max(100000).optional(),
  requestedForOrgId: z.string().trim().min(1).optional(),
  startAt: isoDate,
  endAt: isoDate
});

export const spaceBookingSearchSchema = z.object({
  scope: z.enum(['mine', 'review', 'space']).optional(),
  spaceId: z.string().trim().min(1).optional(),
  bucket: z.enum(['upcoming', 'pending', 'completed', 'cancelled', 'rejected']).optional()
});

export const spaceBookingActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('approve'), note: z.string().trim().max(2000).optional() }),
  z.object({ type: z.literal('reject'), reason: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal('cancel'), reason: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal('complete'), note: z.string().trim().max(2000).optional() }),
  z.object({ type: z.literal('relocate'), targetSpaceId: z.string().trim().min(1), reason: z.string().trim().max(500).optional() })
]);

const zSpaceRequestPayload = spaceFieldSchema.partial();

export const spaceRequestInputSchema = z.object({
  type: z.enum(['REGISTER', 'UPDATE']),
  spaceId: z.string().trim().min(1).optional(),
  payload: zSpaceRequestPayload
});

export const spaceRequestActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('startReview') }),
  z.object({ type: z.literal('requestInfo'), reason: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal('approve'), note: z.string().trim().max(2000).optional() }),
  z.object({ type: z.literal('reject'), reason: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal('withdraw') })
]);

export type SpaceInputParsed = z.infer<typeof spaceInputSchema>;
export type SpaceSearchParsed = z.infer<typeof spaceSearchSchema>;
export type SpaceActionParsed = z.infer<typeof spaceActionSchema>;
export type SpaceBookingInputParsed = z.infer<typeof spaceBookingInputSchema>;
export type SpaceBookingSearchParsed = z.infer<typeof spaceBookingSearchSchema>;
export type SpaceBookingActionParsed = z.infer<typeof spaceBookingActionSchema>;
export type SpaceRequestInputParsed = z.infer<typeof spaceRequestInputSchema>;
export type SpaceRequestActionParsed = z.infer<typeof spaceRequestActionSchema>;
