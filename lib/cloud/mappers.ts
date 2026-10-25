import 'server-only';

import type {
  Allocation,
  ApprovalStep,
  AssetRequest,
  AuditLog,
  ExtensionRequest,
  FuelLog,
  HandoverRecord,
  IncidentReport,
  IotDevice,
  LegalRecord,
  MaintenanceRecord,
  Notification,
  Operator,
  Organization,
  ReturnRecord,
  Station,
  StationInventory,
  Trip,
  TransferRequest,
  Vehicle,
  VehicleDocument,
  VehicleOwnershipVerification,
  VehicleRestriction
} from '@prisma/client';
import type {
  AllocationView,
  ApprovalStepView,
  AssetRequestView,
  AuditEntryView,
  DeviceStatus,
  DeviceView,
  DeviceKind,
  DocumentView,
  EligibilityReason,
  ExtensionView,
  FuelLogView,
  GpsSource,
  HandoverRecordView,
  IncidentView,
  LegalRecordView,
  MaintenanceSeverity,
  MaintenanceStatus,
  MaintenanceView,
  NotificationView,
  OperatorView,
  OrganizationView,
  OwnershipCategory,
  OwnershipVerificationView,
  RestrictionView,
  ReturnRecordView,
  Role,
  Sector,
  StationView,
  TelemetryFreshness,
  TransferStatus,
  TransferView,
  TripView,
  VehicleClass,
  VehicleStatus,
  OperationalStatus,
  EligibilityState,
  VehicleView
} from '@/types';
import { maskRegistration } from '@/lib/auth/scope';

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const isoReq = (d: Date): string => d.toISOString();

export function emptyInventory(): Record<VehicleClass, number> {
  return { PATROL_CAR: 0, MOTORCYCLE: 0, VAN: 0, HEAVY: 0 };
}

export function inventoryToRecord(inv: StationInventory | null | undefined): Record<VehicleClass, number> {
  return {
    PATROL_CAR: inv?.patrolCar ?? 0,
    MOTORCYCLE: inv?.motorcycle ?? 0,
    VAN: inv?.van ?? 0,
    HEAVY: inv?.heavy ?? 0
  };
}

export const VEHICLE_CLASS_TO_INVENTORY_FIELD: Record<VehicleClass, 'patrolCar' | 'motorcycle' | 'van' | 'heavy'> = {
  PATROL_CAR: 'patrolCar',
  MOTORCYCLE: 'motorcycle',
  VAN: 'van',
  HEAVY: 'heavy'
};

export function mapOrganization(row: Organization): OrganizationView {
  return { id: row.id, code: row.code, name: row.name, kind: row.kind, parentId: row.parentId };
}

export function mapStation(row: Station & { inventory?: StationInventory | null }): StationView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    organizationId: row.organizationId,
    zone: row.zone,
    district: row.district,
    lat: row.lat,
    lng: row.lng,
    inchargeName: row.inchargeName,
    phone: row.phone,
    inventory: inventoryToRecord(row.inventory)
  };
}

/** Telemetry freshness derived from lastSeenAt against the configured thresholds. */
export function freshnessFor(lastSeenAt: Date | null, freshMinutes: number, now: Date = new Date()): TelemetryFreshness {
  if (!lastSeenAt) return 'UNKNOWN';
  const ageMin = (now.getTime() - lastSeenAt.getTime()) / 60000;
  return ageMin <= freshMinutes ? 'FRESH' : 'STALE';
}

