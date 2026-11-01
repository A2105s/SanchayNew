'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Building2,
  Sparkles,
  Landmark,
  GraduationCap,
  Briefcase,
  Theater,
  Users,
  Monitor
} from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { useApiResource } from '@/hooks/useApiResource';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { KpiCard, SectionHeading } from '@/components/analytics/AnalyticsKit';
import { SpaceCard } from '@/components/spaces/SpaceCard';
import { SpacesNav } from '@/components/spaces/SpacesNav';
import { SpacePulseSlot } from '@/components/ai/SpacePulseSlot';
import { DraftSpaceBookingPanel } from '@/components/ai/DraftSpaceBookingPanel';
import { PolishButton } from '@/components/ai/PolishButton';
import type { SpaceView } from '@/types';

const CATEGORIES = ['MEETING_ROOM', 'TRAINING_HALL', 'AUDITORIUM', 'OFFICE', 'COMMUNITY_HALL', 'STORE', 'OTHER'];
const STATES = ['AVAILABLE', 'IDLE', 'RESTRICTED', 'RETIRED'];

interface SpacesResponse {
  spaces: SpaceView[];
  total: number;
}

export default function SpacesPage() {
  const router = useRouter();
  const { can } = useFleet();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [state, setState] = useState('ALL');
  const [minCapacity, setMinCapacity] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [scope, setScope] = useState<'all' | 'managed'>('all');
  const [filterDate, setFilterDate] = useState('');
  const [filterStart, setFilterStart] = useState('09:00');
  const [filterEnd, setFilterEnd] = useState('17:00');
  const [registerOpen, setRegisterOpen] = useState(false);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (query.trim()) p.set('q', query.trim());
    if (category !== 'ALL') p.set('category', category);
    if (state !== 'ALL') p.set('state', state);
    if (minCapacity) p.set('minCapacity', minCapacity);
    if (availableOnly) p.set('availableOnly', 'true');
    if (scope === 'managed') p.set('scope', 'managed');
    if (filterDate) {
      try {
        const fromIso = new Date(`${filterDate}T${filterStart || '09:00'}:00+05:30`).toISOString();
        const toIso = new Date(`${filterDate}T${filterEnd || '17:00'}:00+05:30`).toISOString();
        p.set('from', fromIso);
        p.set('to', toIso);
      } catch (err) {
        // ignore date parse error
      }
    }
    return `/api/cloud/spaces?${p.toString()}`;
  }, [query, category, state, minCapacity, availableOnly, scope, filterDate, filterStart, filterEnd]);

  const { data, loading, error, refetch } = useApiResource<SpacesResponse>(url);
  const spaces = useMemo(() => data?.spaces ?? [], [data]);
  const canManage = can('space.manage');

  const kpis = useMemo(() => ({
    total: spaces.length,
    available: spaces.filter((s) => !s.busyNow && !s.blockedByMaintenance && s.operationalState !== 'RESTRICTED' && s.operationalState !== 'RETIRED').length,
    busy: spaces.filter((s) => s.busyNow).length,
    idle: spaces.filter((s) => (s.idleDays ?? 0) >= 14).length
  }), [spaces]);

  function onPickCandidate(cand: { spaceId: string }, draft: { startAt: string | null; endAt: string | null; attendees: number; purpose: string }) {
    const p = new URLSearchParams();
    if (draft.startAt) p.set('startAt', draft.startAt);
    if (draft.endAt) p.set('endAt', draft.endAt);
    if (draft.attendees) p.set('attendees', String(draft.attendees));
    if (draft.purpose) p.set('purpose', draft.purpose);
    p.set('book', '1');
    router.push(`/spaces/${cand.spaceId}?${p.toString()}`);
  }

  return (
    <div className="page stack">
      <PageTitle
        title="Civic Spaces"
        description="Government rooms, halls and facilities — discover, request and book across departments."
        action={canManage ? (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setRegisterOpen(true)}>Register space</Button>
        ) : undefined}
      />

      <SpacesNav active="spaces" />

      <SpacePulseSlot />

      <DraftSpaceBookingPanel onSelectCandidate={onPickCandidate} />

      <section className="an-kpis" aria-label="Spaces summary">
        <KpiCard label="Spaces in scope" value={kpis.total} tone="info" />
        <KpiCard label="Bookable now" value={kpis.available} tone="success" hint="No live booking or blocking maintenance" />
        <KpiCard label="In use" value={kpis.busy} tone="warning" hint="Live booking right now" />
        <KpiCard label="Idle 14+ days" value={kpis.idle} tone="neutral" hint="Candidates for activation" />
      </section>

      {/* Government Property Category Quick Bar */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
        {[
          { value: 'ALL', label: 'All Spaces', icon: Landmark },
          { value: 'TRAINING_HALL', label: 'Training Halls', icon: GraduationCap },
          { value: 'MEETING_ROOM', label: 'Meeting Rooms', icon: Briefcase },
          { value: 'AUDITORIUM', label: 'Auditoriums', icon: Theater },
          { value: 'COMMUNITY_HALL', label: 'Civic & Community', icon: Users },
          { value: 'OFFICE', label: 'Offices & Labs', icon: Monitor }
        ].map((chip) => {
          const Icon = chip.icon;
          const active = category === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => setCategory(chip.value)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 14px',
                borderRadius: 'var(--radius-pill, 9999px)',
                border: active ? '2px solid var(--color-brand)' : '1px solid var(--color-border)',
                background: active ? 'var(--color-brand-subtle)' : 'var(--color-surface)',
                color: active ? 'var(--color-brand)' : 'var(--color-text-primary)',
                fontWeight: active ? 700 : 500,
                fontSize: '0.84rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={15} aria-hidden="true" style={{ opacity: active ? 1 : 0.75 }} />
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      <Panel title="Find Government Properties">
        <div className="stack" style={{ gap: 12 }}>
          {/* Row 1: Search & Scope */}
          <div className="cluster" style={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <SearchField value={query} onChange={setQuery} placeholder="Search by name, campus, asset code or district..." ariaLabel="Search spaces" />

            {/* View Scope Toggle */}
            <div className="cluster" style={{ gap: 4, background: 'var(--color-surface-hover, #f1f5f9)', padding: 3, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setScope('all')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: scope === 'all' ? 700 : 500,
                  background: scope === 'all' ? 'var(--color-surface)' : 'transparent',
                  color: scope === 'all' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  boxShadow: scope === 'all' ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer'
                }}
              >
                All Departments
              </button>
              <button
                type="button"
                onClick={() => setScope('managed')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: scope === 'managed' ? 700 : 500,
                  background: scope === 'managed' ? 'var(--color-surface)' : 'transparent',
                  color: scope === 'managed' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  boxShadow: scope === 'managed' ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer'
                }}
              >
                Managed by My Org
              </button>
            </div>
          </div>

          {/* Row 2: Live Time Slot Search & Filters */}
          <div className="cluster" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
            <Field label="Target Date (Live Conflict Check)">
              <input
                className="input"
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                style={{ minWidth: 140 }}
              />
            </Field>

            {filterDate ? (
              <>
                <Field label="From (IST)">
                  <input
                    className="input"
                    type="time"
                    value={filterStart}
                    onChange={(e) => setFilterStart(e.target.value)}
                    style={{ width: 100 }}
                  />
                </Field>
                <Field label="To (IST)">
                  <input
                    className="input"
                    type="time"
                    value={filterEnd}
                    onChange={(e) => setFilterEnd(e.target.value)}
                    style={{ width: 100 }}
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    alignSelf: 'flex-end',
                    marginBottom: 2
                  }}
                >
                  Clear dates
                </button>
              </>
            ) : null}

            <Field label="Min Capacity">
              <input
                className="input"
                type="number"
                min={0}
                value={minCapacity}
                onChange={(e) => setMinCapacity(e.target.value)}
                placeholder="e.g. 50"
                style={{ width: 90 }}
              />
            </Field>

            <Select
              value={state}
              onChange={setState}
              ariaLabel="Operational State"
              options={[{ value: 'ALL', label: 'All states' }, ...STATES.map((s) => ({ value: s, label: s }))]}
            />

            <label className="cluster" style={{ gap: 6, fontSize: '0.85rem', alignSelf: 'flex-end', marginBottom: 6 }}>
              <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
              Bookable now only
            </label>
          </div>
        </div>
      </Panel>

      <SectionHeading title="All spaces" description={`${data?.total ?? 0} match your filters`} />
      {loading && spaces.length === 0 ? (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={150} />)}
        </div>
      ) : error ? (
        <EmptyState title={`Could not load spaces: ${error}`} action={<Button variant="secondary" onClick={refetch}>Retry</Button>} />
      ) : spaces.length === 0 ? (
        <EmptyState icon={<Building2 size={28} />} title="No spaces match these filters" />
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {spaces.map((s) => <SpaceCard key={s.id} space={s} canBook={can('space.book')} />)}
        </div>
      )}

      {registerOpen ? <RegisterModal onClose={() => setRegisterOpen(false)} onDone={() => { setRegisterOpen(false); refetch(); toast('Registration request submitted for review', 'success'); }} /> : null}
    </div>
  );
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function RegisterModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MEETING_ROOM');
  const [capacity, setCapacity] = useState('20');
  const [building, setBuilding] = useState('');
  const [district, setDistrict] = useState('');
  const [description, setDescription] = useState('');
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('18:00');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !Number(capacity)) {
      toast('Name and capacity are required', 'warning');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.post('/api/cloud/space-requests', {
        type: 'REGISTER',
        payload: {
          name: name.trim(),
          category,
          capacity: Number(capacity),
          buildingOrCampus: building.trim() || undefined,
          district: district.trim() || undefined,
          description: description.trim() || undefined,
          operatingHours: Object.fromEntries(DAY_KEYS.map((d) => [d, [openTime, closeTime]]))
        }
      });
      toast('Registration request submitted for review', 'success');
      onDone();
    } catch (e) {
      const m = e instanceof ApiError ? e.message : 'Failed to submit';
      setErr(m);
      toast(m, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Register a space" onClose={onClose}>
      <div className="stack">
        {err ? <div className="toast-inline toast-inline--danger" role="alert"><span className="toast-inline__message">{err}</span></div> : null}
        <Field label="Space name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Category">
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replaceAll('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Capacity"><input className="input" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Building / campus"><input className="input" value={building} onChange={(e) => setBuilding(e.target.value)} /></Field>
          <Field label="District / zone"><input className="input" value={district} onChange={(e) => setDistrict(e.target.value)} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Opens (IST)"><input className="input" type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} /></Field>
          <Field label="Closes (IST)"><input className="input" type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} /></Field>
        </div>
        <Field label="Description">
          <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Guidelines, access details, equipment available" />
          <PolishButton kind="space-spec" value={description} onApply={setDescription} disabled={busy} />
        </Field>
        <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>
          Registrations go to the Request Center — a reviewing officer approves them; you cannot approve your own request.
        </p>
        <div className="cluster" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>Submit request</Button>
        </div>
      </div>
    </Modal>
  );
}
