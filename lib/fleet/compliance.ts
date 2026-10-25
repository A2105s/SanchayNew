import type { FleetSettings, VehicleView } from '@/types';

export type ComplianceSeverity = 'ok' | 'warning' | 'critical';

export interface ComplianceItem {
  document: 'PUC' | 'INSURANCE' | 'FITNESS';
  label: string;
  expiry: string | null;
  days: number | null;
  severity: ComplianceSeverity;
}

/** Whole days from now until `expiry` (negative => already expired). */
export function daysUntil(expiry: string | number | Date | null | undefined): number | null {
  if (expiry == null) return null;
  const date = expiry instanceof Date ? expiry : new Date(expiry);
  if (Number.isNaN(date.getTime())) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
}

/** Severity for a given day-count relative to the configured thresholds. */
export function severityOf(days: number | null, settings: FleetSettings): ComplianceSeverity {
  if (days == null) return 'critical'; // missing document is treated as critical
  if (days <= settings.complianceCriticalDays) return 'critical';
  if (days <= settings.complianceWarnDays) return 'warning';
  return 'ok';
}

const DOC_LABEL: Record<ComplianceItem['document'], string> = {
  PUC: 'PUC certificate',
  INSURANCE: 'Insurance',
  FITNESS: 'Fitness certificate'
};

/** Build the compliance checklist for a vehicle. */
export function complianceItems(vehicle: VehicleView, settings: FleetSettings): ComplianceItem[] {
  const specs: Array<{ document: ComplianceItem['document']; expiry: string | null }> = [
    { document: 'PUC', expiry: vehicle.pucExpiry },
    { document: 'INSURANCE', expiry: vehicle.insuranceExpiry },
    { document: 'FITNESS', expiry: vehicle.fitnessExpiry }
  ];
  return specs.map(({ document, expiry }) => {
    const days = daysUntil(expiry);
    return {
      document,
      label: DOC_LABEL[document],
      expiry,
      days,
      severity: severityOf(days, settings)
    };
  });
}
