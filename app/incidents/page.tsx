'use client';

import { useMemo, useState } from 'react';
import { Siren, Plus, MapPin, WifiOff } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { fmtRelative } from '@/lib/fleet/format';
import { incidentSeverityTone } from '@/components/ops/shared';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusDot } from '@/components/ui/StatusDot';
import type { IncidentView, VehicleView } from '@/types';

type IncidentStatus = IncidentView['status'];
const COLUMNS: { id: IncidentStatus; label: string }[] = [
  { id: 'OPEN', label: 'Open' },
  { id: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { id: 'RESOLVED', label: 'Resolved' },
];

export default function IncidentsPage() {
  const { snapshot, loading, error, refresh, can, vehicleById } = useFleet();
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [sevFilter, setSevFilter] = useState<string>('ALL');
  const [reportOpen, setReportOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<{ incident: IncidentView; resolution: 'ACKNOWLEDGED' | 'RESOLVED' } | null>(null);

  const incidents = snapshot?.incidents ?? [];

  const filtered = useMemo(
    () =>
      incidents.filter((i) => {
        if (typeFilter !== 'ALL' && i.type !== typeFilter) return false;
        if (sevFilter !== 'ALL' && i.severity !== sevFilter) return false;
        return true;
      }),
    [incidents, typeFilter, sevFilter]
  );

  const byStatus = useMemo(() => {
    const g: Record<IncidentStatus, IncidentView[]> = { OPEN: [], ACKNOWLEDGED: [], RESOLVED: [] };
    for (const i of filtered) g[i.status].push(i);
    for (const k of Object.keys(g) as IncidentStatus[]) {
      g[k].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
    return g;
  }, [filtered]);

  const sosOpen = incidents.filter((i) => i.type === 'SOS' && i.status !== 'RESOLVED').length;

  if (loading && !snapshot) {
    return (
      <div className="page stack">
        <PageTitle title="Incidents" />
        <Skeleton height={320} />
      </div>
    );
  }
  if (error && !snapshot) {
    return (
      <div className="page">
        <EmptyState title="Could not load incidents" description={error} action={<Button onClick={() => refresh()}>Retry</Button>} />
      </div>
    );
  }

  return (
    <div className="page stack">
      <PageTitle
        eyebrow="Fleet"
        title="Incidents"
        description="Live incident board. SOS and critical events are highlighted."
        action={
          can('incident.write') ? (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setReportOpen(true)}>
              Report incident
            </Button>
          ) : undefined
        }
      />

      {sosOpen > 0 && (
        <div className="ops-card ops-card--sos" role="alert">
          <div className="cluster" style={{ alignItems: 'center' }}>
            <Siren size={18} color="#dc2626" />
            <strong>{sosOpen} active SOS / unresolved emergency{sosOpen > 1 ? 'ies' : ''}</strong>
          </div>
        </div>
      )}

      <div className="toolbar">
        <Select
          ariaLabel="Type filter"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: 'ALL', label: 'All types' },
            { value: 'SOS', label: 'SOS' },
            { value: 'BREAKDOWN', label: 'Breakdown' },
            { value: 'ACCIDENT', label: 'Accident' },
            { value: 'DAMAGE', label: 'Damage' },
            { value: 'GEOFENCE', label: 'Geofence' },
            { value: 'OTHER', label: 'Other' },
          ]}
        />
        <Select
          ariaLabel="Severity filter"
          value={sevFilter}
          onChange={setSevFilter}
          options={[
            { value: 'ALL', label: 'All severities' },
            { value: 'CRITICAL', label: 'Critical' },
            { value: 'WARNING', label: 'Warning' },
            { value: 'INFO', label: 'Info' },
          ]}
        />
      </div>

      <div className="ops-board">
        {COLUMNS.map((col) => (
          <div className="ops-col" key={col.id}>
            <div className="ops-col-head">
              <span>{col.label}</span>
              <Badge tone="neutral">{byStatus[col.id].length}</Badge>
            </div>
            {byStatus[col.id].length === 0 ? (
              <div className="ops-card">
                <span className="text-muted" style={{ fontSize: '0.82rem' }}>None</span>
              </div>
            ) : (
              byStatus[col.id].map((i) => (
                <IncidentCard
                  key={i.id}
                  incident={i}
                  vehicle={vehicleById(i.vehicleId)}
                  canAct={can('incident.write')}
                  onAck={() => setNoteFor({ incident: i, resolution: 'ACKNOWLEDGED' })}
                  onResolve={() => setNoteFor({ incident: i, resolution: 'RESOLVED' })}
                />
              ))
            )}
          </div>
        ))}
      </div>

      {reportOpen && (
        <ReportIncidentModal vehicles={snapshot!.vehicles} onClose={() => setReportOpen(false)} onDone={async () => { setReportOpen(false); await refresh(); }} toast={toast} />
      )}
      {noteFor && (
        <ResolveModal
          incident={noteFor.incident}
          resolution={noteFor.resolution}
          onClose={() => setNoteFor(null)}
          onDone={async () => { setNoteFor(null); await refresh(); }}
          toast={toast}
        />
      )}
    </div>
  );
}

