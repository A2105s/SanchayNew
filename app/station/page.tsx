'use client';

import Link from 'next/link';
import { LogOut, MapPin, Phone, ShieldCheck, Car, Bike, Truck, Bus, ArrowLeft } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { useApiResource } from '@/hooks/useApiResource';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { KpiCard } from '@/components/analytics/AnalyticsKit';

interface StationProfile {
  station: {
    code: string;
    name: string;
    zone: string;
    district: string;
    lat: number;
    lng: number;
    inchargeName: string | null;
    phone: string | null;
  };
  inventory: { patrolCar: number; motorcycle: number; van: number; heavy: number };
  vehicleCount: number;
  activeAllocations: number;
  officers: Array<{ username: string; displayName: string; role: string }>;
}

export default function StationProfilePage() {
  const { me } = useFleet();
  const { toast } = useToast();
  const { data, loading, error } = useApiResource<StationProfile>(me?.stationId ? '/api/cloud/station/profile' : null);

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      toast('Signed out', 'success');
      // full reload clears all client fleet state
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    }
  }

  if (!me?.stationId) {
    return (
      <div className="page">
        <PageTitle title="My station" />
        <EmptyState
          title="No station attached to your account"
          description="Station profiles exist for station-based roles. Your account is a department or platform role — see Settings instead."
          action={<Link href="/dashboard" className="back-link"><ArrowLeft size={14} aria-hidden="true" /> Back to dashboard</Link>}
        />
      </div>
    );
  }

  const inv = data?.inventory;

  return (
    <div className="page stack">
      <PageTitle
        title={data?.station.name ?? 'My station'}
        description={data ? `${data.station.code} · ${data.station.zone} zone · ${data.station.district}` : 'Station profile'}
      />

      {loading ? <Skeleton height={120} /> : error ? (
        <EmptyState title={`Could not load the station profile: ${error}`} />
      ) : data ? (
        <>
          <section className="an-kpis" aria-label="Station fleet summary">
            <KpiCard label="Vehicles registered" value={data.vehicleCount} tone="info" icon={<Car size={16} />} />
            <KpiCard label="Active allocations" value={data.activeAllocations} tone="warning" hint="Reserved, awaiting handover or on the road" />
            <KpiCard label="Patrol cars" value={inv?.patrolCar ?? 0} tone="success" />
            <KpiCard label="Motorcycles" value={inv?.motorcycle ?? 0} tone="neutral" />
          </section>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <Panel title="Station identity">
              <div className="kv">
                <span>Station</span>
                <span>{data.station.name}</span>
                <span>Station code</span>
                <span className="mono">{data.station.code}</span>
                <span>Zone / district</span>
                <span>{data.station.zone} · {data.station.district}</span>
                <span>Station incharge</span>
                <span>{data.station.inchargeName ?? '—'}</span>
                <span><Phone size={13} aria-hidden="true" /> Contact</span>
                <span>{data.station.phone ?? '—'}</span>
                <span><MapPin size={13} aria-hidden="true" /> Coordinates</span>
                <span className="mono">{data.station.lat.toFixed(4)}, {data.station.lng.toFixed(4)}</span>
              </div>
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.6rem' }}>
                Requests you send carry this station&apos;s identity; the receiving station and the reviewing officers see it in the approval trail.
              </p>
            </Panel>

            <Panel title="Station fleet mix">
              <ul className="an-stats">
                <li>
                  <span className="an-stats__label"><strong><Car size={14} aria-hidden="true" /> Patrol cars</strong></span>
                  <span className="an-stats__value">{inv?.patrolCar ?? 0}</span>
                </li>
                <li>
                  <span className="an-stats__label"><strong><Bike size={14} aria-hidden="true" /> Motorcycles</strong></span>
                  <span className="an-stats__value">{inv?.motorcycle ?? 0}</span>
                </li>
                <li>
                  <span className="an-stats__label"><strong><Bus size={14} aria-hidden="true" /> Vans</strong></span>
                  <span className="an-stats__value">{inv?.van ?? 0}</span>
                </li>
                <li>
                  <span className="an-stats__label"><strong><Truck size={14} aria-hidden="true" /> Heavy</strong></span>
                  <span className="an-stats__value">{inv?.heavy ?? 0}</span>
                </li>
              </ul>
              <div className="cluster" style={{ marginTop: '0.6rem' }}>
                <Badge tone="info"><ShieldCheck size={12} aria-hidden="true" /> Scoped access</Badge>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>You only see this station&apos;s fleet and requests.</span>
              </div>
            </Panel>
          </div>

          <Panel title="Officers at this station">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Username</th><th>Name</th><th>Role</th></tr>
                </thead>
                <tbody>
                  {data.officers.map((o) => (
                    <tr key={o.username}>
                      <td className="mono">{o.username}</td>
                      <td>{o.displayName}</td>
                      <td><Badge tone="neutral">{o.role.replaceAll('_', ' ')}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Session">
            <div className="cluster" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div>
                <strong>{me.displayName}</strong>
                <div className="text-muted" style={{ fontSize: '0.85rem' }}>Signed in as {me.username} · {me.role.replaceAll('_', ' ')}</div>
              </div>
              <Button variant="secondary" icon={<LogOut size={14} />} onClick={logout}>Log out</Button>
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