export function mapVehicle(row: Vehicle, organizationName: string, freshMinutes = 10, duplicateOf: string[] = []): VehicleView {
  const reasons = (row.eligibilityReasons as unknown as EligibilityReason[] | null) ?? [];
  return {
    id: row.id,
    assetCode: row.assetCode,
    registrationNumber: row.registrationNumber,
    registrationNormalized: row.registrationNormalized,
    displayName: row.displayName,
    sector: row.sector as Sector,
    vehicleClass: row.vehicleClass as VehicleClass,
    vehicleType: row.vehicleType,
    organizationId: row.organizationId,
    organizationName,
    managingUnit: row.managingUnit,
    stationId: row.stationId,
    driverName: row.driverName,
    driverPhone: row.driverPhone,
    status: row.status as VehicleStatus,
    operationalStatus: row.operationalStatus as OperationalStatus,
    ownershipCategory: row.ownershipCategory as OwnershipCategory,
    eligibilityState: row.eligibilityState as EligibilityState,
    eligibilityReasons: reasons,
    eligibilityPolicyVersion: row.eligibilityPolicyVersion,
    eligibilityEvaluatedAt: iso(row.eligibilityEvaluatedAt),
    makeModel: row.makeModel,
    year: row.year,
    fuelType: row.fuelType,
    seating: row.seating,
    color: row.color,
    chassisNumber: row.chassisNumber,
    engineNumber: row.engineNumber,
    odometerKm: row.odometerKm,
    gpsSource: row.gpsSource as GpsSource,
    lat: row.lat,
    lng: row.lng,
    speedKmph: row.speedKmph,
    heading: row.heading,
    ignition: row.ignition,
    fuelPercent: row.fuelPercent,
    lastSeenAt: iso(row.lastSeenAt),
    lastIngestedAt: iso(row.lastIngestedAt),
    telemetryFreshness: freshnessFor(row.lastSeenAt, freshMinutes),
    idleSince: iso(row.idleSince),
    pucExpiry: iso(row.pucExpiry),
    insuranceExpiry: iso(row.insuranceExpiry),
    fitnessExpiry: iso(row.fitnessExpiry),
    maintenanceRisk: row.maintenanceRisk,
    hoursWeek: row.hoursWeek,
    photoUrl: row.photoPath,
    notes: row.notes,
    createdAt: isoReq(row.createdAt),
    updatedAt: isoReq(row.updatedAt),
    duplicateOf
  };
}

export { maskRegistration };

export function mapOwnership(row: VehicleOwnershipVerification): OwnershipVerificationView {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    category: row.category as OwnershipCategory,
    status: row.status as OwnershipVerificationView['status'],
    evidenceRef: row.evidenceRef,
    evidenceNote: row.evidenceNote,
    submittedBy: row.submittedBy,
    verifiedBy: row.verifiedBy,
    verifiedAt: iso(row.verifiedAt),
    rejectionNote: row.rejectionNote,
    createdAt: isoReq(row.createdAt)
  };
}

export function mapRestriction(row: VehicleRestriction, now: Date = new Date()): RestrictionView {
  const active = row.liftedAt === null && (row.expiresAt === null || row.expiresAt.getTime() > now.getTime());
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    type: row.type as RestrictionView['type'],
    reasonCode: row.reasonCode,
    description: row.description,
    evidenceRef: row.evidenceRef,
    authority: row.authority,
    decidedBy: row.decidedBy,
    decidedAt: isoReq(row.decidedAt),
    reviewAt: iso(row.reviewAt),
    expiresAt: iso(row.expiresAt),
    liftedAt: iso(row.liftedAt),
    liftedBy: row.liftedBy,
    liftReason: row.liftReason,
    active
  };
}

export function mapDocument(row: VehicleDocument): DocumentView {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    kind: row.kind as DocumentView['kind'],
    title: row.title,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    expiresAt: iso(row.expiresAt),
    createdAt: isoReq(row.createdAt)
  };
}

export function mapTrip(row: Trip): TripView {
  return {
    id: row.id,
    tripCode: row.tripCode,
    vehicleId: row.vehicleId,
    driverName: row.driverName,
    purpose: row.purpose,
    status: row.status as TripView['status'],
    startedAt: isoReq(row.startedAt),
    endedAt: iso(row.endedAt),
    startAddress: row.startAddress,
    endAddress: row.endAddress,
    startOdometer: row.startOdometer,
    endOdometer: row.endOdometer,
    distanceKm: row.distanceKm,
    durationMin: row.durationMin,
    fuelLiters: row.fuelLiters,
    allocationId: row.allocationId
  };
}

export function mapMaintenance(row: MaintenanceRecord): MaintenanceView {
  return {
    id: row.id,
    ticketCode: row.ticketCode,
    vehicleId: row.vehicleId,
    title: row.title,
    severity: row.severity as MaintenanceSeverity,
    status: row.status as MaintenanceStatus,
    dueDate: iso(row.dueDate),
    windowStart: iso(row.windowStart),
    windowEnd: iso(row.windowEnd),
    blocksAvailability: row.blocksAvailability,
    completedAt: iso(row.completedAt),
    odometerKm: row.odometerKm,
    costInr: row.costInr,
    vendor: row.vendor,
    notes: row.notes,
    raisedBy: row.raisedBy,
    createdAt: isoReq(row.createdAt)
  };
}

export function mapLegal(row: LegalRecord): LegalRecordView {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    type: row.type as LegalRecordView['type'],
    referenceNo: row.referenceNo,
    date: isoReq(row.date),
    description: row.description,
    status: row.status as LegalRecordView['status'],
    amountInr: row.amountInr,
    nextActionAt: iso(row.nextActionAt),
    authority: row.authority
  };
}