function IncidentCard({
  incident,
  vehicle,
  canAct,
  onAck,
  onResolve,
}: {
  incident: IncidentView;
  vehicle: VehicleView | undefined;
  canAct: boolean;
  onAck: () => void;
  onResolve: () => void;
}) {
  const isSos = incident.type === 'SOS';
  return (
    <div className={`ops-card${isSos && incident.status !== 'RESOLVED' ? ' ops-card--sos' : ''}`}>
      <div className="cluster" style={{ justifyContent: 'space-between' }}>
        <span className="ops-card-title">
          {isSos && <Siren size={14} color="#dc2626" style={{ verticalAlign: 'middle', marginRight: 4 }} />}
          {incident.type} - {incident.incidentCode}
        </span>
        <Badge tone={incidentSeverityTone(incident.severity)}>{incident.severity}</Badge>
      </div>
      <div className="ops-card-meta">{vehicle?.registrationNumber ?? 'Unknown vehicle'}</div>
      <div style={{ fontSize: '0.84rem' }}>{incident.message}</div>
      <div className="cluster ops-card-meta" style={{ gap: 10 }}>
        <span>{incident.reporterName}</span>
        <span>{fmtRelative(incident.createdAt)}</span>
        {incident.offlineCaptured && (
          <span title="Captured offline"><WifiOff size={12} style={{ verticalAlign: 'middle' }} /> offline</span>
        )}
        {incident.lat != null && incident.lng != null && (
          <a
            href={`https://www.google.com/maps?q=${incident.lat},${incident.lng}`}
            target="_blank"
            rel="noreferrer"
            className="cluster"
            style={{ gap: 2 }}
          >
            <MapPin size={12} /> map
          </a>
        )}
      </div>
      {canAct && incident.status !== 'RESOLVED' && (
        <div className="cluster">
          {incident.status === 'OPEN' && (
            <Button size="sm" variant="secondary" onClick={onAck}>Acknowledge</Button>
          )}
          <Button size="sm" variant="primary" onClick={onResolve}>Resolve</Button>
        </div>
      )}
      {incident.status === 'RESOLVED' && (
        <StatusDot tone="success" label={`Resolved${incident.resolvedBy ? ` by ${incident.resolvedBy}` : ''}`} />
      )}
    </div>
  );
}

