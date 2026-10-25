'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Building, MapPin, ArrowRight, Phone } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { VEHICLE_CLASSES, CLASS_LABEL_LOCAL, vehicleStatusTone } from '@/components/ops/shared';
import { KvRow } from '@/components/ops/primitives';
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

      <div className="toolbar" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="cluster" style={{ flex: '1 1 auto', alignItems: 'center' }}>
          <div style={{ flex: '1 1 260px', maxWidth: '380px' }}>
            <SearchField value={query} onChange={setQuery} ariaLabel="Search stations" placeholder="Search name, code, district" />
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Station</th>
                <th>Zone</th>
                <th>District</th>
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
                      if (e.key === 'Enter') setDetail(s);
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
                      <div className="cluster" style={{ gap: 4, fontSize: '0.85rem' }}>
                        <MapPin size={13} className="text-muted" /> {s.district}
                      </div>
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
                      <Button size="sm" variant="secondary" onClick={() => setDetail(s)}>
                        View details
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
                <div className="text-muted cluster" style={{ fontSize: '0.8rem', gap: 4 }}>
                  <MapPin size={13} /> {s.district}
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
    <Drawer title={station.name} onClose={onClose} width={440}>
      <div className="stack">
        <Panel title="Details">
          <div className="stack" style={{ gap: 4 }}>
            <KvRow k="Code" v={<span className="mono">{station.code}</span>} />
            <KvRow k="Zone" v={station.zone} />
            <KvRow k="District" v={station.district} />
            <KvRow k="In-charge" v={station.inchargeName ?? '-'} />
            <KvRow k="Phone" v={station.phone ? <a href={`tel:${station.phone}`} className="cluster" style={{ gap: 4 }}><Phone size={13} /> {station.phone}</a> : '-'} />
          </div>
        </Panel>

        <Panel title="Inventory (available pool)">
          <div className="ops-inv">
            {VEHICLE_CLASSES.map((c) => (
              <div className="ops-inv-cell" key={c}>
                <span>{CLASS_LABEL_LOCAL[c]}</span>
                <b>{station.inventory?.[c] ?? 0}</b>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={`Vehicles (${vehicles.length})`} action={<ButtonLink href={`/vehicles?station=${station.id}`} variant="ghost" size="sm">View all</ButtonLink>}>
          {vehicles.length === 0 ? (
            <EmptyState title="No vehicles assigned" />
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {vehicles.slice(0, 8).map((v) => (
                <Link key={v.id} href={`/vehicles/${v.id}`} className="ops-attn-row">
                  <StatusDot tone={vehicleStatusTone(v.status)} />
                  <div className="ops-attn-body">
                    <span className="ops-attn-title">{v.registrationNumber}</span>
                    <span className="ops-attn-detail">{v.displayName}</span>
                  </div>
                  <ArrowRight size={14} />
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <div className="grid-2">
          <Panel title="Incoming transfers">
            {incoming.length === 0 ? <span className="text-muted" style={{ fontSize: '0.82rem' }}>None</span> : (
              <div className="stack" style={{ gap: 4 }}>
                {incoming.map((t) => (
                  <Link key={t.id} href="/transfers" className="mono" style={{ fontSize: '0.82rem' }}>{t.transferCode}</Link>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Outgoing transfers">
            {outgoing.length === 0 ? <span className="text-muted" style={{ fontSize: '0.82rem' }}>None</span> : (
              <div className="stack" style={{ gap: 4 }}>
                {outgoing.map((t) => (
                  <Link key={t.id} href="/transfers" className="mono" style={{ fontSize: '0.82rem' }}>{t.transferCode}</Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <ButtonLink href={`/transfers?source=${station.id}`} variant="primary" icon={<ArrowRight size={15} />}>
          Request vehicles from this station
        </ButtonLink>
      </div>
    </Drawer>
  );
}