export function mapIncident(row: IncidentReport): IncidentView {
  return {
    id: row.id,
    incidentCode: row.incidentCode,
    vehicleId: row.vehicleId,
    type: row.type as IncidentView['type'],
    severity: row.severity as IncidentView['severity'],
    message: row.message,
    reporterName: row.reporterName,
    lat: row.lat,
    lng: row.lng,
    offlineCaptured: row.offlineCaptured,
    status: row.status as IncidentView['status'],
    acknowledgedBy: row.acknowledgedBy,
    resolvedBy: row.resolvedBy,
    resolvedAt: iso(row.resolvedAt),
    createdAt: isoReq(row.createdAt)
  };
}

export function mapFuelLog(row: FuelLog): FuelLogView {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    liters: row.liters,
    costInr: row.costInr,
    odometerKm: row.odometerKm,
    source: row.source as FuelLogView['source'],
    loggedBy: row.loggedBy,
    loggedAt: isoReq(row.loggedAt)
  };
}

export function mapApprovalStep(row: ApprovalStep, orgName: string): ApprovalStepView {
  return {
    id: row.id,
    requestId: row.requestId,
    stepOrder: row.stepOrder,
    approverOrgId: row.approverOrgId,
    approverOrgName: orgName,
    decision: row.decision as ApprovalStepView['decision'],
    decidedBy: row.decidedBy,
    decidedByRole: row.decidedByRole,
    comment: row.comment,
    decidedAt: iso(row.decidedAt)
  };
}

export interface RequestMapOptions {
  requestingOrgName: string;
  vehicleOrgName: string | null;
  vehicleLabel: string | null;
  steps: ApprovalStepView[];
  allocationId: string | null;
}

export function mapRequest(row: AssetRequest, opts: RequestMapOptions): AssetRequestView {
  return {
    id: row.id,
    requestCode: row.requestCode,
    requestingOrgId: row.requestingOrgId,
    requestingOrgName: opts.requestingOrgName,
    requesterUsername: row.requesterUsername,
    requesterName: row.requesterName,
    vehicleId: row.vehicleId,
    vehicleLabel: opts.vehicleLabel,
    vehicleOrgName: opts.vehicleOrgName,
    requestedClass: row.requestedClass as VehicleClass,
    purpose: row.purpose,
    destination: row.destination,
    passengers: row.passengers,
    startAt: isoReq(row.startAt),
    endAt: isoReq(row.endAt),
    accountableOfficer: row.accountableOfficer,
    accountablePhone: row.accountablePhone,
    contactPhone: row.contactPhone,
    state: row.state as AssetRequestView['state'],
    approverOrgId: row.approverOrgId,
    submittedAt: iso(row.submittedAt),
    decidedAt: iso(row.decidedAt),
    decisionReason: row.decisionReason,
    steps: opts.steps,
    allocationId: opts.allocationId,
    createdAt: isoReq(row.createdAt),
    updatedAt: isoReq(row.updatedAt)
  };
}

export function mapHandover(row: HandoverRecord): HandoverRecordView {
  return {
    id: row.id,
    allocationId: row.allocationId,
    handedOverBy: row.handedOverBy,
    receivedBy: row.receivedBy,
    conditionNotes: row.conditionNotes,
    odometerKm: row.odometerKm,
    fuelPercent: row.fuelPercent,
    checklist: (row.checklist as unknown as { item: string; present: boolean }[]) ?? [],
    evidenceRef: row.evidenceRef,
    acknowledgedAt: isoReq(row.acknowledgedAt)
  };
}

export function mapReturn(row: ReturnRecord): ReturnRecordView {
  return {
    id: row.id,
    allocationId: row.allocationId,
    returnedBy: row.returnedBy,
    receivedBy: row.receivedBy,
    returnedAt: isoReq(row.returnedAt),
    conditionNotes: row.conditionNotes,
    odometerKm: row.odometerKm,
    fuelPercent: row.fuelPercent,
    discrepancies: row.discrepancies,
    evidenceRef: row.evidenceRef,
    inspectionRequired: row.inspectionRequired,
    inspectionStatus: row.inspectionStatus as ReturnRecordView['inspectionStatus'],
    inspectedBy: row.inspectedBy,
    inspectedAt: iso(row.inspectedAt),
    inspectionNotes: row.inspectionNotes
  };
}

