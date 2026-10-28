'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, MapPin, Clock3, Wrench, CalendarDays } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { useApiResource } from '@/hooks/useApiResource';
import { fmtDateTime } from '@/lib/fleet/format';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { MiniMap } from '@/components/vehicles/MiniMap';
import { SpaceStateBadge, SpaceCategoryLabel } from '@/components/spaces/SpaceCard';
import type { SpaceBookingView, SpaceMaintenanceView, SpaceView } from '@/types';

interface SpaceDetailResponse {
  space: SpaceView;
  bookings: SpaceBookingView[];
  maintenance: SpaceMaintenanceView[];
  openMaintenanceCount: number;
}

export default function SpaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Next.js App Router passes params as a promise to server components; for the client page we
  // unwrap it via React.use(). See node_modules/next docs on the params convention.
  const { id } = use(params);
  const { can } = useFleet();
  const { data, loading, error, refetch } = useApiResource<SpaceDetailResponse>(`/api/cloud/spaces/${id}`);
  const [bookOpen, setBookOpen] = useState(false);

  if (loading && !data) return <div className="page"><EmptyState title="Loading space…" /></div>;
  if (error || !data) {
    return (
      <div className="page">
        <EmptyState title={error ?? 'Space not found.'} action={<Button variant="secondary" onClick={refetch}>Retry</Button>} />
      </div>
    );
  }

  const { space, bookings, maintenance } = data;
  const canBook = can('space.book') && !space.blockedByMaintenance && space.operationalState !== 'RESTRICTED' && space.operationalState !== 'RETIRED';
  const canManage = can('space.manage');

  return (
    <div className="page stack">
      <Link href="/spaces" className="back-link"><ArrowLeft size={15} aria-hidden="true" /> Back to spaces</Link>
      <PageTitle
        title={space.name}
        description={`${space.assetCode} · ${SpaceCategoryLabel({ category: space.category })} · ${space.organizationName}`}
        action={canBook ? <Button variant="primary" icon={<CalendarDays size={14} />} onClick={() => setBookOpen(true)}>Book this space</Button> : undefined}
      />

      <div className="cluster" style={{ flexWrap: 'wrap' }}>
        <SpaceStateBadge space={space} />
        {space.busyNow ? <Badge tone="info">In use right now</Badge> : null}
        {space.blockedByMaintenance ? <Badge tone="danger">Booking blocked by maintenance</Badge> : null}
        <Badge tone="neutral">{space.minBookingHours}–{space.maxBookingHours} h bookings</Badge>
        <Badge tone="neutral">Lead time {space.bookingLeadDays} d</Badge>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <Panel title="About">
          <p style={{ margin: '0 0 0.5rem' }}>{space.description ?? 'No description recorded.'}</p>
          <div className="kv">
            <span><MapPin size={13} aria-hidden="true" /> Location</span>
            <span>{[space.buildingOrCampus, space.addressLine, space.district, space.city].filter(Boolean).join(', ') || '—'}</span>
            <span><Users size={13} aria-hidden="true" /> Capacity</span>
            <span>{space.capacity} people{space.areaSqft ? ` · ${space.areaSqft} sq ft` : ''}</span>
            <span>Manager</span>
            <span>{space.managerName ?? '—'}</span>
            <span>Contact officer</span>
            <span>{space.contactOfficerName ?? '—'}{space.contactPhone ? ` · ${space.contactPhone}` : ''}</span>
          </div>
          {space.amenities.length ? (
            <div className="cluster" style={{ marginTop: '0.6rem', flexWrap: 'wrap' }}>
              {space.amenities.map((a) => <Badge key={a} tone="neutral">{a}</Badge>)}
            </div>
          ) : null}
          {space.accessibility.length ? (
            <div className="cluster" style={{ marginTop: '0.4rem', flexWrap: 'wrap' }}>
              {space.accessibility.map((a) => <Badge key={a} tone="info">{a}</Badge>)}
            </div>
          ) : null}
        </Panel>

        <Panel title="Operating hours (IST)">
          <div className="kv">
            {Object.entries(space.operatingHours).length === 0 ? <span className="text-muted">Not recorded</span> : null}
            {Object.entries(space.operatingHours).map(([day, window]) => (
              <span key={day} style={{ textTransform: 'capitalize' }}>
                <Clock3 size={12} aria-hidden="true" /> {day}
                <span style={{ marginLeft: 'auto' }}>{window[0]} – {window[1]}</span>
              </span>
            ))}
          </div>
          {space.lat != null && space.lng != null ? (
            <div style={{ marginTop: '0.8rem' }}>
              <MiniMap lat={space.lat} lng={space.lng} heading={0} />
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel title="Maintenance">
        {canManage ? <MaintenanceForm spaceId={space.id} onDone={refetch} /> : null}
        {maintenance.length === 0 ? <p className="text-muted">No maintenance tickets.</p> : (
          <ul className="plain-list">
            {maintenance.map((m) => (
              <li key={m.id}>
                <strong>{m.title}</strong> <Badge tone={m.severity === 'CRITICAL' ? 'danger' : m.severity === 'HIGH' ? 'warning' : 'neutral'}>{m.severity}</Badge>{' '}
                <Badge tone={m.status === 'RESOLVED' ? 'success' : 'warning'}>{m.status}</Badge>
                {m.blocksBooking ? <Badge tone="danger">Blocks booking</Badge> : null}
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Reported by {m.reportedBy} · {fmtDateTime(m.createdAt)}
                  {m.resolvedAt ? ` · resolved by ${m.resolvedBy}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recent bookings">
        {bookings.length === 0 ? <p className="text-muted">No bookings yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Reference</th><th>When (IST)</th><th>Purpose</th><th>Status</th></tr>
              </thead>
              <tbody>
                {bookings.slice(0, 12).map((b) => (
                  <tr key={b.id}>
                    <td className="mono">{b.bookingCode}</td>
                    <td>{fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)}</td>
                    <td>{b.purpose}</td>
                    <td><Badge tone={b.status === 'CONFIRMED' ? 'success' : b.status === 'PENDING' ? 'warning' : b.status === 'REJECTED' ? 'danger' : 'neutral'}>{b.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {bookOpen ? (
        <BookingDialog space={space} onClose={() => setBookOpen(false)} onDone={() => { setBookOpen(false); refetch(); }} />
      ) : null}
    </div>
  );
}

function BookingDialog({ space, onClose, onDone }: { space: SpaceView; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [today] = useState(() => new Date(Date.now() + space.bookingLeadDays * 86_400_000).toISOString().slice(0, 10));
  const [date, setDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('12:00');
  const [purpose, setPurpose] = useState('');
  const [attendees, setAttendees] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const durationH = useMemo(() => {
    const s = new Date(`${date}T${start}:00Z`);
    const e = new Date(`${date}T${end}:00Z`);
    return (e.getTime() - s.getTime()) / 3_600_000;
  }, [date, start, end]);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      // Treat the IST wall-clock fields as IST instants: subtract the 5:30 offset before sending UTC.
      const startAt = new Date(new Date(`${date}T${start}:00+05:30`).getTime());
      const endAt = new Date(new Date(`${date}T${end}:00+05:30`).getTime());
      const created = await api.post<SpaceBookingView>('/api/cloud/space-bookings', {
        spaceId: space.id,
        purpose: purpose.trim(),
        attendees: attendees ? Number(attendees) : undefined,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString()
      });
      toast(created.status === 'CONFIRMED' ? `Confirmed — ${created.bookingCode}` : `Submitted for approval — ${created.bookingCode}`, 'success');
      onDone();
    } catch (e) {
      const m = e instanceof ApiError ? e.message : 'Booking failed';
      setErr(m);
      toast(m, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Book ${space.name}`} onClose={onClose}>
      <div className="stack">
        {err ? <div className="toast-inline toast-inline--danger" role="alert"><span className="toast-inline__message">{err}</span></div> : null}
        <Field label="Date"><input className="input" type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label={`Start (IST, opens ${space.operatingHours ? 'per hours panel' : '—'})`}><input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="End (IST)"><input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Purpose"><textarea className="input" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. District review meeting" /></Field>
        <Field label={`Attendees (capacity ${space.capacity})`}><input className="input" type="number" min={1} value={attendees} onChange={(e) => setAttendees(e.target.value)} /></Field>
        <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
          Duration {Number.isFinite(durationH) ? durationH : 0} h · allowed {space.minBookingHours}–{space.maxBookingHours} h · earliest date {today} (lead {space.bookingLeadDays} d).
          Overlapping requests are rejected server-side — only one request can hold a slot.
        </p>
        <div className="cluster" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!purpose.trim()}>Request booking</Button>
        </div>
      </div>
    </Modal>
  );
}

function MaintenanceForm({ spaceId, onDone }: { spaceId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/cloud/spaces/${spaceId}/actions`, { type: 'raiseMaintenance', title: title.trim(), severity, description: description.trim() || undefined });
      toast('Maintenance ticket raised', 'success');
      setTitle('');
      setDescription('');
      setOpen(false);
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed', 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <Button variant="secondary" size="sm" icon={<Wrench size={14} />} onClick={() => setOpen(!open)}>Raise maintenance</Button>
      {open ? (
        <div className="veh-inline-form" style={{ marginTop: '0.5rem' }}>
          <input className="input" placeholder="Issue title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity">
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s} value={s}>{s}{s === 'CRITICAL' ? ' (blocks booking)' : ''}</option>)}
          </select>
          <input className="input" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="cluster">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={submit} loading={busy} disabled={!title.trim()}>Raise</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
