'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Cpu,
  Plus,
  Radio,
  Satellite,
  Server,
  Signal,
  Unplug,
  Link2,
  Activity,
  Terminal,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { fmtRelative } from '@/lib/fleet/format';
import { deviceStatusTone } from '@/components/ops/shared';
import { SignalBars, CopyButton, KvRow } from '@/components/ops/primitives';
import { ProvisionModal, InlineProvisionForm, DEVICE_KIND_LABEL } from '@/components/ops/IotParts';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatusDot } from '@/components/ui/StatusDot';
import { Select } from '@/components/ui/Select';
import { SearchField } from '@/components/ui/SearchField';
import { KpiCard } from '@/components/analytics/AnalyticsKit';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ExpandableCard } from '@/components/ui/ExpandableCard';
import type { DeviceView, LiveDelta } from '@/types';

interface StreamEvent {
  key: string;
  vehicleId: string;
  reg: string;
  simulated: boolean;
  speed: number;
  at: string;
}

export default function IotPage() {
  const { snapshot, loading, error, refresh, live, vehicleById, can } = useFleet();
  const { toast } = useToast();
  const [showProvisionForm, setShowProvisionForm] = useState(false);
  const [showLiveFeed, setShowLiveFeed] = useState(false);
  const [showGateways, setShowGateways] = useState(true);
  const [showHardwareEndpoint, setShowHardwareEndpoint] = useState(false);
  const [provisionModalOpen, setProvisionModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<'ALL' | DeviceView['protocol']>('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamEvent[]>([]);
  const seenRef = useRef<Record<string, string>>({});

  const devices = snapshot?.devices ?? [];
  const vehicles = snapshot?.vehicles ?? [];
  const canManage = can('device.manage');

  // Roll the live deltas into a bounded telemetry stream (last 30 events).
  useEffect(() => {
    const additions: StreamEvent[] = [];
    for (const [vehicleId, d] of Object.entries(live) as [string, LiveDelta][]) {
      const stamp = d.lastSeenAt;
      if (seenRef.current[vehicleId] === stamp) continue;
      seenRef.current[vehicleId] = stamp;
      const v = vehicleById(vehicleId);
      additions.push({
        key: `${vehicleId}:${stamp}`,
        vehicleId,
        reg: v?.registrationNumber ?? vehicleId.slice(0, 8),
        simulated: d.simulated,
        speed: d.speedKmph,
        at: stamp,
      });
    }
    if (additions.length) {
      setStream((prev) => [...additions, ...prev].slice(0, 30));
    }
  }, [live, vehicleById]);

  const gateways = useMemo(() => {
    const byProtocol = (p: DeviceView['protocol']) => devices.filter((d) => d.protocol === p);
    const online = (list: DeviceView[]) => list.filter((d) => d.status === 'ONLINE').length;
    const ais = byProtocol('AIS_140');
    const mqtt = byProtocol('MQTT');
    const http = byProtocol('HTTP');
    return [
      {
        id: 'ais',
        name: 'AIS-140 gateway',
        desc: 'Automotive security standard for public transport and emergency fleets',
        icon: <Satellite size={18} />,
        protocol: 'TCP / UDP 5000',
        total: ais.length,
        online: online(ais),
      },
      {
        id: 'mqtt',
        name: 'MQTT broker',
        desc: 'Lightweight IoT pub/sub broker for edge telematics and micro-controllers',
        icon: <Server size={18} />,
        protocol: 'mqtt://port 1883',
        total: mqtt.length,
        online: online(mqtt),
      },
      {
        id: 'http',
        name: 'HTTP REST ingest',
        desc: 'Standard JSON webhook ingest for battery-powered GPS assets and testbeds',
        icon: <Radio size={18} />,
        protocol: 'POST /api/iot/ingest',
        total: http.length,
        online: online(http),
      },
    ];
  }, [devices]);

  const coverage = useMemo(() => {
    const bound = devices.filter((d) => d.vehicleId).length;
    const simulated = devices.filter((d) => d.simulated).length;
    const online = devices.filter((d) => d.status === 'ONLINE').length;
    const total = devices.length;
    const trackedVehicles = new Set(devices.filter((d) => d.vehicleId).map((d) => d.vehicleId)).size;
    const coveragePct = vehicles.length ? Math.round((trackedVehicles / vehicles.length) * 100) : 0;
    return { bound, simulated, online, total, coveragePct, trackedVehicles };
  }, [devices, vehicles]);

  const filteredDevices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices.filter((d) => {
      if (protocolFilter !== 'ALL' && d.protocol !== protocolFilter) return false;
      if (q) {
        const v = d.vehicleId ? vehicleById(d.vehicleId) : undefined;
        const hay = `${d.deviceCode} ${d.protocol} ${d.kind} ${v?.registrationNumber ?? ''} ${d.firmware ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [devices, protocolFilter, query, vehicleById]);

  const ingestUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/iot/ingest` : '/api/iot/ingest';
  const curl = `curl -X POST ${ingestUrl} \\
  -H "Authorization: Bearer $SANCHAY_IOT_INGEST_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"deviceCode":"356938035643809","lat":26.2183,"lng":78.1828,"speedKmph":42,"heading":110,"ignition":true,"fuelPercent":68,"signalDbm":-67}'`;

  async function deviceAction(id: string, body: unknown, successMsg: string) {
    setBusyId(id);
    try {
      await api.post(`/api/cloud/devices/${id}/actions`, body);
      toast(successMsg, 'success');
      await refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Action failed', 'danger');
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !snapshot) {
    return (
      <div className="page stack">
        <PageTitle title="IoT hub" />
        <Skeleton height={320} />
      </div>
    );
  }
  if (error && !snapshot) {
    return (
      <div className="page">
        <EmptyState title="Could not load IoT hub" description={error} action={<Button onClick={() => refresh()}>Retry</Button>} />
      </div>
    );
  }

  return (
    <div className="page stack">
      <PageTitle
        eyebrow="Telemetry"
        title="IoT hub"
        description="Tracking device registry, gateway ingestion health and live telemetry streams."
        action={
          canManage ? (
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => setShowProvisionForm((prev) => !prev)}
            >
              {showProvisionForm ? 'Hide form' : 'Provision device'}
            </Button>
          ) : undefined
        }
      />

      <section className="an-kpis" aria-label="IoT device metrics">
        <KpiCard label="Provisioned devices" value={coverage.total.toLocaleString('en-IN')} icon={<Cpu size={16} />} tone="brand" hint="Active hardware and simulators" />
        <KpiCard label="Online telemetry" value={coverage.online.toLocaleString('en-IN')} tone="success" icon={<Signal size={16} />} hint="Heartbeat within threshold" />
        <KpiCard label="Vehicle coverage" value={`${coverage.coveragePct}%`} tone="brand" hint={`${coverage.trackedVehicles} / ${vehicles.length} vehicles tracked`} detail="Fleet telematics ratio" />
        <KpiCard label="Simulated testbeds" value={coverage.simulated.toLocaleString('en-IN')} tone="warning" hint="Virtual test devices" />
      </section>

      {/* Expandable Provisioning Banner (EasyLife Parity: "Add Customer / Show form v") */}
      {canManage && (
        <ExpandableCard
          icon={<Plus size={20} />}
          iconTone="brand"
          title="Provision Telematics Tracker"
          subtitle="Register physical AIS-140 hardware, OBD-II dongles, or generate a simulated vehicle testbed."
          expandLabel="Show form"
          collapseLabel="Hide form"
          expanded={showProvisionForm}
          onToggle={setShowProvisionForm}
        >
          <InlineProvisionForm
            vehicles={vehicles}
            onDone={async () => {
              setShowProvisionForm(false);
              await refresh();
            }}
            onCancel={() => setShowProvisionForm(false)}
            toast={toast}
          />
        </ExpandableCard>
      )}

      {/* Ingestion Gateways & Brokers Expandable Card */}
      <ExpandableCard
        icon={<Radio size={18} />}
        iconTone="brand"
        title="Ingest Gateways & Protocol Status"
        subtitle="Telemetry ingestion protocol status for AIS-140 (TCP/UDP 5000), MQTT broker, and HTTP REST webhooks."
        badge={
          <Badge tone={coverage.online > 0 ? 'success' : 'neutral'}>
            {coverage.online} online
          </Badge>
        }
        expandLabel="Show gateway telemetry"
        collapseLabel="Hide gateways"
        expanded={showGateways}
        onToggle={setShowGateways}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
          {gateways.map((g) => (
            <div
              key={g.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-secondary)',
              }}
            >
              <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="ops-gateway-icon" style={{ width: 36, height: 36, background: 'var(--color-bg-primary)' }}>
                  {g.icon}
                </span>
                <Badge tone={g.online > 0 ? 'success' : 'neutral'}>
                  {g.online > 0 ? 'Active' : 'Idle'}
                </Badge>
              </div>
              <div>
                <strong style={{ fontSize: '0.92rem' }}>{g.name}</strong>
                <p className="text-muted" style={{ fontSize: '0.78rem', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                  {g.desc}
                </p>
              </div>
              <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)' }}>
                <span className="mono text-muted" style={{ fontSize: '0.74rem' }}>{g.protocol}</span>
                <span className="cluster" style={{ gap: 6 }}>
                  <StatusDot tone={g.total === 0 ? 'neutral' : g.online ? 'success' : 'warning'} pulse={g.online > 0} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {g.total === 0 ? '0 devices' : `${g.online} / ${g.total} online`}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </ExpandableCard>

      {/* Live Telemetry Feed Expandable Card */}
      <ExpandableCard
        icon={<Activity size={18} />}
        iconTone="brand"
        title="Live Telemetry Feed"
        subtitle="Real-time vehicle position and speed delta broadcasts from active devices."
        badge={
          <Badge tone={stream.length ? 'success' : 'neutral'}>
            {stream.length} active updates
          </Badge>
        }
        expandLabel="Show live feed"
        collapseLabel="Hide live feed"
        expanded={showLiveFeed}
        onToggle={setShowLiveFeed}
      >
        {stream.length === 0 ? (
          <EmptyState title="Waiting for telemetry events" description="Live deltas from provisioned devices will appear here." />
        ) : (
          <div className="ops-stream" aria-live="polite" style={{ maxHeight: 380 }}>
            {stream.map((s) => (
              <div key={s.key} className="ops-stream-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 0.75rem' }}>
                <div className="cluster" style={{ gap: 8, alignItems: 'center' }}>
                  <Badge tone={s.simulated ? 'neutral' : 'success'}>
                    {s.simulated ? 'Sim' : 'Live'}
                  </Badge>
                  <Link href={`/vehicles/${s.vehicleId}`} className="mono" style={{ fontWeight: 700, color: 'var(--color-brand)', textDecoration: 'none', fontSize: '0.84rem' }}>
                    {s.reg}
                  </Link>
                </div>
                <div className="cluster" style={{ gap: 12, alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                    {Math.round(s.speed)} km/h
                  </span>
                  <span className="text-muted" style={{ fontSize: '0.76rem' }}>
                    {fmtRelative(s.at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ExpandableCard>

      {/* Main Device Registry Table (100% full width) */}
      <Panel
        title="Device registry"
        subtitle="Provisioned telematics hardware, signal telemetry, and vehicle bindings"
        icon={<Cpu size={16} />}
        action={
          <Badge tone="neutral">
            {filteredDevices.length} {filteredDevices.length === 1 ? 'device' : 'devices'}
          </Badge>
        }
      >
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          <div className="toolbar" style={{ margin: 0, gap: 'var(--space-2)', display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 280px', minWidth: '220px' }}>
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Search device code, protocol or vehicle…"
                placeholders={[
                  'Search device code (e.g. "DEV-")…',
                  'Search vehicle registration (e.g. "MP-07-")…',
                  'Search protocol or kind…',
                  'Search firmware version…',
                ]}
                ariaLabel="Search devices"
              />
            </div>
            <Select
              ariaLabel="Protocol filter"
              width="160px"
              value={protocolFilter}
              onChange={(v) => setProtocolFilter(v as 'ALL' | DeviceView['protocol'])}
              options={[
                { value: 'ALL', label: 'All protocols' },
                { value: 'AIS_140', label: 'AIS-140' },
                { value: 'MQTT', label: 'MQTT' },
                { value: 'HTTP', label: 'HTTP' },
                { value: 'BLE', label: 'BLE' },
              ]}
            />
          </div>

          {filteredDevices.length === 0 ? (
            <EmptyState icon={<Cpu size={26} />} title="No devices match" description="Adjust search filters or provision a new tracker." />
          ) : (
            <div className="table-wrap iot-registry">
              <table>
                <thead>
                  <tr>
                    <th>Device Code</th>
                    <th>Bound Vehicle</th>
                    <th>Status</th>
                    <th>Battery</th>
                    <th>Signal</th>
                    <th>Firmware</th>
                    <th>Last Heartbeat</th>
                    {canManage && <th aria-label="Actions" style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.map((d) => {
                    const v = d.vehicleId ? vehicleById(d.vehicleId) : undefined;
                    return (
                      <tr key={d.id}>
                        <td>
                          <div className="cluster" style={{ gap: 6, alignItems: 'center' }}>
                            <strong className="mono table-code">{d.deviceCode}</strong>
                            <Badge tone={d.simulated ? 'warning' : 'neutral'}>
                              {d.simulated ? 'Sim' : 'HW'}
                            </Badge>
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.74rem' }}>
                            {DEVICE_KIND_LABEL[d.kind]} · {d.protocol}
                          </div>
                        </td>
                        <td>
                          {v ? (
                            <Link href={`/vehicles/${v.id}`}>
                              <span className="reg-plate-inline">{v.registrationNumber}</span>
                            </Link>
                          ) : (
                            <span className="text-muted" style={{ fontSize: '0.82rem' }}>— Unbound</span>
                          )}
                        </td>
                        <td>
                          <StatusDot tone={deviceStatusTone(d.status)} label={d.status} />
                        </td>
                        <td>
                          <span className="mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: d.batteryPct != null && d.batteryPct < 20 ? 'var(--color-danger)' : 'inherit' }}>
                            {d.batteryPct == null ? '—' : `${d.batteryPct}%`}
                          </span>
                        </td>
                        <td><SignalBars dbm={d.signalDbm} /></td>
                        <td>
                          <span className="text-muted mono" style={{ fontSize: '0.78rem' }}>{d.firmware ?? 'v1.0'}</span>
                        </td>
                        <td>
                          <span className="text-muted" style={{ fontSize: '0.78rem' }}>{fmtRelative(d.lastSeenAt)}</span>
                        </td>
                        {canManage && (
                          <td style={{ textAlign: 'right' }}>
                            <div className="cluster" style={{ gap: 4, justifyContent: 'flex-end' }}>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={d.simulated ? <Zap size={13} /> : <Cpu size={13} />}
                                loading={busyId === d.id}
                                onClick={() => deviceAction(d.id, { type: 'setSimulated', simulated: !d.simulated }, d.simulated ? 'Set as physical hardware' : 'Set as simulated testbed')}
                                title={d.simulated ? 'Switch to real hardware mode' : 'Switch to simulated testbed mode'}
                              >
                                {d.simulated ? 'To Real' : 'To Sim'}
                              </Button>
                              {d.vehicleId ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<Unplug size={13} />}
                                  loading={busyId === d.id}
                                  onClick={() => deviceAction(d.id, { type: 'bind', vehicleId: null }, 'Device unbound')}
                                  title="Unbind from vehicle"
                                >
                                  Unbind
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="danger"
                                icon={<Link2 size={13} />}
                                loading={busyId === d.id}
                                onClick={() => deviceAction(d.id, { type: 'decommission' }, 'Device decommissioned')}
                                title="Decommission this device"
                              >
                                Retire
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>

      {/* Expandable Hardware Telemetry Endpoints Card */}
      <ExpandableCard
        icon={<Satellite size={18} />}
        iconTone="brand"
        title="Connect Physical Telemetry Hardware"
        subtitle="Direct ingestion endpoint and curl commands for AIS-140 GPS trackers and on-board units."
        expandLabel="Show endpoint instructions"
        collapseLabel="Hide instructions"
        expanded={showHardwareEndpoint}
        onToggle={setShowHardwareEndpoint}
      >
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>
            <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)' }}>
              <span className="text-muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 700 }}>Ingest Endpoint</span>
              <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span className="mono" style={{ fontSize: '0.82rem', fontWeight: 600 }}>POST {ingestUrl}</span>
                <CopyButton text={ingestUrl} label="Copy" />
              </div>
            </div>
            <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)' }}>
              <span className="text-muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 700 }}>Authorization Header</span>
              <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span className="mono" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Bearer &lt;SANCHAY_IOT_INGEST_TOKEN&gt;</span>
                <CopyButton text="Bearer $SANCHAY_IOT_INGEST_TOKEN" label="Copy" />
              </div>
            </div>
          </div>

          <div style={{ position: 'relative', marginTop: 'var(--space-2)' }}>
            <div className="ops-code" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 1.55 }}>
              <span className="ops-copy" style={{ position: 'absolute', top: 12, right: 12 }}>
                <CopyButton text={curl} label="Copy curl" />
              </span>
              <pre style={{ margin: 0, overflowX: 'auto' }}>
                <code>{curl}</code>
              </pre>
            </div>
          </div>
        </div>
      </ExpandableCard>

      {provisionModalOpen && (
        <ProvisionModal
          vehicles={vehicles}
          onClose={() => setProvisionModalOpen(false)}
          onDone={async () => { setProvisionModalOpen(false); await refresh(); }}
          toast={toast}
        />
      )}
    </div>
  );
}
