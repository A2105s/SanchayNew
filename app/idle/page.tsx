'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Recycle, ShieldAlert, Archive } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { idleDays } from '@/lib/fleet/idle';
import { CLASS_LABEL, fmtRelative } from '@/lib/fleet/format';
import { PageTitle } from '@/components/ui/PageTitle';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { EligibilityBadge, OwnershipBadge } from '@/components/ui/StatusBadges';
import { AnalyticsSkeleton, ChartCard, EmptyState, KpiCard, SectionHeading } from '@/components/analytics/AnalyticsKit';
import type { VehicleView } from '@/types';

interface ReuseRow {
  vehicle: VehicleView;
  days: number;
  suggestion: string;
}

function suggestionFor(v: VehicleView, days: number): string {
  if (v.sector === 'ELECTION_REQUISITION') return 'Keep available for election deployment';
  if (days >= 30) return 'Offer to another department (inter-department request)';
  if (days >= 7) return 'Review utilisation; open to cross-department requests';
  return 'Short idle spell; no action needed';
}

export default function IdleReusePage() {
  const { snapshot, loading, error, can } = useFleet();

  const model = useMemo(() => {
    if (!snapshot) return null;
    const vehicles = snapshot.vehicles ?? [];
    const thresholdDays = (snapshot.settings?.idleThresholdHours ?? 72) / 24;

    // Reuse candidates: ONLY verified, eligible, active government-fleet vehicles that have been idle long enough.
    const reuse: ReuseRow[] = [];
    for (const v of vehicles) {
      if (v.ownershipCategory !== 'GOVERNMENT_FLEET' || v.eligibilityState !== 'ELIGIBLE' || v.operationalStatus !== 'ACTIVE') continue;
      const days = idleDays(v) ?? 0;
      if (days < thresholdDays) continue;
      reuse.push({ vehicle: v, days, suggestion: suggestionFor(v, days) });
    }
    reuse.sort((a, b) => b.days - a.days);

    // Never allocatable: seized / unverified / restricted. Listed read-only with the server's reason codes.
    const blocked = vehicles.filter((v) => v.eligibilityState !== 'ELIGIBLE' && v.operationalStatus !== 'RETIRED');
    // Disposal candidates: retired government fleet only.
    const retired = vehicles.filter((v) => v.ownershipCategory === 'GOVERNMENT_FLEET' && v.operationalStatus === 'RETIRED');
    return { reuse, blocked, retired, thresholdHours: snapshot.settings?.idleThresholdHours ?? 72 };
  }, [snapshot]);

  if (loading && !snapshot) {
    return (
      <div className="page">
        <PageTitle title="Idle & reuse" />
        <AnalyticsSkeleton />
      </div>
    );
  }
  if (!snapshot || !model) {
    return (
      <div className="page">
        <PageTitle title="Idle & reuse" />
        <EmptyState label={error ? `Could not load fleet data: ${error}` : 'No fleet data available.'} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageTitle
        title="Idle & reuse"
        description="Find eligible government vehicles sitting idle and offer them to other departments through the normal request and approval flow."
      />
      <div className="an-dashboard">
        <section className="an-kpis" aria-label="Idle summary">
          <KpiCard label="Reuse candidates" value={model.reuse.length} tone="success" hint={`Eligible and idle over ${model.thresholdHours} h`} />
          <KpiCard label="Not allocatable" value={model.blocked.length} tone="warning" hint="Seized, unverified or restricted" detail="Never offered for reuse" />
          <KpiCard label="Retired fleet" value={model.retired.length} tone="info" hint="Government vehicles retired from service" />
        </section>

        <SectionHeading title="Reuse candidates" description="Verified, eligible, active government-fleet vehicles only" />
        <ChartCard title="Idle vehicles" subtitle="Reuse is arranged by a request that the owning department approves">
          {model.reuse.length === 0 ? (
            <EmptyState label={`No eligible vehicle has been idle for more than ${model.thresholdHours} hours.`} />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Class</th>
                    <th>Idle</th>
                    <th>Suggestion</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {model.reuse.map((r) => (
                    <tr key={r.vehicle.id}>
                      <td>
                        <Link href={`/vehicles/${r.vehicle.id}`}>
                          <strong className="mono">{r.vehicle.registrationNumber}</strong>
                        </Link>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>{r.vehicle.displayName}</div>
                      </td>
                      <td>{CLASS_LABEL[r.vehicle.vehicleClass]}</td>
                      <td className="mono">{r.days} d</td>
                      <td>{r.suggestion}</td>
                      <td>
                        {can('request.create') ? (
                          <ButtonLink href={`/requests?new=1&vehicleId=${r.vehicle.id}`} variant="secondary" size="sm" icon={<Recycle size={14} />}>
                            Request this vehicle
                          </ButtonLink>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>

        <SectionHeading title="Not allocatable" description="Read-only. These vehicles are excluded from reuse, requests and station pools until their status is resolved." />
        <ChartCard title="Seized, unverified or restricted" subtitle="Reasons come from the server-side eligibility decision">
          {model.blocked.length === 0 ? (
            <EmptyState label="Every vehicle in your scope is eligible." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Ownership</th>
                    <th>Eligibility</th>
                    <th>Why it is not allocatable</th>
                  </tr>
                </thead>
                <tbody>
                  {model.blocked.slice(0, 60).map((v) => (
                    <tr key={v.id}>
                      <td>
                        <Link href={`/vehicles/${v.id}`}>
                          <strong className="mono">{v.registrationNumber}</strong>
                        </Link>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>Last seen {fmtRelative(v.lastSeenAt)}</div>
                      </td>
                      <td><OwnershipBadge category={v.ownershipCategory} /></td>
                      <td><EligibilityBadge state={v.eligibilityState} /></td>
                      <td>
                        {(v.eligibilityReasons ?? []).filter((x) => x.blocking).map((x) => (
                          <div key={x.code} style={{ fontSize: '0.85rem' }}>
                            <Badge tone="neutral">{x.code}</Badge> {x.message}
                          </div>
                        ))}
                        {(v.eligibilityReasons ?? []).length === 0 ? <span className="text-muted">Awaiting verification</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {model.blocked.length > 60 ? (
                <p className="text-muted" style={{ padding: '8px 12px', fontSize: '0.8rem' }}>
                  Showing 60 of {model.blocked.length}. Filter the fleet registry by eligibility to see all.
                </p>
              ) : null}
            </div>
          )}
          <div style={{ marginTop: 12 }} className="cluster">
            <ShieldAlert size={15} aria-hidden="true" />
            <span className="text-muted" style={{ fontSize: '0.82rem' }}>
              Seized and impounded vehicles are held in custody. They can only become allocatable through a verified legal authorisation recorded by an authorised officer.
            </span>
          </div>
        </ChartCard>

        <SectionHeading title="Disposal candidates" description="Retired government-fleet vehicles only" />
        <ChartCard title="Retired fleet" subtitle="Handled through your department's disposal process">
          {model.retired.length === 0 ? (
            <EmptyState label="No retired government vehicles." />
          ) : (
            <ul className="an-stats">
              {model.retired.slice(0, 20).map((v) => (
                <li key={v.id}>
                  <Link href={`/vehicles/${v.id}`}>
                    <span className="an-stats__label">
                      <strong className="mono">{v.registrationNumber}</strong>
                      <small>{v.displayName}</small>
                    </span>
                    <span className="an-stats__value">
                      <Archive size={15} aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