export function mapExtension(row: ExtensionRequest): ExtensionView {
  return {
    id: row.id,
    allocationId: row.allocationId,
    requestedBy: row.requestedBy,
    newEndAt: isoReq(row.newEndAt),
    reason: row.reason,
    status: row.status as ExtensionView['status'],
    decidedBy: row.decidedBy,
    decidedAt: iso(row.decidedAt),
    decisionNote: row.decisionNote,
    createdAt: isoReq(row.createdAt)
  };
}

export interface AllocationMapOptions {
  vehicleLabel: string;
  handover: HandoverRecordView | null;
  returnRecord: ReturnRecordView | null;
  extensions: ExtensionView[];
  graceMinutes: number;
  now?: Date;
}

export function mapAllocation(row: Allocation, opts: AllocationMapOptions): AllocationView {
  const now = opts.now ?? new Date();
  const overdue = row.lifecycle === 'ACTIVE' && now.getTime() > row.endAt.getTime() + opts.graceMinutes * 60000;
  const overdueHours = overdue ? Math.floor((now.getTime() - row.endAt.getTime()) / 3600000) : 0;
  return {
    id: row.id,
    allocationCode: row.allocationCode,
    requestId: row.requestId,
    vehicleId: row.vehicleId,
    vehicleLabel: opts.vehicleLabel,
    startAt: isoReq(row.startAt),
    endAt: isoReq(row.endAt),
    lifecycle: row.lifecycle as AllocationView['lifecycle'],
    returnDue: overdue,
    overdueHours,
    holdReason: row.holdReason,
    cancelReason: row.cancelReason,
    handover: opts.handover,
    returnRecord: opts.returnRecord,
    extensions: opts.extensions,
    createdAt: isoReq(row.createdAt)
  };
}

export function transferCountsToRecord(row: TransferRequest): Record<VehicleClass, number> {
  return { PATROL_CAR: row.patrolCar, MOTORCYCLE: row.motorcycle, VAN: row.van, HEAVY: row.heavy };
}

export function mapTransfer(row: TransferRequest): TransferView {
  return {
    id: row.id,
    transferCode: row.transferCode,
    requesterStationId: row.requesterStationId,
    sourceStationId: row.sourceStationId,
    destinationStationId: row.destinationStationId,
    requestedBy: row.requestedBy,
    startAt: isoReq(row.startAt),
    endAt: isoReq(row.endAt),
    counts: transferCountsToRecord(row),
    purpose: row.purpose,
    comments: row.comments,
    status: row.status as TransferStatus,
    reviewedBy: row.reviewedBy,
    reviewedAt: iso(row.reviewedAt),
    rejectionReason: row.rejectionReason,
    completedBy: row.completedBy,
    completedAt: iso(row.completedAt),
    createdAt: isoReq(row.createdAt)
  };
}

export function mapDevice(row: IotDevice): DeviceView {
  return {
    id: row.id,
    deviceCode: row.deviceCode,
    kind: row.kind as DeviceKind,
    vehicleId: row.vehicleId,
    protocol: row.protocol as DeviceView['protocol'],
    status: row.status as DeviceStatus,
    simulated: row.simulated,
    hasIngestKey: Boolean(row.ingestKeyHash),
    ingestKeyPrefix: row.ingestKeyPrefix,
    firmware: row.firmware,
    batteryPct: row.batteryPct,
    signalDbm: row.signalDbm,
    lastSeenAt: iso(row.lastSeenAt),
    provisionedAt: iso(row.provisionedAt),
    notes: row.notes
  };
}

export function mapNotification(row: Notification): NotificationView {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    readAt: iso(row.readAt),
    createdAt: isoReq(row.createdAt)
  };
}

export function mapAudit(row: AuditLog): AuditEntryView {
  return {
    id: row.id,
    seq: row.seq,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    fieldName: row.fieldName,
    oldValue: row.oldValue,
    newValue: row.newValue,
    performedBy: row.performedBy,
    performedByRole: row.performedByRole,
    organizationId: row.organizationId,
    correlationId: row.correlationId,
    outcome: row.outcome as AuditEntryView['outcome'],
    performedAt: isoReq(row.performedAt),
    reason: row.reason,
    prevHash: row.prevHash,
    hash: row.hash
  };
}

export function mapOperator(row: Operator): OperatorView {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    phone: row.phone,
    role: row.role as Role,
    organizationId: row.organizationId,
    stationId: row.stationId,
    active: row.active,
    lastLoginAt: iso(row.lastLoginAt)
  };
}
