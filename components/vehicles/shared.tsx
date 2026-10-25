'use client';

import { Badge } from '@/components/ui/Badge';
import { StatusDot } from '@/components/ui/StatusDot';
import type { FleetSettings, VehicleStatus, VehicleView } from '@/types';
import { STATUS_LABEL, statusTone } from '@/lib/fleet/format';
import { complianceItems } from '@/lib/fleet/compliance';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

/** Map a live motion status to a StatusDot/Badge tone. */
export function toneForStatus(status: VehicleStatus): Tone {
  try {
    const t = statusTone(status) as Tone;
    if (t) return t;
  } catch {
    /* lib helper may be unavailable during parallel build */
  }
  switch (status) {
    case 'MOVING':
      return 'success';
    case 'IDLE':
      return 'warning';
    case 'BREAKDOWN':
      return 'danger';
    case 'OFFLINE':
    default:
      return 'neutral';
  }
}

/** Live motion status (telemetry-derived) — NOT operational status or availability. */
export function StatusBadge({ status, pulse }: { status: VehicleStatus; pulse?: boolean }) {
  const tone = toneForStatus(status);
  const label = STATUS_LABEL?.[status] ?? status;
  return <StatusDot tone={tone} label={label} pulse={pulse && status === 'MOVING'} />;
}

export type ComplianceState = 'ok' | 'expiring' | 'expired' | 'none';

/** Worst compliance state across PUC / insurance / fitness. */
export function worstCompliance(vehicle: VehicleView, settings?: FleetSettings): ComplianceState {
  if (!settings) return worstComplianceRaw(vehicle, settings);
  try {
    const items = complianceItems(vehicle, settings);
    if (!items || items.length === 0) return 'none';
    let worst: ComplianceState = 'ok';
    for (const it of items) {
      if (it.expiry == null) continue; // a missing optional doc is not automatically "expired" here
      if (it.severity === 'critical') return 'expired';
      if (it.severity === 'warning') worst = 'expiring';
    }
    return worst;
  } catch {
    return worstComplianceRaw(vehicle, settings);
  }
}

function worstComplianceRaw(vehicle: VehicleView, settings?: FleetSettings): ComplianceState {
  const warn = settings?.complianceWarnDays ?? 30;
  const dates = [vehicle.pucExpiry, vehicle.insuranceExpiry, vehicle.fitnessExpiry].filter(Boolean) as string[];
  if (dates.length === 0) return 'none';
  const now = Date.now();
  let worst: ComplianceState = 'ok';
  for (const d of dates) {
    const diffDays = (new Date(d).getTime() - now) / 86_400_000;
    if (diffDays < 0) return 'expired';
    if (diffDays <= warn) worst = 'expiring';
  }
  return worst;
}

export function ComplianceBadge({ vehicle, settings }: { vehicle: VehicleView; settings?: FleetSettings }) {
  const state = worstCompliance(vehicle, settings);
  const map: Record<ComplianceState, { tone: Tone; label: string }> = {
    ok: { tone: 'success', label: 'Compliant' },
    expiring: { tone: 'warning', label: 'Expiring' },
    expired: { tone: 'danger', label: 'Expired' },
    none: { tone: 'neutral', label: 'No records' }
  };
  const { tone, label } = map[state];
  return <Badge tone={tone}>{label}</Badge>;
}

export function UtilizationBar({ hoursWeek }: { hoursWeek: number }) {
  const maxHours = 60;
  const pct = Math.max(0, Math.min(100, Math.round((hoursWeek / maxHours) * 100)));
  const mod = pct >= 90 ? 'veh-util-fill--danger' : pct >= 70 ? 'veh-util-fill--warning' : '';
  return (
    <div className="veh-util" title={`${hoursWeek.toFixed(1)}h this week`}>
      <div className="veh-util-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`veh-util-fill ${mod}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="veh-util-label">{hoursWeek.toFixed(1)}h</span>
    </div>
  );
}

/** Simple SVG radial gauge for risk / fuel 0-100. */
export function RadialGauge({
  value,
  label,
  max = 100,
  unit = '',
  invertColor = false
}: {
  value: number;
  label?: string;
  max?: number;
  unit?: string;
  invertColor?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const dash = circ * pct;
  const good = invertColor ? pct < 0.4 : pct > 0.6;
  const mid = pct >= 0.4 && pct <= 0.7;
  const color = good ? 'var(--success, #16a34a)' : mid ? 'var(--warning, #d97706)' : 'var(--danger, #dc2626)';
  return (
    <div className="veh-gauge">
      <svg viewBox="0 0 100 100" width="96" height="96" role="img" aria-label={`${label ?? 'Gauge'}: ${value}${unit}`}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--track, #e5e9f0)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="54" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--text, #1f2933)">
          {Math.round(value)}
          {unit}
        </text>
      </svg>
      {label ? <span className="veh-gauge-label">{label}</span> : null}
    </div>
  );
}
