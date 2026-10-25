import 'server-only';

import { getFleetSnapshot } from '@/lib/cloud/fleet';
import { complianceItems } from '@/lib/fleet/compliance';
import type { AiSettings, CopilotAction } from '@/types/ai';
import type { FleetSnapshot, SessionUser, VehicleView } from '@/types';

/**
 * Builds the ONLY information a model ever sees: aggregates and asset codes from the caller's own scope.
 * Never included: driver names or phones, exact coordinates, document contents, other organizations' records.
 * Registration numbers are replaced by asset codes unless the administrator enabled shareRegistration.
 */
export interface AiContext {
  text: string;
  grounding: string[];
  snapshot: FleetSnapshot;
}

const label = (v: VehicleView, share: boolean) => (share ? `${v.assetCode} (${v.registrationNumber})` : v.assetCode);

export function describeVehicle(v: VehicleView, share: boolean): string {
  const reasons = (v.eligibilityReasons ?? []).filter((r) => r.blocking).map((r) => r.code).join(', ') || 'none';
  return [
    `${label(v, share)}: ${v.vehicleClass}, ${v.organizationName}`,
    `operational=${v.operationalStatus}`,
    `ownership=${v.ownershipCategory}`,
    `eligibility=${v.eligibilityState} (blocking reasons: ${reasons})`,
    `live-state=${v.status}`,
    `telemetry=${v.telemetryFreshness}${v.lastSeenAt ? ` (last event ${v.lastSeenAt})` : ''}`
  ].join('; ');
}

export async function buildAiContext(user: SessionUser, settings: AiSettings, question = ''): Promise<AiContext> {
  const snapshot = await getFleetSnapshot(user);
  const share = settings.shareRegistration;
  const vehicles = snapshot.vehicles ?? [];
  const allocations = snapshot.allocations ?? [];
  const requests = snapshot.requests ?? [];
  const incidents = (snapshot.incidents ?? []).filter((i) => i.status !== 'RESOLVED');
  const count = <T,>(list: T[], fn: (x: T) => boolean) => list.filter(fn).length;

  const overdue = allocations.filter((a) => a.lifecycle === 'ACTIVE' && (a.returnDue || a.overdueHours > 0));
  const pending = requests.filter((r) => r.state === 'SUBMITTED' || r.state === 'UNDER_REVIEW');
  let criticalDocs = 0;
  let vehiclesWithCritical = 0;
  for (const v of vehicles) {
    const n = complianceItems(v, snapshot.settings).filter((i) => i.severity === 'critical').length;
    criticalDocs += n;
    if (n) vehiclesWithCritical += 1;
  }

  const lines: string[] = [];
  lines.push(`Date/time now: ${new Date().toISOString()} (Asia/Kolkata local).`);
  lines.push(`Caller: role=${user.role}, organization-scope vehicles=${snapshot.vehicleTotal}.`);
  lines.push(
    `Eligibility: eligible=${count(vehicles, (v) => v.eligibilityState === 'ELIGIBLE')}, pending verification=${count(vehicles, (v) => v.eligibilityState === 'PENDING_VERIFICATION')}, restricted=${count(vehicles, (v) => v.eligibilityState === 'RESTRICTED')}, ineligible (e.g. seized)=${count(vehicles, (v) => v.eligibilityState === 'INELIGIBLE')}.`
  );
  lines.push(
    `Operational status: active=${count(vehicles, (v) => v.operationalStatus === 'ACTIVE')}, maintenance=${count(vehicles, (v) => v.operationalStatus === 'MAINTENANCE')}, out of service=${count(vehicles, (v) => v.operationalStatus === 'OUT_OF_SERVICE')}, retired=${count(vehicles, (v) => v.operationalStatus === 'RETIRED')}.`
  );
  lines.push(
    `Telemetry freshness (data age only; stale does NOT mean inactive or unavailable): fresh=${count(vehicles, (v) => v.telemetryFreshness === 'FRESH')}, stale=${count(vehicles, (v) => v.telemetryFreshness === 'STALE')}, no signal=${count(vehicles, (v) => v.telemetryFreshness === 'UNKNOWN')}. Simulated demo telemetry may be present.`
  );
  lines.push(
    `Requests: waiting for decision=${pending.length}, approved=${count(requests, (r) => r.state === 'APPROVED')}, rejected=${count(requests, (r) => r.state === 'REJECTED')}. Allocations: active=${count(allocations, (a) => a.lifecycle === 'ACTIVE')}, reserved=${count(allocations, (a) => a.lifecycle === 'RESERVED' || a.lifecycle === 'AWAITING_HANDOVER')}, awaiting inspection=${count(allocations, (a) => a.lifecycle === 'RETURNED_PENDING_INSPECTION')}, OVERDUE returns=${overdue.length}.`
  );
  if (overdue.length) lines.push(`Overdue allocations: ${overdue.slice(0, 8).map((a) => `${a.allocationCode} (${a.overdueHours}h overdue)`).join('; ')}.`);
  lines.push(`Compliance: ${vehiclesWithCritical} vehicles have an expired or critical document (${criticalDocs} documents).`);
  lines.push(`Open incidents: ${incidents.length}${incidents.length ? ` (types: ${[...new Set(incidents.map((i) => i.type))].join(', ')})` : ''}.`);

  const grounding = [`Fleet summary (${snapshot.vehicleTotal} vehicles in scope)`, `${requests.length} requests, ${allocations.length} allocations`];

  // If the question mentions asset codes (e.g. SCH-V-0126), include those vehicles' status. Own scope only.
  const codes = [...new Set((question.toUpperCase().match(/SCH-V-\d{3,5}/g) ?? []))].slice(0, 5);
  for (const code of codes) {
    const v = vehicles.find((x) => x.assetCode.toUpperCase() === code);
    if (v) {
      lines.push(`Vehicle ${describeVehicle(v, share)}.`);
      grounding.push(`Vehicle ${v.assetCode}`);
    } else {
      lines.push(`Vehicle ${code}: not found in the caller's scope (it may not exist or belongs to another organization).`);
    }
  }
  return { text: lines.join('\n'), grounding, snapshot };
}

/** Internal links the assistant may suggest. Derived from the question by rules, never from model output. */
export function suggestActions(question: string): CopilotAction[] {
  const q = question.toLowerCase();
  const out: CopilotAction[] = [];
  const add = (label: string, href: string) => {
    if (!out.some((a) => a.href === href)) out.push({ label, href });
  };
  if (/overdue|late return|not returned|return/.test(q)) add('Open overdue returns', '/allocations?tab=overdue');
  if (/approv|pending|decision|request/.test(q)) add('Requests needing a decision', '/requests?tab=needs');
  if (/complian|puc|insurance|fitness|expir/.test(q)) add('Compliance tracker', '/compliance');
  if (/stale|telemetry|gps|offline|signal/.test(q)) add('Operational views', '/operations');
  if (/available|borrow|need a|find a|discover|book/.test(q)) add('Discover available vehicles', '/vehicles/discover');
  if (/incident|sos|breakdown|accident/.test(q)) add('Incidents', '/incidents');
  if (/maint|service|repair/.test(q)) add('Maintenance', '/maintenance');
  if (/idle|reuse|unused/.test(q)) add('Idle and reuse', '/idle');
  if (/report|utili[sz]ation|statistic/.test(q)) add('Reports', '/reports');
  return out.slice(0, 4);
}
