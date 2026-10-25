'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, AlertTriangle, LoaderCircle, Info, CalendarClock } from 'lucide-react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { Field } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { AvailabilityBadge, EligibilityBadge, OperationalBadge } from '@/components/ui/StatusBadges';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { useRouter } from 'next/navigation';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { CLASS_LABEL, fmtDateTime } from '@/lib/fleet/format';
import type { AvailabilityView, VehicleCardView, VehicleClass, VehicleSearchResult } from '@/types';
import { RequestWizard, type RequestWizardPrefill } from '@/components/requests/RequestWizard';

const CLASSES: VehicleClass[] = ['PATROL_CAR', 'MOTORCYCLE', 'VAN', 'HEAVY'];
const PAGE_SIZE = 25;

function toIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export function VehicleDiscover() {
  const { toast } = useToast();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [vehicleClass, setVehicleClass] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<VehicleSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [prefill, setPrefill] = useState<RequestWizardPrefill | null>(null);
  const seq = useRef(0);

  const runSearch = useCallback(
    (targetPage: number) => {
      const fromIso = toIso(from);
      const toIsoVal = toIso(to);
      if ((from || to) && (!fromIso || !toIsoVal)) {
        setDateError('Both from and to are required to check availability.');
        return;
      }
      if (fromIso && toIsoVal && new Date(toIsoVal) <= new Date(fromIso)) {
        setDateError('End must be after start.');
        return;
      }
      setDateError(null);
      const id = ++seq.current;
      setLoading(true);
      setError(null);
      const sp = new URLSearchParams({ scope: 'discover', page: String(targetPage), pageSize: String(PAGE_SIZE) });
      if (q) sp.set('q', q);
      if (vehicleClass) sp.set('vehicleClass', vehicleClass);
      if (fromIso) sp.set('from', fromIso);
      if (toIsoVal) sp.set('to', toIsoVal);
      api
        .get<VehicleSearchResult>(`/api/cloud/vehicles/search?${sp.toString()}`)
        .then((data) => {
          if (id !== seq.current) return;
          setResult(data);
          setSearched(true);
        })
        .catch((err) => {
          if (id !== seq.current) return;
          if (err instanceof ApiError && err.status === 401) return;
          setError(err instanceof Error ? err.message : 'Search failed.');
          setResult(null);
        })
        .finally(() => {
          if (id === seq.current) setLoading(false);
        });
    },
    [q, vehicleClass, from, to]
  );

  useEffect(() => {
    runSearch(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function onSearch() {
    if (page === 1) runSearch(1);
    else setPage(1);
  }

  const rows = (result?.items ?? []) as VehicleCardView[];

  return (
    <div className="page stack">
      <PageTitle
        title="Discover vehicles"
        description="Cross-organization discovery of eligible government-fleet vehicles you can request."
      />

      <div className="toast-inline" role="note" style={{ background: 'var(--color-surface-2, transparent)' }}>
        <Info size={16} className="toast-inline__icon" aria-hidden="true" />
        <span className="toast-inline__message">
          Only <strong>eligible government-fleet</strong> vehicles from other organizations appear here. Registration
          is masked and driver/odometer/exact position are hidden until a request is approved and handed over.
        </span>
      </div>

      <Panel>
        <div className="stack">
          <div className="veh-toolbar-row">
            <div className="veh-search">
              <SearchField value={q} onChange={setQ} placeholder="Search asset code or name" ariaLabel="Search vehicles" />
            </div>
            <Select
              value={vehicleClass}
              onChange={setVehicleClass}
              options={[{ value: '', label: 'All classes' }, ...CLASSES.map((c) => ({ value: c, label: CLASS_LABEL[c] }))]}
              ariaLabel="Filter by class"
            />
          </div>
          <div className="grid-2">
            <Field label="Available from" hint="Both from and to are required to check availability." error={dateError ?? undefined}>
              <input className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Available to">
              <input className="input" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <div className="cluster">
            <Button variant="primary" icon={<Search size={16} />} onClick={onSearch} loading={loading}>
              Search
            </Button>
            {result?.from && result?.to ? (
              <span className="text-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                <CalendarClock size={14} aria-hidden="true" />
                Availability for {fmtDateTime(result.from)} – {fmtDateTime(result.to)} (as of {fmtDateTime(result.asOf)})
              </span>
            ) : null}
          </div>
        </div>
      </Panel>

      {loading && !result ? (
        <Panel>
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }} aria-busy="true">
            <LoaderCircle size={18} className="spin" aria-hidden="true" /> Searching…
          </p>
        </Panel>
      ) : error ? (
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title="Could not search vehicles"
          description={error}
          action={<Button variant="primary" onClick={() => runSearch(page)}>Retry</Button>}
        />
      ) : searched && rows.length === 0 ? (
        <EmptyState
          icon={<Search size={28} />}
          title="No eligible vehicles found"
          description="No eligible government-fleet vehicles match your search for this window. Try a different class or date range."
        />
      ) : rows.length > 0 ? (
        <div className="veh-discover-grid">
          {rows.map((v) => {
            const availability = v.availability as AvailabilityView;
            const requestable = availability?.state === 'AVAILABLE';
            return (
              <div key={v.id} className="veh-card veh-card--discover">
                <div className="veh-card-head">
                  <div>
                    <div className="veh-card-reg mono">{v.registrationMasked}</div>
                    <div className="veh-card-sub">{v.displayName}</div>
                  </div>
                </div>
                <div className="cluster" style={{ gap: '0.3rem', flexWrap: 'wrap' }}>
                  <OperationalBadge status={v.operationalStatus} />
                  <EligibilityBadge state={v.eligibilityState} />
                  <AvailabilityBadge availability={availability} />
                </div>
                <div className="veh-card-meta">
                  <span>{CLASS_LABEL[v.vehicleClass]}</span>
                  <span>{v.organizationName}</span>
                  {v.stationName ? <span>{v.stationName}</span> : null}
                </div>
                {availability?.reasons?.length ? (
                  <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>{availability.reasons.join(' · ')}</p>
                ) : null}
                <FreshnessBadge freshness={v.telemetryFreshness} lastSeenAt={v.lastSeenAt} />
                <div className="veh-card-foot">
                  <Button
                    variant={requestable ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() =>
                      setPrefill({
                        vehicleId: v.id,
                        vehicleLabel: `${v.registrationMasked} · ${v.displayName}`,
                        requestedClass: v.vehicleClass,
                        from: result?.from ?? (toIso(from) || undefined),
                        to: result?.to ?? (toIso(to) || undefined)
                      })
                    }
                  >
                    Request this vehicle
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Search size={28} />}
          title="Search for vehicles to request"
          description="Enter a date range to see which eligible vehicles are available, or search by class and name."
        />
      )}

      {result && result.total > PAGE_SIZE ? (
        <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onPage={setPage} />
      ) : null}

      {prefill ? (
        <RequestWizard
          prefill={prefill}
          onClose={() => setPrefill(null)}
          onDone={(created) => {
            setPrefill(null);
            router.push(`/requests/${created.id}`);
          }}
        />
      ) : null}
    </div>
  );
}
