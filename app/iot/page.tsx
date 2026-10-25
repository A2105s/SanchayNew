'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cpu,
  Plus,
  Radio,
  Satellite,
  Server,
  Signal,
  Unplug,
  Link2,
} from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { fmtRelative } from '@/lib/fleet/format';
import { deviceStatusTone } from '@/components/ops/shared';
import { SignalBars, CopyButton } from '@/components/ops/primitives';
import { ProvisionModal, DEVICE_KIND_LABEL } from '@/components/ops/IotParts';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatusDot } from '@/components/ui/StatusDot';
import { Select } from '@/components/ui/Select';
import { MetricTile } from '@/components/ui/MetricTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
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
  const [provisionOpen, setProvisionOpen] = useState(false);
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
      { id: 'ais', name: 'AIS-140 gateway', icon: <Satellite size={18} />, total: ais.length, online: online(ais) },
      { id: 'mqtt', name: 'MQTT broker', icon: <Server size={18} />, total: mqtt.length, online: online(mqtt) },
      { id: 'http', name: 'HTTP ingest', icon: <Radio size={18} />, total: http.length, online: online(http) },
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

  const filteredDevices = useMemo(
    () => devices.filter((d) => (protocolFilter === 'ALL' ? true : d.protocol === protocolFilter)),
    [devices, protocolFilter]
  );

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
        description="Tracking device registry, gateway health and live telemetry."
        action={
          canManage ? (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setProvisionOpen(true)}>
              Provision device
            </Button>
          ) : undefined
        }
      />

      <div className="cluster" style={{ gap: 8 }}>
        <Badge tone="warning">Simulated placeholder</Badge>
        <span className="text-muted" style={{ fontSize: '0.82rem' }}>
          Gateway health below is derived from the device registry. Connect real hardware using the guide at the bottom.
        </span>
      </div>

      <div className="ops-grid-cards">
        {gateways.map((g) => (
          <Panel key={g.id}>
            <div className="ops-gateway">
              <span className="ops-gateway-icon" aria-hidden="true">{g.icon}</span>
              <div className="stack" style={{ gap: 2, flex: 1 }}>
                <strong>{g.name}</strong>
                <span className="cluster" style={{ gap: 6 }}>
                  <StatusDot tone={g.total === 0 ? 'neutral' : g.online ? 'success' : 'warning'} pulse={g.online > 0} />
                  <span className="text-muted" style={{ fontSize: '0.82rem' }}>
                    {g.total === 0 ? 'No devices' : `${g.online}/${g.total} online`}
                  </span>
                </span>
              </div>
              <Badge tone="neutral">Simulated</Badge>
            </div>
          </Panel>
        ))}
      </div>

      <div className="metric-grid">
        <MetricTile label="Devices" value={coverage.total} icon={<Cpu size={16} />} />
        <MetricTile label="Online" value={coverage.online} tone="success" icon={<Signal size={16} />} />
        <MetricTile label="Vehicle coverage" value={`${coverage.coveragePct}%`} tone="brand" detail={`${coverage.trackedVehicles} vehicles tracked`} />
        <MetricTile label="Simulated" value={coverage.simulated} tone="warning" detail="placeholder devices" />
      </div>

      <div className="page-grid-2">
        <Panel title="Device registry" subtitle={`${filteredDevices.length} devices`} action={
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
        }>
          {filteredDevices.length === 0 ? (
            <EmptyState icon={<Cpu size={26} />} title="No devices" description="Provision a device to begin tracking." />
          ) : (
            <div className="table-wrap iot-registry">
              <table>
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Vehicle</th>
                    <th>Status</th>
                    <th>Battery</th>
                    <th>Signal</th>
                    <th>Firmware</th>
                    <th>Last seen</th>
                    {canManage && <th aria-label="Actions" />}
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.map((d) => {
                    const v = d.vehicleId ? vehicleById(d.vehicleId) : undefined;
                    return (
                      <tr key={d.id}>
                        <td>
                          <div className="cluster" style={{ gap: 6 }}>
                            <span className="mono" style={{ fontWeight: 540 }}>{d.deviceCode}</span>
                            {d.simulated && <Badge tone="neutral">Sim</Badge>}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.76rem' }}>
                            {DEVICE_KIND_LABEL[d.kind]} · {d.protocol}
                          </div>
                        </td>
                        <td className="mono" style={{ fontSize: '0.82rem' }}>{v ? v.registrationNumber : '—'}</td>
                        <td><StatusDot tone={deviceStatusTone(d.status)} label={d.status} /></td>
                        <td className="mono">{d.batteryPct == null ? '—' : `${d.batteryPct}%`}</td>
                        <td><SignalBars dbm={d.signalDbm} /></td>
                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>{d.firmware ?? '—'}</td>
                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>{fmtRelative(d.lastSeenAt)}</td>
                        {canManage && (
                          <td>
                            <div className="cluster" style={{ gap: 4 }}>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={d.simulated ? <Signal size={13} /> : <Radio size={13} />}
                                loading={busyId === d.id}
                                onClick={() => deviceAction(d.id, { type: 'setSimulated', simulated: !d.simulated }, d.simulated ? 'Marked as real' : 'Marked as simulated')}
                                title={d.simulated ? 'Mark as real hardware' : 'Mark as simulated'}
                              >
                                {d.simulated ? 'Real' : 'Sim'}
                              </Button>
                              {d.vehicleId ? (
                                <Button size="sm" variant="ghost" icon={<Unplug size={13} />} loading={busyId === d.id} onClick={() => deviceAction(d.id, { type: 'bind', vehicleId: null }, 'Device unbound')}>
                                  Unbind
                                </Button>
                              ) : null}
                              <Button size="sm" variant="danger" icon={<Link2 size={13} />} loading={busyId === d.id} onClick={() => deviceAction(d.id, { type: 'decommission' }, 'Device decommissioned')}>
                                Decommission
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
        </Panel>

        <Panel title="Live telemetry stream" subtitle="Rolling last 30 events" icon={<Radio size={17} />}>
          {stream.length === 0 ? (
            <EmptyState title="Waiting for telemetry" description="Live position deltas will stream here." />
          ) : (
            <div className="ops-stream" aria-live="polite">
              {stream.map((s) => (
                <div key={s.key} className="ops-stream-row">
                  <Badge tone={s.simulated ? 'neutral' : 'success'}>{s.simulated ? 'Sim' : 'Live'}</Badge>
                  <span className="mono">{s.reg} · {Math.round(s.speed)} km/h</span>
                  <span className="text-muted">{fmtRelative(s.at)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Connect real hardware" subtitle="Point AIS-140 / HTTP devices at the ingest endpoint" icon={<Satellite size={17} />}>
        <div className="stack">
          <div className="kv">
            <span className="text-muted">Endpoint</span>
            <span className="cluster" style={{ gap: 8 }}>
              <span className="mono">POST {ingestUrl}</span>
              <CopyButton text={ingestUrl} label="Copy URL" />
            </span>
          </div>
          <div className="kv">
            <span className="text-muted">Authorization</span>
            <span className="mono">Bearer &lt;token&gt;</span>
          </div>
          <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>
            The bearer token is configured server-side in the <span className="mono">SANCHAY_IOT_INGEST_TOKEN</span> environment variable and is
            never exposed in the UI. The device sends its <span className="mono">deviceCode</span>; telemetry updates the bound vehicle in real time.
          </p>
          <div className="ops-code">
            <span className="ops-copy">
              <CopyButton text={curl} label="Copy" />
            </span>
            {curl}
          </div>
        </div>
      </Panel>

      {provisionOpen && (
        <ProvisionModal
          vehicles={vehicles}
          onClose={() => setProvisionOpen(false)}
          onDone={async () => { setProvisionOpen(false); await refresh(); }}
          toast={toast}
        />
      )}
    </div>
  );
}
