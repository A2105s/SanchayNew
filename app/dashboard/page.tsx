'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useActiveModule } from '@/lib/client/useModule';
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  FileWarning,
  KeyRound,
  Plus,
  Radio,
  Recycle,
  ShieldAlert,
  Siren,
  Timer,
  WifiOff
} from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { api } from '@/lib/client/api';
import { complianceItems } from '@/lib/fleet/compliance';
import { isReuseCandidate } from '@/lib/fleet/idle';
import { fmtRelative } from '@/lib/fleet/format';
import { greeting, todayLong, tripsPerDay, needsMyDecision, isOverdueReturn, orgTreeIds, canReviewTransfer } from '@/components/ops/shared';
import { AttentionList, QuickAction, type AttnItem } from '@/components/ops/DashParts';
import {
  AnalyticsSkeleton,
  BarTrend,
  CardLink,
  ChartCard,
  DonutChart,
  EmptyState,
  KpiCard,
  RankedList,
  SectionHeading,
  buildDelta,
  type DonutDatum,
  type RankedListItem
} from '@/components/analytics/AnalyticsKit';
import { PageTitle } from '@/components/ui/PageTitle';
import { AiPulseSlot } from '@/components/ai/AiPulseSlot';
import { Badge } from '@/components/ui/Badge';
import type { AuditEntryView, Role } from '@/types';

const PERIODS = [14, 30, 90] as const;

const ROLE_FOCUS: Record<Role, string> = {
  ADMIN: 'Platform oversight: configuration, audit and aggregate health.',
  ORG_ADMIN: 'Your organization: fleet registry, ownership verification and devices.',
  DEPT_OFFICER: 'Decisions waiting for you, returns due and compliance across your departments.',
  STATION_OFFICER: 'Your station: vehicles, handovers, returns and requests.',
  FIELD_STAFF: 'Your vehicles and trips. Report incidents as they happen.',
  AUDITOR: 'Read-only oversight of fleet posture and the audit ledger.'
};

