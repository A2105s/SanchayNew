import type { FleetSettings } from '@/types';

/** Domain-level error carrying an HTTP status and an optional stable machine code. */
export class DomainError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
    this.code = code;
  }
}

export const FLEET_SETTINGS_KEY = 'fleet_settings';

/** All operational thresholds (spec 17: configuration, never scattered constants). */
export const DEFAULT_FLEET_SETTINGS: FleetSettings = {
  idleThresholdHours: 72,
  complianceWarnDays: 30,
  complianceCriticalDays: 7,
  telemetryFreshMinutes: 10,
  telemetryOfflineMinutes: 60,
  eligibilityPolicyVersion: 'v1',
  requestExpiryHours: 72,
  returnGraceMinutes: 120,
  exportRowLimit: 5000,
  maxBookingHorizonDays: 180,
  requireInspectionOnReturn: true,
  allowSelfApproval: false
};

export function mergeFleetSettings(raw: unknown): FleetSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FLEET_SETTINGS };
  const r = raw as Partial<FleetSettings>;
  return {
    idleThresholdHours: numberOr(r.idleThresholdHours, DEFAULT_FLEET_SETTINGS.idleThresholdHours),
    complianceWarnDays: numberOr(r.complianceWarnDays, DEFAULT_FLEET_SETTINGS.complianceWarnDays),
    complianceCriticalDays: numberOr(r.complianceCriticalDays, DEFAULT_FLEET_SETTINGS.complianceCriticalDays),
    telemetryFreshMinutes: numberOr(r.telemetryFreshMinutes, DEFAULT_FLEET_SETTINGS.telemetryFreshMinutes),
    telemetryOfflineMinutes: numberOr(r.telemetryOfflineMinutes, DEFAULT_FLEET_SETTINGS.telemetryOfflineMinutes),
    eligibilityPolicyVersion: stringOr(r.eligibilityPolicyVersion, DEFAULT_FLEET_SETTINGS.eligibilityPolicyVersion),
    requestExpiryHours: numberOr(r.requestExpiryHours, DEFAULT_FLEET_SETTINGS.requestExpiryHours),
    returnGraceMinutes: numberOr(r.returnGraceMinutes, DEFAULT_FLEET_SETTINGS.returnGraceMinutes),
    exportRowLimit: numberOr(r.exportRowLimit, DEFAULT_FLEET_SETTINGS.exportRowLimit),
    maxBookingHorizonDays: numberOr(r.maxBookingHorizonDays, DEFAULT_FLEET_SETTINGS.maxBookingHorizonDays),
    requireInspectionOnReturn: boolOr(r.requireInspectionOnReturn, DEFAULT_FLEET_SETTINGS.requireInspectionOnReturn),
    allowSelfApproval: boolOr(r.allowSelfApproval, DEFAULT_FLEET_SETTINGS.allowSelfApproval)
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
