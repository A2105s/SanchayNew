'use client';

import { use, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Users,
  MapPin,
  Clock3,
  Wrench,
  CalendarDays,
  AlertTriangle,
  ArrowRightLeft,
  Building2
} from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { useApiResource } from '@/hooks/useApiResource';
import { fmtDateTime } from '@/lib/fleet/format';
import { toIstWallClock } from '@/lib/fleet/spaces';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { MiniMap } from '@/components/vehicles/MiniMap';
import { SpaceStateBadge, SpaceCategoryLabel } from '@/components/spaces/SpaceCard';
import { SpacesNav } from '@/components/spaces/SpacesNav';
import { SpaceBookingCalendar } from '@/components/spaces/SpaceBookingCalendar';
import { RelocateDialog } from '@/components/spaces/RelocateDialog';
import type { SpaceBookingView, SpaceMaintenanceView, SpaceView } from '@/types';

interface SpaceDetailResponse {
  space: SpaceView;
  bookings: SpaceBookingView[];
  maintenance: SpaceMaintenanceView[];
  openMaintenanceCount: number;
}

function SpaceDetailInner({ params }: { params: Promise<{ id: string }> }) {
  // App Router params unwrapped via React.use()
  const { id } = use(params);
  const searchParams = useSearchParams();
  const { can } = useFleet();
  const { data, loading, error, refetch } = useApiResource<SpaceDetailResponse>(`/api/cloud/spaces/${id}`);

  // URL search params passed from AI drafter or direct query
  const rawBook = searchParams.get('book');
  const rawStartAt = searchParams.get('startAt');
  const rawEndAt = searchParams.get('endAt');
  const rawAttendees = searchParams.get('attendees');
  const rawPurpose = searchParams.get('purpose');

  const queryDefaults = useMemo(() => {
    let dateStr = '';
    let startStr = '10:00';
    let endStr = '12:00';
    if (rawStartAt) {
      const sDate = new Date(rawStartAt);
      if (!Number.isNaN(sDate.getTime())) {
        const ist = toIstWallClock(sDate);
        dateStr = ist.toISOString().slice(0, 10);
        startStr = ist.toISOString().slice(11, 16);
      }
    }
    if (rawEndAt) {
      const eDate = new Date(rawEndAt);
      if (!Number.isNaN(eDate.getTime())) {
        const ist = toIstWallClock(eDate);
        endStr = ist.toISOString().slice(11, 16);
      }
    }
    return {
      date: dateStr,
      start: startStr,
      end: endStr,
      attendees: rawAttendees || '',
      purpose: rawPurpose || ''
    };
  }, [rawStartAt, rawEndAt, rawAttendees, rawPurpose]);

  const [bookOpen, setBookOpen] = useState(() => rawBook === '1');
  const [slotPrefill, setSlotPrefill] = useState<{ date?: string; start?: string; end?: string } | null>(null);
  const [relocateBooking, setRelocateBooking] = useState<SpaceBookingView | null>(null);

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

  function handleSelectSlot(dateStr: string, startIst: string, endIst: string) {
    setSlotPrefill({ date: dateStr, start: startIst, end: endIst });
    setBookOpen(true);
  }

  return (
    <div className="page stack">
      <Link href="/spaces" className="back-link"><ArrowLeft size={15} aria-hidden="true" /> Back to spaces</Link>
      
      <PageTitle
        title={space.name}
        description={`${space.assetCode} · ${SpaceCategoryLabel({ category: space.category })} · ${space.organizationName}`}
        action={canBook ? (
          <Button variant="primary" icon={<CalendarDays size={14} />} onClick={() => { setSlotPrefill(null); setBookOpen(true); }}>
            Book this space
          </Button>
        ) : undefined}
      />

      <SpacesNav active="spaces" />

      <div className="cluster" style={{ flexWrap: 'wrap' }}>
        <SpaceStateBadge space={space} />
        {space.busyNow ? <Badge tone="info">In use right now</Badge> : null}
        {space.blockedByMaintenance ? <Badge tone="danger">Booking blocked by maintenance</Badge> : null}
        <Badge tone="neutral">{space.minBookingHours}–{space.maxBookingHours} h bookings</Badge>
        <Badge tone="neutral">Lead time {space.bookingLeadDays} d</Badge>
      </div>

      {/* Emergency Relocation Banner when space is blocked by maintenance */}
      {space.blockedByMaintenance ? (
        <Panel title="Emergency Relocation Assistance">
          <div className="stack" style={{ gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--color-danger)' }}>
              <AlertTriangle size={20} />
              <strong style={{ fontSize: '0.95rem' }}>Facility Offline — Active Maintenance Block</strong>
            </div>
            <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Reservations are currently paused for this venue due to unresolved maintenance. Existing bookings should be rescheduled or relocated to matching facilities.
            </p>
            <AlternativeVenues currentSpaceId={space.id} minCapacity={space.capacity} />
          </div>
        </Panel>
      ) : null}

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

      {/* Live Spec 09 Booking Calendar */}
      <SpaceBookingCalendar
        space={space}
        canBook={canBook}
        onSelectSlot={handleSelectSlot}
      />

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
                <tr>
                  <th>Reference</th>
                  <th>When (IST)</th>
                  <th>Purpose</th>
                  <th>Status</th>
                  {canManage ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {bookings.slice(0, 15).map((b) => (
                  <tr key={b.id}>
                    <td className="mono">{b.bookingCode}</td>
                    <td>{fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)}</td>
                    <td>{b.purpose}</td>
                    <td>
                      <Badge tone={b.status === 'CONFIRMED' ? 'success' : b.status === 'PENDING' ? 'warning' : b.status === 'REJECTED' ? 'danger' : 'neutral'}>
                        {b.status}
                      </Badge>
                    </td>
                    {canManage ? (
                      <td>
                        {(b.status === 'CONFIRMED' || b.status === 'PENDING') ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<ArrowRightLeft size={13} />}
                            onClick={() => setRelocateBooking(b)}
                          >
                            Relocate
                          </Button>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {bookOpen ? (
        <BookingDialog
          space={space}
          initialDate={slotPrefill?.date || queryDefaults.date || undefined}
          initialStart={slotPrefill?.start || queryDefaults.start}
          initialEnd={slotPrefill?.end || queryDefaults.end}
          initialPurpose={queryDefaults.purpose}
          initialAttendees={queryDefaults.attendees}
          onClose={() => { setBookOpen(false); setSlotPrefill(null); }}
          onDone={() => { setBookOpen(false); setSlotPrefill(null); refetch(); }}
        />
      ) : null}

      {relocateBooking ? (
        <RelocateDialog
          booking={relocateBooking}
          onClose={() => setRelocateBooking(null)}
          onDone={() => { setRelocateBooking(null); refetch(); }}
        />
      ) : null}
    </div>
  );
}

function AlternativeVenues({ currentSpaceId, minCapacity }: { currentSpaceId: string; minCapacity: number }) {
  const url = `/api/cloud/spaces?availableOnly=true&minCapacity=${minCapacity}`;
  const { data, loading } = useApiResource<{ spaces: SpaceView[] }>(url);
  const alternatives = (data?.spaces ?? []).filter((s) => s.id !== currentSpaceId).slice(0, 4);

  if (loading) return <p className="text-muted" style={{ fontSize: '0.85rem' }}>Scanning for alternative venues…</p>;
  if (alternatives.length === 0) {
    return <p className="text-muted" style={{ fontSize: '0.85rem' }}>No alternate venues with capacity ≥ {minCapacity} currently open.</p>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
      {alternatives.map((alt) => (
        <div
          key={alt.id}
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <strong style={{ fontSize: '0.88rem' }}>{alt.name}</strong>
              <div className="mono text-muted" style={{ fontSize: '0.72rem' }}>{alt.assetCode}</div>
            </div>
            <Badge tone="success">Open</Badge>
          </div>
          <div className="text-muted" style={{ fontSize: '0.78rem' }}>
            <Users size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Capacity {alt.capacity} · {[alt.buildingOrCampus, alt.district].filter(Boolean).join(', ') || 'Main Campus'}
          </div>
          <Link href={`/spaces/${alt.id}`}>
            <Button variant="secondary" size="sm" icon={<Building2 size={13} />} style={{ width: '100%', marginTop: 4 }}>
              Switch to venue
            </Button>
          </Link>
        </div>
      ))}
    </div>
  );
}

function BookingDialog({
  space,
  initialDate,
  initialStart,
  initialEnd,
  initialPurpose,
  initialAttendees,
  onClose,
  onDone
}: {
  space: SpaceView;
  initialDate?: string;
  initialStart?: string;
  initialEnd?: string;
  initialPurpose?: string;
  initialAttendees?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [today] = useState(() => new Date(Date.now() + space.bookingLeadDays * 86_400_000).toISOString().slice(0, 10));
  const [date, setDate] = useState(() => initialDate || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [start, setStart] = useState(() => initialStart || '10:00');
  const [end, setEnd] = useState(() => initialEnd || '12:00');
  const [purpose, setPurpose] = useState(() => initialPurpose || '');
  const [attendees, setAttendees] = useState(() => initialAttendees || '');
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
      // Treat the IST wall-clock fields as IST instants: subtract 5:30 offset
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

export default function SpaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="page"><EmptyState title="Loading space…" /></div>}>
      <SpaceDetailInner params={params} />
    </Suspense>
  );
}
