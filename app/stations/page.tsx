'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Building, MapPin, ArrowRight, Phone, User, CarFront } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { VEHICLE_CLASSES, CLASS_LABEL_LOCAL, vehicleStatusTone } from '@/components/ops/shared';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { SearchField } from '@/components/ui/SearchField';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusDot } from '@/components/ui/StatusDot';
import { ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import { KpiCard } from '@/components/analytics/AnalyticsKit';
import type { StationView, VehicleView } from '@/types';

export default function StationsPage() {
  const { snapshot, loading, error, refresh } = useFleet();
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState('ALL');
  const [detail, setDetail] = useState<StationView | null>(null);

  const stations = snapshot?.stations ?? [];
  const vehicles = snapshot?.vehicles ?? [];
  const transfers = snapshot?.transfers ?? [];

  const zones = useMemo(() => Array.from(new Set(stations.map((s) => s.zone))).sort(), [stations]);

  const liveCounts = useMemo(() => {
    const m = new Map<string, { total: number; moving: number }>();
    for (const v of vehicles) {
      if (!v.stationId) continue;
      const e = m.get(v.stationId) ?? { total: 0, moving: 0 };
      e.total += 1;
      if (v.status === 'MOVING') e.moving += 1;
      m.set(v.stationId, e);
    }
    return m;
  }, [vehicles]);

  const kpis = useMemo(() => {
    let stationedCount = 0;
    let movingCount = 0;
    for (const v of vehicles) {
      if (v.stationId) {
        stationedCount++;
        if (v.status === 'MOVING') movingCount++;
      }
    }
    return {
      totalStations: stations.length,
      stationedCount,
      movingCount,
      zonesCount: zones.length
    };
  }, [stations, vehicles, zones]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stations.filter((s) => {
      if (zone !== 'ALL' && s.zone !== zone) return false;
      if (q) {
        const hay = `${s.name} ${s.code} ${s.district} ${s.zone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [stations, query, zone]);

  if (loading && !snapshot) {
    return (
      <div className="page stack">
        <PageTitle title="Stations" />
        <Skeleton height={320} />
      </div>
    );
  }
  if (error && !snapshot) {
    return (
      <div className="page">
        <EmptyState title="Could not load stations" description={error} action={<Button onClick={() => refresh()}>Retry</Button>} />
      </div>
    );
  }

  return (
    <div className="page stack">
      <PageTitle eyebrow="Fleet" title="Stations" description="Police station fleet pools, inventory and live counts." />

      <section className="an-kpis" aria-label="Police station overview">
        <KpiCard label="Police stations" value={kpis.totalStations.toLocaleString('en-IN')} tone="brand" hint="Jurisdictional station units" />
        <KpiCard label="Stationed fleet" value={kpis.stationedCount.toLocaleString('en-IN')} tone="brand" hint="Vehicles assigned to station pools" />
        <KpiCard label="Active on patrol" value={kpis.movingCount.toLocaleString('en-IN')} tone="success" hint="Currently moving in jurisdiction" />
        <KpiCard label="Zones covered" value={kpis.zonesCount.toLocaleString('en-IN')} tone="neutral" hint="Administrative police zones" />
      </section>

      <div className="an-toolbar" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="veh-toolbar-row" style={{ flex: '1 1 auto', alignItems: 'center' }}>
          <div className="veh-search" style={{ flex: '1 1 280px', maxWidth: '420px', margin: 0 }}>
            <SearchField
              value={query}
              onChange={setQuery}
              ariaLabel="Search stations"
              placeholder="Search name, code, district"
              placeholders={[
                'Search station name (e.g. "Kotwali")…',
                'Search station code (e.g. "STN-GWL-01")…',
                'Search district or jurisdiction…'
              ]}
            />
          </div>
          <Select
            ariaLabel="Zone filter"
            value={zone}
            onChange={setZone}
            options={[{ value: 'ALL', label: 'All zones' }, ...zones.map((z) => ({ value: z, label: z }))]}
            width="180px"
          />
        </div>
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Building size={28} />} title="No stations" description="No stations match your filters." />
      ) : viewMode === 'table' ? (
        <Panel title={`Station registry (${filtered.length})`} subtitle="Jurisdiction and available vehicle inventory">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Station</th>
                  <th>Zone</th>
                  <th>District</th>
                  <th>In-Charge & Contact</th>
                  <th>Fleet Pool</th>
                  <th>Live Status</th>
                  <th aria-label="Action" style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const live = liveCounts.get(s.id) ?? { total: 0, moving: 0 };
                  return (
                    <tr
                      key={s.id}
                      className="veh-row"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setDetail(s)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDetail(s);
                        }
                      }}
                    >
                      <td>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div className="text-muted mono" style={{ fontSize: '0.78rem' }}>{s.code}</div>
                      </td>
                      <td>
                        <Badge tone="neutral">{s.zone}</Badge>
                      </td>
                      <td>
                        <span className="cluster" style={{ gap: 4, fontSize: '0.85rem' }}>
                          <MapPin size={13} className="text-muted" /> {s.district}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.inchargeName ?? 'Station In-Charge'}</div>
                        {s.phone ? (
                          <a
                            href={`tel:${s.phone}`}
                            className="text-muted mono cluster"
                            style={{ fontSize: '0.78rem', gap: 4, textDecoration: 'none' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Phone size={11} /> {s.phone}
                          </a>
                        ) : (
                          <span className="text-muted" style={{ fontSize: '0.78rem' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div className="cluster" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
                          {VEHICLE_CLASSES.map((c) => {
                            const count = s.inventory?.[c] ?? 0;
                            if (count === 0) return null;
                            return (
                              <span key={c} className="chip" style={{ fontSize: '0.75rem' }}>
                                {CLASS_LABEL_LOCAL[c].slice(0, 3)}: <strong className="mono">{count}</strong>
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td>
                        <div className="cluster" style={{ gap: '0.75rem' }}>
                          <StatusDot tone={live.moving > 0 ? 'success' : 'neutral'} label={`${live.total} vehicles`} />
                          <span className="text-muted mono" style={{ fontSize: '0.8rem' }}>{live.moving} moving</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="table-action" onClick={() => setDetail(s)}>
                          View <ArrowRight size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <div className="ops-grid-cards">
          {filtered.map((s) => {
            const live = liveCounts.get(s.id) ?? { total: 0, moving: 0 };
            return (
              <button type="button" className="ops-tile" key={s.id} onClick={() => setDetail(s)} aria-label={`Open ${s.name}`}>
                <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div className="text-muted mono" style={{ fontSize: '0.78rem' }}>{s.code}</div>
                  </div>
                  <Badge tone="neutral">{s.zone}</Badge>
                </div>
                {s.inchargeName && (
                  <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                    {s.inchargeName}
                  </div>
                )}
                {s.phone && (
                  <div className="text-muted mono cluster" style={{ fontSize: '0.78rem', gap: 4 }}>
                    <Phone size={12} /> {s.phone}
                  </div>
                )}
                <div className="text-muted cluster" style={{ fontSize: '0.8rem', gap: 4 }}>
                  <MapPin size={13} /> {s.district} &bull; <span className="mono">{s.lat.toFixed(3)}, {s.lng.toFixed(3)}</span>
                </div>
                <div className="ops-inv">
                  {VEHICLE_CLASSES.map((c) => (
                    <div className="ops-inv-cell" key={c}>
                      <span>{CLASS_LABEL_LOCAL[c]}</span>
                      <b>{s.inventory?.[c] ?? 0}</b>
                    </div>
                  ))}
                </div>
                <div className="cluster" style={{ justifyContent: 'space-between' }}>
                  <StatusDot tone={live.moving > 0 ? 'success' : 'neutral'} label={`${live.total} vehicles`} />
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>{live.moving} moving</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {detail && (
        <StationDrawer
          station={detail}
          vehicles={vehicles.filter((v) => v.stationId === detail.id)}
          incoming={transfers.filter((t) => t.destinationStationId === detail.id && t.status !== 'REJECTED' && t.status !== 'CANCELLED')}
          outgoing={transfers.filter((t) => t.sourceStationId === detail.id && t.status !== 'REJECTED' && t.status !== 'CANCELLED')}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function StationDrawer({
  station,
  vehicles,
  incoming,
  outgoing,
  onClose,
}: {
  station: StationView;
  vehicles: VehicleView[];
  incoming: { id: string; transferCode: string }[];
  outgoing: { id: string; transferCode: string }[];
  onClose: () => void;
}) {
  return (
    <Drawer title={station.name} onClose={onClose} width={460}>
      <div className="stack" style={{ gap: 'var(--space-4)' }}>
        {/* Station identity badge strip */}
        <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
          <div className="cluster" style={{ gap: 6 }}>
            <span className="mono" style={{ fontWeight: 700, color: 'var(--color-brand)' }}>{station.code}</span>
            <Badge tone="neutral">{station.zone} Zone</Badge>
          </div>
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>{station.district}</span>
        </div>

        <Panel title="Station in-charge & contact" icon={<User size={16} />}>
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <div className="cluster" style={{ justifyContent: 'space-between' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Officer In-charge</span>
              <strong>{station.inchargeName ?? 'Unassigned'}</strong>
            </div>
            <div className="cluster" style={{ justifyContent: 'space-between' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Official Phone</span>
              {station.phone ? (
                <a href={`tel:${station.phone}`} className="cluster mono" style={{ gap: 6, color: 'var(--color-brand)', textDecoration: 'none', fontWeight: 600 }}>
                  <Phone size={13} /> {station.phone}
                </a>
              ) : (
                <span className="text-muted">—</span>
              )}
            </div>
            <div className="cluster" style={{ justifyContent: 'space-between' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Coordinates</span>
              <span className="mono" style={{ fontSize: '0.8rem' }}>{station.lat.toFixed(4)}°N, {station.lng.toFixed(4)}°E</span>
            </div>
          </div>
        </Panel>

        <Panel title="Available fleet pool" subtitle="Allocatable vehicles by class" icon={<CarFront size={16} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
            {VEHICLE_CLASSES.map((c) => {
              const count = station.inventory?.[c] ?? 0;
              return (
                <div
                  key={c}
                  style={{
                    padding: '0.6rem 0.8rem',
                    borderRadius: 'var(--radius-md)',
                    background: count > 0 ? 'var(--color-brand-subtle)' : 'var(--color-bg-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span style={{ fontSize: '0.82rem', color: count > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontWeight: 500 }}>
                    {CLASS_LABEL_LOCAL[c]}
                  </span>
                  <span className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: count > 0 ? 'var(--color-brand)' : 'var(--color-text-muted)' }}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          title={`Vehicles on roster (${vehicles.length})`}
          subtitle="Assigned fleet in this station's pool"
          action={
            vehicles.length > 0 ? (
              <ButtonLink href={`/vehicles?station=${station.id}`} variant="ghost" size="sm">
                View all
              </ButtonLink>
            ) : undefined
          }
        >
          {vehicles.length === 0 ? (
            <EmptyState title="No vehicles assigned" description="Assign vehicles via fleet edit or transfer approval." />
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {vehicles.slice(0, 8).map((v) => (
                <Link
                  key={v.id}
                  href={`/vehicles/${v.id}`}
                  className="ops-attn-row"
                  style={{ textDecoration: 'none' }}
                >
                  <StatusDot tone={vehicleStatusTone(v.status)} />
                  <div className="ops-attn-body">
                    <span className="ops-attn-title mono">{v.registrationNumber}</span>
                    <span className="ops-attn-detail">{v.displayName}</span>
                  </div>
                  <Badge tone={v.status === 'MOVING' ? 'success' : 'neutral'}>
                    {v.status === 'MOVING' ? 'On patrol' : v.status.toLowerCase()}
                  </Badge>
                  <ArrowRight size={14} style={{ color: 'var(--color-text-muted)' }} />
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <div className="grid-2">
          <Panel title="Incoming transfers">
            {incoming.length === 0 ? (
              <span className="text-muted" style={{ fontSize: '0.82rem' }}>No active inbound</span>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                {incoming.map((t) => (
                  <Link key={t.id} href="/transfers" className="mono" style={{ fontSize: '0.82rem', color: 'var(--color-brand)' }}>
                    {t.transferCode}
                  </Link>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Outgoing transfers">
            {outgoing.length === 0 ? (
              <span className="text-muted" style={{ fontSize: '0.82rem' }}>No active outbound</span>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                {outgoing.map((t) => (
                  <Link key={t.id} href="/transfers" className="mono" style={{ fontSize: '0.82rem', color: 'var(--color-brand)' }}>
                    {t.transferCode}
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div style={{ paddingTop: 'var(--space-2)' }}>
          <ButtonLink href={`/transfers?source=${station.id}`} variant="primary" icon={<ArrowRight size={15} />} style={{ width: '100%', justifyContent: 'center' }}>
            Request vehicles from this station
          </ButtonLink>
        </div>
      </div>
    </Drawer>
  );
}
