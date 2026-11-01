'use client';

import { use, useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Cpu,
  Radio,
  Satellite,
  Activity,
  Wifi,
  Compass,
  ShieldCheck,
  AlertTriangle,
  Gauge,
  Thermometer,
  Droplets,
  Eye,
  Volume2,
  VolumeX,
  ExternalLink,
  RefreshCw,
  Server,
  Zap,
} from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { api, ApiError } from '@/lib/client/api';
import { fmtRelative, fmtClock } from '@/lib/fleet/format';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatusDot } from '@/components/ui/StatusDot';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SignalBars } from '@/components/ops/primitives';
import { MiniMap } from '@/components/vehicles/MiniMap';
import type { DeviceView, VehicleView } from '@/types';

interface EdgeSensorData {
  tempC?: number | null;
  humidity?: number | null;
  distanceCm?: number | null;
  motion?: boolean;
  zone?: string | null;
  updatedAt?: string;
}

interface TelemetryPointRow {
  id: string;
  vehicleId: string;
  deviceCode?: string | null;
  lat: number;
  lng: number;
  speedKmph: number;
  heading: number;
  ignition: boolean;
  fuelPercent?: number | null;
  recordedAt: string;
  receivedAt: string;
}

interface DeviceDetailResponse {
  device: DeviceView;
  vehicle?: VehicleView | null;
  telemetryPoints: TelemetryPointRow[];
  incidents: Array<{
    id: string;
    incidentCode: string;
    type: string;
    severity: string;
    message: string;
    createdAt: string;
    status: string;
  }>;
}