interface ActivityPayload {
  audit?: AuditEntryView[];
}

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const activeModule = useActiveModule(pathname);
  const { snapshot, loading, error, can, me } = useFleet();
  const [days, setDays] = useState<number>(14);
  const [activity, setActivity] = useState<AuditEntryView[] | null>(null);

  const isSpacesMode =
    activeModule === 'spaces' ||
    ['spaces.admin', 'dept.spaces', 'spaces.pwd'].includes(me?.username?.toLowerCase() ?? '');

  useEffect(() => {
    if (isSpacesMode) {
      router.replace('/spaces');
    }
  }, [isSpacesMode, router]);

  useEffect(() => {
    if (!me || !can('audit.read')) return;
    let cancelled = false;
    api
      .get<ActivityPayload>('/api/cloud/activity?limit=8')
      .then((data) => {
        if (!cancelled) setActivity(data.audit ?? []);
      })
      .catch(() => {
        if (!cancelled) setActivity([]);
      });
    return () => {
      cancelled = true;
    };
  }, [me, can]);

  const model = useMemo(() => {
    if (!snapshot || !me) return null;
    const vehicles = snapshot.vehicles ?? [];
    const requests = snapshot.requests ?? [];
    const allocations = snapshot.allocations ?? [];
    const transfers = snapshot.transfers ?? [];
    const incidents = snapshot.incidents ?? [];
    const devices = snapshot.devices ?? [];
    const trips = snapshot.trips ?? [];
    const stations = snapshot.stations ?? [];
    const settings = snapshot.settings;
    const orgIds = orgTreeIds(me, snapshot.organizations ?? []);
    const now = Date.now();

    const busyNow = new Set(
      allocations
        .filter((a) => ['RESERVED', 'AWAITING_HANDOVER', 'ACTIVE', 'INCIDENT_HOLD'].includes(a.lifecycle) && Date.parse(a.startAt) <= now && Date.parse(a.endAt) >= now)
        .map((a) => a.vehicleId)
    );
    const eligible = vehicles.filter((v) => v.eligibilityState === 'ELIGIBLE' && v.operationalStatus === 'ACTIVE');
    const availableNow = eligible.filter((v) => !busyNow.has(v.id));
    const fresh = vehicles.filter((v) => v.telemetryFreshness === 'FRESH').length;
    const stale = vehicles.filter((v) => v.telemetryFreshness === 'STALE').length;
    const unknown = vehicles.length - fresh - stale;
    const restricted = vehicles.filter((v) => v.eligibilityState !== 'ELIGIBLE');
    const pendingOwnership = vehicles.filter((v) => v.eligibilityState === 'PENDING_VERIFICATION');
    const decisions = requests.filter((r) => needsMyDecision(me, r, orgIds)).length;
    const transferDecisions = transfers.filter((t) => canReviewTransfer(me, t, can('transfer.review'))).length;
    const overdue = allocations.filter(isOverdueReturn);
    const active = allocations.filter((a) => a.lifecycle === 'ACTIVE');
    const openIncidents = incidents.filter((i) => i.status !== 'RESOLVED');
    const sos = openIncidents.filter((i) => i.type === 'SOS' || i.severity === 'CRITICAL');

    let compliant = 0;
    let criticalDocs = 0;
    for (const v of vehicles) {
      const items = complianceItems(v, settings);
      const crit = items.filter((i) => i.severity === 'critical').length;
      criticalDocs += crit;
      if (crit === 0) compliant += 1;
    }
    const compliancePct = vehicles.length ? Math.round((compliant / vehicles.length) * 100) : null;

    const reuse = vehicles.filter((v) => isReuseCandidate(v)).length;
    const offline = devices.filter((d) => d.status === 'OFFLINE' || d.status === 'STALE').length;

    // trend: trips per day for the selected period + previous period for the delta chip
    const series = tripsPerDay(trips, days);
    const prevTotal = (() => {
      const cutoffStart = now - days * 2 * 86_400_000;
      const cutoffEnd = now - days * 86_400_000;
      return trips.filter((t) => {
        const ts = Date.parse(t.startedAt);
        return ts >= cutoffStart && ts < cutoffEnd;
      }).length;
    })();
    const total = series.reduce((s, p) => s + p.count, 0);

    const composition: DonutDatum[] = [
      { label: 'Eligible', count: vehicles.filter((v) => v.eligibilityState === 'ELIGIBLE').length, color: '#16a34a', href: '/vehicles?eligibility=ELIGIBLE' },
      { label: 'Pending verification', count: pendingOwnership.length, color: '#d97706', href: '/vehicles?eligibility=PENDING_VERIFICATION' },
      { label: 'Restricted', count: vehicles.filter((v) => v.eligibilityState === 'RESTRICTED').length, color: '#dc2626', href: '/vehicles?eligibility=RESTRICTED' },
      { label: 'Not eligible (e.g. seized)', count: vehicles.filter((v) => v.eligibilityState === 'INELIGIBLE').length, color: '#64748b', href: '/vehicles?eligibility=INELIGIBLE' }
    ];

    const pipelineStates = ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'] as const;
    const pipeline: RankedListItem[] = pipelineStates.map((state) => {
      const count = requests.filter((r) => r.state === state).length;
      return {
        label: state.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
        count,
        percent: requests.length ? Math.round((count / requests.length) * 100) : 0,
        href: `/requests?state=${state}`,
        marker: 'dot' as const,
        color: state === 'REJECTED' ? '#dc2626' : state === 'APPROVED' ? '#16a34a' : '#2563eb'
      };
    });

    const byStation = new Map<string, { name: string; total: number; moving: number }>();
    for (const s of stations) byStation.set(s.id, { name: s.name.replace(/ Police Station$/, ''), total: 0, moving: 0 });
    for (const v of vehicles) {
      const e = v.stationId ? byStation.get(v.stationId) : undefined;
      if (e) {
        e.total += 1;
        if (v.status === 'MOVING') e.moving += 1;
      }
    }
    const ranked = [...byStation.values()].filter((s) => s.total > 0).sort((a, b) => b.total - a.total).slice(0, 8);
    const maxTotal = ranked[0]?.total ?? 1;
    const stationRank: RankedListItem[] = ranked.map((s) => ({
      label: s.name,
      count: s.total,
      percent: Math.round((s.total / maxTotal) * 100),
      detail: `${s.moving} moving now`
    }));

    const attention: AttnItem[] = [];
    if (overdue.length) attention.push({ id: 'overdue', tone: 'danger', icon: <Timer size={16} />, title: 'Overdue returns', detail: 'Active allocations past their end time', count: overdue.length, href: '/allocations?tab=overdue' });
    if (decisions + transferDecisions) attention.push({ id: 'decisions', tone: 'warning', icon: <ClipboardCheck size={16} />, title: 'Decisions waiting for you', detail: 'Requests and station transfers', count: decisions + transferDecisions, href: decisions ? '/requests?tab=decide' : '/transfers' });
    if (sos.length) attention.push({ id: 'sos', tone: 'danger', icon: <Siren size={16} />, title: 'Open SOS / critical incidents', detail: 'Acknowledge and resolve', count: sos.length, href: '/incidents' });
    if (criticalDocs) attention.push({ id: 'compliance', tone: 'danger', icon: <FileWarning size={16} />, title: 'Expired or critical compliance documents', detail: 'PUC, insurance or fitness', count: criticalDocs, href: '/compliance' });
    if (pendingOwnership.length) attention.push({ id: 'ownership', tone: 'warning', icon: <ShieldAlert size={16} />, title: 'Vehicles awaiting ownership verification', detail: 'Not allocatable until verified', count: pendingOwnership.length, href: '/vehicles?eligibility=PENDING_VERIFICATION' });
    if (reuse) attention.push({ id: 'reuse', tone: 'info', icon: <Recycle size={16} />, title: 'Idle vehicles that could be reused', detail: `Idle beyond ${settings.idleThresholdHours} h`, count: reuse, href: '/idle' });
    if (stale || offline) attention.push({ id: 'stale', tone: 'info', informational: true, icon: <WifiOff size={16} />, title: 'Stale telemetry or offline devices', detail: 'Informational: stale data does not mean a vehicle is inactive or unavailable', count: Math.max(stale, offline), href: '/operations' });

    return {
      vehicles, requests, transfers, orgIds,
      availableNow: availableNow.length,
      eligible: eligible.length,
      fresh, stale, unknown,
      restricted: restricted.length,
      decisions: decisions + transferDecisions,
      active: active.length,
      overdue: overdue.length,
      openIncidents: openIncidents.length,
      compliancePct, criticalDocs,
      series, total, prevTotal,
      composition, pipeline, stationRank, attention,
      deviceCount: devices.length, offline
    };
  }, [snapshot, me, can, days]);

  if (isSpacesMode) {
    return (
      <div className="page stack" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted">Redirecting to Civic Spaces overview…</p>
      </div>
    );
  }

  if (loading && !snapshot) {
    return (
      <div className="page">
        <PageTitle title="Dashboard" />
        <AnalyticsSkeleton />
      </div>
    );
  }
  if (error && !snapshot) {
    return (
      <div className="page">
        <PageTitle title="Dashboard" />
        <EmptyState label={`Could not load the dashboard: ${error}`} />
      </div>
    );
  }
  if (!snapshot || !me || !model) {
    return (
      <div className="page">
        <PageTitle title="Dashboard" />
        <AnalyticsSkeleton />
      </div>
    );
  }

  const total = model.vehicles.length;
  const delta = buildDelta(model.total, model.prevTotal);

  return (
    <div className="page">
      <PageTitle title={`${greeting()}, ${me.displayName}`} description={`${todayLong()}. ${ROLE_FOCUS[me.role]}`} />

      <div className="an-dashboard">
        <section className="an-kpis" aria-label="Dashboard metrics">
          <KpiCard label="Fleet in scope" value={snapshot.vehicleTotal.toLocaleString('en-IN')} tone="brand" hint={`${model.eligible} eligible government-fleet`} detail="Your organization and sub-units" href="/vehicles" />
          <KpiCard label="Available now" value={model.availableNow.toLocaleString('en-IN')} tone="success" hint="Eligible, active, not reserved" detail="Seized and unverified vehicles are never counted" href="/vehicles/discover" />
          <KpiCard label="Pending decisions" value={model.decisions.toLocaleString('en-IN')} tone={model.decisions ? 'warning' : 'success'} hint="Requests and transfers for you" href={model.decisions ? '/requests?tab=decide' : '/requests'} />
          <KpiCard label="Overdue returns" value={model.overdue.toLocaleString('en-IN')} tone={model.overdue ? 'danger' : 'success'} hint={`${model.active} allocations in use`} href="/allocations?tab=overdue" />
        </section>
        <section className="an-kpis" aria-label="Fleet posture">
          <KpiCard label="Compliance health" value={model.compliancePct == null ? 'No data' : `${model.compliancePct}%`} tone={model.compliancePct != null && model.compliancePct < 70 ? 'danger' : 'info'} hint={`${model.criticalDocs} critical documents`} detail="Vehicles with no expired or critical document" href="/compliance" />
          <KpiCard label="Open incidents" value={model.openIncidents.toLocaleString('en-IN')} tone={model.openIncidents ? 'danger' : 'success'} hint="Not yet resolved" href="/incidents" />
          <KpiCard label="Restricted or unverified" value={model.restricted.toLocaleString('en-IN')} tone="warning" hint="Not allocatable" detail="Ownership, custody or safety review" href="/vehicles?eligibility=PENDING_VERIFICATION" />
          <KpiCard label="Telemetry freshness" value={`${model.fresh}/${total || 0}`} tone="info" hint={`${model.stale} stale, ${model.unknown} no signal`} detail="Stale does not mean inactive or unavailable" href="/operations" />
        </section>

        {/* AI pulse is mounted here by the AI module when present */}
        <AiPulseSlot />

        <SectionHeading title="Needs attention" description="Ranked by operational impact" />
        <div className="an-row an-row--main">
          <ChartCard title="Action list" subtitle="Everything that needs a person, most urgent first" footer={<CardLink href="/operations">Open operational views</CardLink>}>
            {model.attention.length ? <AttentionList items={model.attention} /> : <EmptyState label="Nothing needs attention right now." />}
          </ChartCard>
          <ChartCard title="Fleet composition" subtitle="Eligibility of vehicles in your scope">
            <DonutChart data={model.composition} centerLabel="Vehicles" emptyLabel="No vehicles registered yet." />
          </ChartCard>
        </div>

        <SectionHeading title="Activity" />
        <div className="an-row an-row--main">
          <ChartCard
            title="Trips"
            subtitle={`Trips started over the last ${days} days`}
            footer={
              <div className="cluster" role="group" aria-label="Period">
                {PERIODS.map((p) => (
                  <button key={p} type="button" className={`button button--sm ${days === p ? 'button--primary' : 'button--secondary'}`} onClick={() => setDays(p)} aria-pressed={days === p}>
                    {p} days
                  </button>
                ))}
                <span className="text-muted" style={{ marginLeft: 'auto', fontSize: '0.78rem' }}>
                  {delta.description}
                </span>
              </div>
            }
          >
            <BarTrend data={model.series} unitSingular="trip" unitPlural="trips" periodLabel={`the last ${days} days`} />
          </ChartCard>
          <ChartCard title="Request pipeline" subtitle="All requests visible to you" footer={<CardLink href="/requests">Open requests</CardLink>}>
            <RankedList items={model.pipeline} emptyLabel="No requests yet." />
          </ChartCard>
        </div>

        <div className="an-row an-row--main">
          <ChartCard title="Stations by fleet size" subtitle="Vehicles per station and how many are moving" footer={<CardLink href="/stations">All stations</CardLink>}>
            <RankedList items={model.stationRank} emptyLabel="No station data." />
          </ChartCard>
          <ChartCard title="Recent audit activity" subtitle="Tamper-evident ledger" footer={can('audit.read') ? <CardLink href="/audit">Open audit ledger</CardLink> : undefined}>
            {!can('audit.read') ? (
              <EmptyState label="Audit history is available to roles with audit access." />
            ) : activity === null ? (
              <EmptyState label="Loading activity..." />
            ) : activity.length === 0 ? (
              <EmptyState label="No audit entries yet." />
            ) : (
              <ul className="an-queue">
                {activity.map((e) => (
                  <li className="an-queue__item" key={e.id}>
                    <div className="an-queue__link" style={{ cursor: 'default' }}>
                      <span className="an-queue__title">
                        <strong>{e.action}</strong>
                        <small>
                          {e.entityType} by {e.performedBy}
                        </small>
                      </span>
                      <span className="an-queue__status">
                        <Badge tone={e.outcome === 'DENIED' ? 'danger' : e.outcome === 'FAILED' ? 'warning' : 'neutral'}>{e.outcome}</Badge>
                        <small>{fmtRelative(e.performedAt)}</small>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        </div>

        <SectionHeading title="Quick actions and platform" />
        <div className="an-row an-row--main">
          <ChartCard title="Quick actions" subtitle="Based on your permissions">
            <div className="stack" style={{ gap: 8 }}>
              {can('vehicle.register') ? <QuickAction href="/vehicles?register=1" icon={<Plus size={16} />} label="Register a vehicle" /> : null}
              {can('request.create') ? <QuickAction href="/requests?new=1" icon={<KeyRound size={16} />} label="New vehicle request" /> : null}
              {can('incident.write') ? <QuickAction href="/incidents?new=1" icon={<AlertTriangle size={16} />} label="Report an incident" /> : null}
              {can('handover.record') ? <QuickAction href="/allocations" icon={<ClipboardCheck size={16} />} label="Record a handover or return" /> : null}
              <QuickAction href="/vehicles/map" icon={<Activity size={16} />} label="Open the live map" />
            </div>
          </ChartCard>
          <ChartCard title="IoT and telemetry" subtitle="Device registry health" footer={<CardLink href="/iot">Open IoT hub</CardLink>}>
            <ul className="an-stats">
              <li>
                <Link href="/iot">
                  <span className="an-stats__label">
                    <strong>Devices registered</strong>
                    <small>GPS trackers and sensors</small>
                  </span>
                  <span className="an-stats__value">{model.deviceCount}</span>
                </Link>
              </li>
              <li>
                <Link href="/iot">
                  <span className="an-stats__label">
                    <strong>Stale or offline</strong>
                    <small>Needs a connectivity check, not an assumption about the vehicle</small>
                  </span>
                  <span className="an-stats__value">{model.offline}</span>
                </Link>
              </li>
            </ul>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