function ReportIncidentModal({
  vehicles,
  onClose,
  onDone,
  toast,
}: {
  vehicles: VehicleView[];
  onClose: () => void;
  onDone: () => void;
  toast: (m: string, v?: 'success' | 'warning' | 'danger' | 'info') => void;
}) {
  const [vehicleId, setVehicleId] = useState('');
  const [type, setType] = useState<IncidentView['type']>('BREAKDOWN');
  const [severity, setSeverity] = useState<IncidentView['severity']>('WARNING');
  const [message, setMessage] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  function useLocation() {
    if (!('geolocation' in navigator)) {
      toast('Geolocation not available', 'warning');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast('Location captured', 'success');
      },
      () => {
        setLocating(false);
        toast('Could not get location', 'warning');
      },
      { timeout: 8000 }
    );
  }

  async function submit() {
    if (!vehicleId || !message.trim()) return;
    setSaving(true);
    const payload = {
      type: 'logIncident' as const,
      incidentType: type,
      severity,
      message: message.trim(),
      lat: coords?.lat,
      lng: coords?.lng,
      offlineCaptured: typeof navigator !== 'undefined' ? !navigator.onLine : false,
    };
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const mod = await import('@/lib/client/offline-queue');
        await mod.enqueueOffline(`/api/cloud/vehicles/${vehicleId}/actions`, payload);
        toast('Offline - incident queued and will sync when online', 'info');
        onDone();
        return;
      }
      await api.post(`/api/cloud/vehicles/${vehicleId}/actions`, payload);
      toast('Incident reported', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not report incident', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Report incident"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!vehicleId || !message.trim()} onClick={submit}>Report</Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Vehicle" required>
          <Select
            ariaLabel="Vehicle"
            value={vehicleId}
            onChange={setVehicleId}
            placeholder="Select vehicle"
            options={vehicles.map((v) => ({ value: v.id, label: `${v.registrationNumber} - ${v.displayName}` }))}
          />
        </Field>
        <div className="grid-2">
          <Field label="Type">
            <Select
              ariaLabel="Type"
              value={type}
              onChange={(v) => setType(v as IncidentView['type'])}
              options={[
                { value: 'SOS', label: 'SOS' },
                { value: 'BREAKDOWN', label: 'Breakdown' },
                { value: 'ACCIDENT', label: 'Accident' },
                { value: 'DAMAGE', label: 'Damage' },
                { value: 'GEOFENCE', label: 'Geofence' },
                { value: 'OTHER', label: 'Other' },
              ]}
            />
          </Field>
          <Field label="Severity">
            <Select
              ariaLabel="Severity"
              value={severity}
              onChange={(v) => setSeverity(v as IncidentView['severity'])}
              options={[
                { value: 'INFO', label: 'Info' },
                { value: 'WARNING', label: 'Warning' },
                { value: 'CRITICAL', label: 'Critical' },
              ]}
            />
          </Field>
        </div>
        <Field label="Message" required>
          <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Describe what happened" />
        </Field>
        <div className="cluster">
          <Button variant="secondary" size="sm" icon={<MapPin size={14} />} loading={locating} onClick={useLocation}>
            {coords ? 'Location captured' : 'Use my location'}
          </Button>
          {coords && <span className="text-muted mono" style={{ fontSize: '0.78rem' }}>{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</span>}
        </div>
      </div>
    </Modal>
  );
}

function ResolveModal({
  incident,
  resolution,
  onClose,
  onDone,
  toast,
}: {
  incident: IncidentView;
  resolution: 'ACKNOWLEDGED' | 'RESOLVED';
  onClose: () => void;
  onDone: () => void;
  toast: (m: string, v?: 'success' | 'warning' | 'danger' | 'info') => void;
}) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api.post(`/api/cloud/vehicles/${incident.vehicleId}/actions`, {
        type: 'resolveIncident',
        incidentId: incident.id,
        resolution,
      });
      toast(resolution === 'ACKNOWLEDGED' ? 'Incident acknowledged' : 'Incident resolved', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not update incident', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={resolution === 'ACKNOWLEDGED' ? 'Acknowledge incident' : 'Resolve incident'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={submit}>{resolution === 'ACKNOWLEDGED' ? 'Acknowledge' : 'Resolve'}</Button>
        </>
      }
    >
      <div className="stack">
        <p className="text-muted">{incident.incidentCode} - {incident.message}</p>
        <Field label="Notes" hint="Optional">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