export default function IotDeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { live } = useFleet();

  const [data, setData] = useState<DeviceDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    try {
      const res = await api.get<DeviceDetailResponse>(`/api/cloud/devices/${id}`);
      setData(res);
      setError(null);
    } catch (err: unknown) {
      if (!isPolling) {
        setError(err instanceof ApiError ? err.message : 'Could not load device details.');
      }
    } finally {
      if (!isPolling) setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // High-speed real-time polling every 500ms for instant live telemetry response
  useEffect(() => {
    const timer = setInterval(() => {
      fetchData(true);
    }, 500);
    return () => clearInterval(timer);
  }, [fetchData]);

  const device = data?.device;
  const vehicle = data?.vehicle;
  const telemetryPoints: TelemetryPointRow[] = data?.telemetryPoints ?? [];

  // Parse multi-sensor hardware payload from data.sensors or device.notes
  const edgeSensors = useMemo<EdgeSensorData | null>(() => {
    if ((data as any)?.sensors) return (data as any).sensors as EdgeSensorData;
    if (!device?.notes) return null;
    try {
      return JSON.parse(device.notes) as EdgeSensorData;
    } catch {
      return null;
    }
  }, [(data as any)?.sensors, device?.notes]);

  // Real-time delta from live fleet socket
  const liveDelta = vehicle ? live[vehicle.id] : undefined;

  const DEFAULT_IOT_LAT = 26.245263;
  const DEFAULT_IOT_LNG = 78.312914;

  const rawLat = liveDelta?.lat ?? vehicle?.lat;
  const rawLng = liveDelta?.lng ?? vehicle?.lng;
  const hasGpsLock = rawLat != null && rawLng != null && !(rawLat === 0 && rawLng === 0) && (Math.abs(rawLat - DEFAULT_IOT_LAT) > 0.0001 || Math.abs(rawLng - DEFAULT_IOT_LNG) > 0.0001);
  const currentLat = (rawLat != null && rawLat !== 0) ? rawLat : DEFAULT_IOT_LAT;
  const currentLng = (rawLng != null && rawLng !== 0) ? rawLng : DEFAULT_IOT_LNG;
  const currentSpeed = liveDelta?.speedKmph ?? vehicle?.speedKmph ?? 0;
  const currentHeading = liveDelta?.heading ?? vehicle?.heading ?? 90;
  const currentLastSeen = liveDelta?.lastSeenAt ?? vehicle?.lastSeenAt ?? device?.lastSeenAt;

  const [clockTick, setClockTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const nowMs = clockTick;
  const lastSeenMs = currentLastSeen ? new Date(currentLastSeen).getTime() : 0;
  const isHeartbeatLive = (nowMs - lastSeenMs) < 15000;

  if (loading && !data) {
    return (
      <div className="page stack">
        <Link href="/iot" className="back-link">
          <ArrowLeft size={15} /> Back to IoT Hub
        </Link>
        <Skeleton height={280} />
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="page stack">
        <Link href="/iot" className="back-link">
          <ArrowLeft size={15} /> Back to IoT Hub
        </Link>
        <EmptyState
          icon={<Cpu size={32} />}
          title="IoT Device Not Found"
          description={error ?? `Could not find telematics device matching identifier "${id}".`}
          action={
            <Button variant="primary" onClick={() => fetchData()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const distanceCm = edgeSensors?.distanceCm ?? null;
  const zoneName = edgeSensors?.zone ?? (distanceCm == null || distanceCm >= 200 ? 'SAFE' : distanceCm <= 20 ? 'STOP!' : 'CLOSE');
  const tempC = edgeSensors?.tempC ?? null;
  const humidity = edgeSensors?.humidity ?? null;
  const motion = edgeSensors?.motion ?? false;

  // Determine buzzer acoustic state based on distance threshold (< 50 cm)
  const buzzerStatus =
    distanceCm == null || distanceCm >= 50
      ? { label: 'Silent (Safe Buffer)', tone: 'neutral' as const, icon: <VolumeX size={15} /> }
      : distanceCm <= 20
      ? { label: 'Solid Continuous Tone (STOP!)', tone: 'danger' as const, icon: <Volume2 size={15} /> }
      : distanceCm <= 35
      ? { label: 'Urgent Pulse (220-100ms)', tone: 'warning' as const, icon: <Volume2 size={15} /> }
      : { label: 'Alert Beep (400-220ms)', tone: 'info' as const, icon: <Volume2 size={15} /> };

  return (
    <div className="page stack">
      {/* Top Breadcrumb */}
      <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/iot" className="back-link">
          <ArrowLeft size={15} /> Back to IoT Hub
        </Link>
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw size={13} />}
          loading={refreshing}
          onClick={() => {
            setRefreshing(true);
            fetchData();
          }}
        >
          Refresh Telemetry
        </Button>
      </div>

      {/* Header Banner */}
      <PageTitle
        eyebrow="Edge Telematics Device"
        title={device.deviceCode}
        description={
          vehicle
            ? `Bound to ${vehicle.registrationNumber} (${vehicle.displayName}) · ${vehicle.organizationId ?? 'Gwalior District Police'}`
            : 'Unbound edge telematics tracker'
        }
        action={
          <div className="cluster" style={{ gap: '0.5rem', alignItems: 'center' }}>
            <Badge tone={device.simulated ? 'warning' : 'success'}>
              {device.simulated ? 'Simulated Device' : 'Physical Hardware'}
            </Badge>
            <Badge tone={isHeartbeatLive ? 'success' : 'danger'}>
              <StatusDot tone={isHeartbeatLive ? 'success' : 'danger'} pulse={isHeartbeatLive} />
              <span style={{ marginLeft: 6, fontWeight: 700 }}>
                {isHeartbeatLive ? 'ONLINE · LIVE STREAM (3s Pings)' : 'OFFLINE · DISCONNECTED'}
              </span>
            </Badge>
            {vehicle && (
              <Link href={`/vehicles/${vehicle.id}`} className="btn btn--primary btn--sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                <ExternalLink size={13} />
                <span>Vehicle Passport</span>
              </Link>
            )}
          </div>
        }
      />

      {/* Live Hardware Telemetry Grid (4 Hero Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
        {/* Card 1: Ultrasonic Proximity Radar */}
        <div
          style={{
            background: 'var(--color-bg-secondary)',
            border: `1px solid ${distanceCm != null && distanceCm <= 20 ? 'var(--color-danger)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="cluster" style={{ gap: 6, fontWeight: 700, fontSize: '0.85rem' }}>
              <Gauge size={18} color="var(--color-brand)" />
              <span>Proximity Radar</span>
            </span>
            <Badge
              tone={
                distanceCm == null || distanceCm >= 200
                  ? 'success'
                  : distanceCm <= 20
                  ? 'danger'
                  : distanceCm <= 50
                  ? 'warning'
                  : 'info'
              }
            >
              [{zoneName}]
            </Badge>
          </div>

          <div style={{ margin: '0.25rem 0' }}>
            <div style={{ fontSize: '2.4rem', fontWeight: 900, letterSpacing: '-0.02em', color: distanceCm != null && distanceCm <= 20 ? 'var(--color-danger)' : 'inherit' }}>
              {distanceCm != null ? `${distanceCm} cm` : 'CLEAR'}
            </div>
            <div className="text-muted" style={{ fontSize: '0.78rem' }}>
              {distanceCm != null && distanceCm < 200 ? 'Active obstacle detected in range' : 'Path clear (>= 200 cm safe buffer)'}
            </div>
          </div>

          {/* Analog Radar Progress Bar */}
          <div style={{ width: '100%', height: 8, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: `${distanceCm == null || distanceCm >= 200 ? 0 : Math.min(100, Math.round(((200 - distanceCm) / 180) * 100))}%`,
                height: '100%',
                background:
                  distanceCm != null && distanceCm <= 20
                    ? 'var(--color-danger)'
                    : distanceCm != null && distanceCm <= 50
                    ? 'var(--color-warning)'
                    : 'var(--color-brand)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          {/* Acoustic Buzzer State */}
          <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)' }}>
            <span className="text-muted cluster" style={{ gap: 4 }}>
              {buzzerStatus.icon}
              <span>Buzzer:</span>
            </span>
            <Badge tone={buzzerStatus.tone}>{buzzerStatus.label}</Badge>
          </div>
        </div>

        {/* Card 2: Cabin Climate Monitor (DHT22) */}
        <div
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="cluster" style={{ gap: 6, fontWeight: 700, fontSize: '0.85rem' }}>
              <Thermometer size={18} color="#06b6d4" />
              <span>Cabin Environment</span>
            </span>
            <Badge tone="info">Live Climate</Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', margin: '0.25rem 0' }}>
            <div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800 }}>
                {tempC != null ? `${tempC.toFixed(1)}°C` : '--.-°C'}
              </div>
              <div className="text-muted" style={{ fontSize: '0.76rem' }}>Ambient Temperature</div>
            </div>
            <div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800 }}>
                {humidity != null ? `${Math.round(humidity)}%` : '--%'}
              </div>
              <div className="text-muted" style={{ fontSize: '0.76rem' }}>Relative Humidity</div>
            </div>
          </div>

          <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)' }}>
            <span className="text-muted cluster" style={{ gap: 4 }}>
              <Droplets size={14} />
              <span>Moisture Risk:</span>
            </span>
            <Badge tone={humidity != null && humidity >= 85 ? 'warning' : 'success'}>
              {humidity != null && humidity >= 85 ? 'High Humidity' : 'Nominal'}
            </Badge>
          </div>
        </div>

        {/* Card 3: Security & PIR Motion Sentinel */}
        <div
          style={{
            background: motion ? 'rgba(239, 68, 68, 0.08)' : 'var(--color-bg-secondary)',
            border: `1px solid ${motion ? 'var(--color-danger)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="cluster" style={{ gap: 6, fontWeight: 700, fontSize: '0.85rem' }}>
              <Eye size={18} color={motion ? 'var(--color-danger)' : 'var(--color-brand)'} />
              <span>Cabin Security Sentinel</span>
            </span>
            <Badge tone={motion ? 'danger' : 'success'}>
              {motion ? 'ALARM ACTIVE' : 'SECURE'}
            </Badge>
          </div>

          <div style={{ margin: '0.25rem 0' }}>
            <div style={{ fontSize: '1.55rem', fontWeight: 800, color: motion ? 'var(--color-danger)' : 'inherit' }}>
              {motion ? '>> MOTION DETECTED <<' : 'PIR Area Clear'}
            </div>
            <div className="text-muted" style={{ fontSize: '0.78rem' }}>
              {motion ? 'Infrared body movement triggered in monitored perimeter!' : 'No movement or intrusion detected inside enclosure'}
            </div>
          </div>

          <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)' }}>
            <span className="text-muted cluster" style={{ gap: 4 }}>
              <ShieldCheck size={14} />
              <span>Sentinel Mode:</span>
            </span>
            <span className="mono" style={{ fontWeight: 600 }}>Active Guardian</span>
          </div>
        </div>

        {/* Card 4: GPS Satellites & Vehicle Navigation */}
        <div
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="cluster" style={{ gap: 6, fontWeight: 700, fontSize: '0.85rem' }}>
              <Satellite size={18} color="#eab308" />
              <span>Satellite Geolocation</span>
            </span>
            <Badge tone={hasGpsLock ? 'success' : 'warning'}>
              {hasGpsLock ? '3D Fix Active' : 'Default Base (Indoor)'}
            </Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', margin: '0.25rem 0' }}>
            <div>
              <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                {currentLat.toFixed(6)}°N
              </div>
              <div className="text-muted" style={{ fontSize: '0.76rem' }}>Latitude {hasGpsLock ? '' : '(Default Base)'}</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                {currentLng.toFixed(6)}°E
              </div>
              <div className="text-muted" style={{ fontSize: '0.76rem' }}>Longitude {hasGpsLock ? '' : '(Default Base)'}</div>
            </div>
          </div>

          <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)' }}>
            <span className="text-muted cluster" style={{ gap: 4 }}>
              <Compass size={14} />
              <span>Heading: {currentHeading}°</span>
            </span>
            <span className="mono" style={{ fontWeight: 700 }}>
              {Math.round(currentSpeed)} km/h
            </span>
          </div>
        </div>
      </div>

      {/* Gateway Telemetry & Pipeline Diagnostics */}
      <Panel
        title="Gateway Diagnostics & Telemetry Pipeline"
        subtitle="Real-time edge ingestion stream, protocol verification and gateway synchronization"
        icon={<Server size={16} />}
        action={
          <Badge tone={isHeartbeatLive ? 'success' : 'danger'}>
            <StatusDot tone={isHeartbeatLive ? 'success' : 'danger'} pulse={isHeartbeatLive} />
            <span style={{ marginLeft: 6, fontWeight: 700 }}>
              {isHeartbeatLive ? 'Uplink Synchronized' : 'Gateway Disconnected'}
            </span>
          </Badge>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div className="text-muted" style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Ingest Protocol</div>
            <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 4 }}>
              {device.protocol} Ingestion
            </div>
            <div className="text-muted" style={{ fontSize: '0.76rem', marginTop: 4 }}>
              Encrypted Bearer Authentication
            </div>
          </div>

          <div style={{ padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div className="text-muted" style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Wireless Signal</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <SignalBars dbm={device.signalDbm} />
              <span className="mono" style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                {device.signalDbm != null ? `${device.signalDbm} dBm` : 'Stable Link'}
              </span>
            </div>
            <div className="text-muted" style={{ fontSize: '0.76rem', marginTop: 4 }}>
              Low-latency edge connection
            </div>
          </div>

          <div style={{ padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div className="text-muted" style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Firmware & Dispatch</div>
            <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 4 }}>
              {device.firmware ?? 'v2.1-edge'}
            </div>
            <div className="text-muted" style={{ fontSize: '0.76rem', marginTop: 4 }}>
              Event-driven real-time dispatch
            </div>
          </div>

          <div style={{ padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div className="text-muted" style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Ingested Packets</div>
            <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 4 }}>
              {telemetryPoints.length.toLocaleString('en-IN')} Events
            </div>
            <div className="text-muted" style={{ fontSize: '0.76rem', marginTop: 4 }}>
              Last sync: {fmtRelative(currentLastSeen)}
            </div>
          </div>
        </div>
      </Panel>

      {/* Live Map Section */}
      <Panel title="Vehicle Live Geographical Location" subtitle="Current coordinates reported by telematics tracker" icon={<Compass size={16} />}>
        <div style={{ height: 320, borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <MiniMap
            lat={currentLat}
            lng={currentLng}
            heading={currentHeading}
            isIot={true}
            registrationNumber={vehicle?.registrationNumber ?? 'MP07-DG-6386'}
          />
        </div>
      </Panel>

      {/* Real-Time Telemetry Ledger Table */}
      <Panel
        title="Live Telemetry Ingestion Log"
        subtitle="Recent sensor payloads ingested and validated by Sanchay Fleet Cloud"
        icon={<Activity size={16} />}
        action={
          <Badge tone="neutral">
            {telemetryPoints.length} recorded events
          </Badge>
        }
      >
        {telemetryPoints.length === 0 ? (
          <EmptyState title="No telemetry points recorded yet" description="Live incoming packets will appear here once ingested." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Coordinates</th>
                  <th>Speed</th>
                  <th>Heading</th>
                  <th>Ignition</th>
                  <th>Fuel</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {telemetryPoints.map((tp: TelemetryPointRow) => (
                  <tr key={tp.id}>
                    <td>
                      <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {fmtClock(tp.receivedAt)}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                        {fmtRelative(tp.receivedAt)}
                      </div>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: '0.8rem' }}>
                        {tp.lat.toFixed(4)}°N, {tp.lng.toFixed(4)}°E
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                        {Math.round(tp.speedKmph)} km/h
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: '0.8rem' }}>
                        {tp.heading}°
                      </span>
                    </td>
                    <td>
                      <Badge tone={tp.ignition ? 'success' : 'neutral'}>
                        {tp.ignition ? 'ON' : 'OFF'}
                      </Badge>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: '0.8rem' }}>
                        {tp.fuelPercent != null ? `${tp.fuelPercent}%` : '—'}
                      </span>
                    </td>
                    <td>
                      <Badge tone="success">SYNCED</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
