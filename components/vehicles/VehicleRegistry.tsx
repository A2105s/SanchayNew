'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus,
  Upload,
  Download,
  LayoutGrid,
  List,
  ArrowUp,
  ArrowDown,
  ArrowDownUp,
  CarFront,
  AlertTriangle,
  LoaderCircle,
  Lock
} from 'lucide-react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { MetricTile } from '@/components/ui/MetricTile';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { OperationalBadge, OwnershipBadge, EligibilityBadge } from '@/components/ui/StatusBadges';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { fmtDate, SECTOR_LABEL, CLASS_LABEL } from '@/lib/fleet/format';
import type { VehicleSearchResult, VehicleView } from '@/types';
import { ComplianceBadge } from './shared';
import { VehicleCard, isVehicleView, registrationLabel, stationLabelOf } from './card-view';
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  parseFilters,
  filtersToQuery,
  toSearchQuery,
  hasActiveFilters,
  type RegistryFilters
} from './registry-filters';
import { RegisterWizard } from './RegisterWizard';
import { ImportModal } from './ImportModal';
import { BulkReassignModal } from './BulkModals';

const SEARCH_PLACEHOLDERS = [
  'Search by registration (MP07-AB-1234)',
  'Search by asset code',
  'Search by vehicle name'
];

const SECTORS = ['GMC_WASTE', 'AMBULANCE_108', 'POLICE_PATROL', 'PWD_HEAVY', 'HEALTH_VAN', 'ELECTION_REQUISITION'];
const CLASSES = ['PATROL_CAR', 'MOTORCYCLE', 'VAN', 'HEAVY'];
const OPERATIONAL = ['ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED'];
const ELIGIBILITY = ['ELIGIBLE', 'RESTRICTED', 'PENDING_VERIFICATION', 'INELIGIBLE'];
const OWNERSHIP = ['GOVERNMENT_FLEET', 'SEIZED_IMPOUNDED', 'OTHER_UNVERIFIED'];

const sectorLabel = (s: string) => SECTOR_LABEL?.[s as keyof typeof SECTOR_LABEL] ?? s;
const classLabel = (c: string) => CLASS_LABEL?.[c as keyof typeof CLASS_LABEL] ?? c;
const titleCase = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function SortHeader({
  label,
  field,
  filters,
  onSort
}: {
  label: string;
  field: RegistryFilters['sort'];
  filters: RegistryFilters;
  onSort: (field: RegistryFilters['sort']) => void;
}) {
  const active = filters.sort === field;
  return (
    <button
      type="button"
      className={`veh-sort-btn ${active ? 'veh-sort-btn--active' : ''}`}
      onClick={() => onSort(field)}
      aria-label={
        active ? `${label}, sorted ${filters.dir === 'asc' ? 'ascending' : 'descending'}` : `Sort by ${label}`
      }
    >
      {label}
      {active ? filters.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowDownUp size={13} />}
    </button>
  );
}

export function VehicleRegistry() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { snapshot, can, stationById } = useFleet();
  const { toast } = useToast();

  const [filters, setFilters] = useState<RegistryFilters>(() =>
    parseFilters(new URLSearchParams(searchParams.toString()))
  );
  const [result, setResult] = useState<VehicleSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showRegister, setShowRegister] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const reqSeq = useRef(0);

  const stations = snapshot?.stations ?? [];
  const settings = snapshot?.settings;

  const stationName = useCallback(
    (id: string | null) => (id ? stationById(id)?.name ?? id : 'Unassigned'),
    [stationById]
  );

  // Hydrate filters from URL on back/forward.
  useEffect(() => {
    setFilters(parseFilters(new URLSearchParams(searchParams.toString())));
  }, [searchParams]);

  // Server-side search whenever filters change.
  useEffect(() => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setLoadError(null);
    const query = toSearchQuery(filters, 'own');
    api
      .get<VehicleSearchResult>(`/api/cloud/vehicles/search?${query}`)
      .then((data) => {
        if (seq !== reqSeq.current) return;
        setResult(data);
      })
      .catch((err) => {
        if (seq !== reqSeq.current) return;
        if (err instanceof ApiError && err.status === 401) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load vehicles.');
        setResult(null);
      })
      .finally(() => {
        if (seq === reqSeq.current) setLoading(false);
      });
  }, [filters]);

  const update = useCallback(
    (patch: Partial<RegistryFilters>, resetPage = true) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch, ...(resetPage ? { page: 1 } : {}) };
        queueMicrotask(() => {
          router.replace(`/vehicles${filtersToQuery(next)}`, { scroll: false });
        });
        return next;
      });
    },
    [router]
  );

  function onSort(field: RegistryFilters['sort']) {
    if (filters.sort === field) update({ dir: filters.dir === 'asc' ? 'desc' : 'asc' }, false);
    else update({ sort: field, dir: 'asc' }, false);
  }

  const rows = result?.items ?? [];
  const total = result?.total ?? 0;
  const ownRows = useMemo(() => rows.filter(isVehicleView) as VehicleView[], [rows]);

  function toggleRow(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllOnPage() {
    const pageIds = ownRows.map((v) => v.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    setSelected((s) => {
      const next = new Set(s);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const canRegister = can('vehicle.register');
  const canEdit = can('vehicle.edit');
  const canExport = can('export');

  const metrics = snapshot
    ? {
        total: snapshot.vehicleTotal,
        active: snapshot.vehicles.filter((v) => v.operationalStatus === 'ACTIVE').length,
        maintenance: snapshot.vehicles.filter((v) => v.operationalStatus === 'MAINTENANCE').length,
        restricted: snapshot.vehicles.filter(
          (v) => v.eligibilityState === 'RESTRICTED' || v.eligibilityState === 'INELIGIBLE'
        ).length,
        pending: snapshot.vehicles.filter((v) => v.eligibilityState === 'PENDING_VERIFICATION').length,
        stale: snapshot.vehicles.filter((v) => v.telemetryFreshness === 'STALE').length
      }
    : null;

  function exportCurrent() {
    const query = toSearchQuery(filters, 'own');
    window.open(`/api/cloud/exports/vehicles?${query}`, '_blank', 'noopener');
  }

  // --- Empty states (three distinct) ---
  function renderEmpty() {
    if (loadError) {
      return (
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title="Could not load vehicles"
          description={loadError}
          action={
            <Button variant="primary" onClick={() => setFilters((f) => ({ ...f }))}>
              Retry
            </Button>
          }
        />
      );
    }
    if (result?.emptyReason === 'NO_ACCESS') {
      return (
        <EmptyState
          icon={<Lock size={28} />}
          title="No vehicles are accessible"
          description="Your account does not have access to any vehicles in this organization scope."
        />
      );
    }
    // NO_MATCH (or active filters producing nothing)
    return (
      <EmptyState
        icon={<CarFront size={28} />}
        title={hasActiveFilters(filters) ? 'No vehicles match these filters' : 'No vehicles yet'}
        description={
          hasActiveFilters(filters)
            ? 'Try clearing a filter or search term.'
            : canRegister
              ? 'Register your first vehicle to start tracking the fleet.'
              : 'Nothing to show here yet.'
        }
        action={
          hasActiveFilters(filters) ? (
            <Button variant="secondary" onClick={() => update(DEFAULT_FILTERS)}>
              Clear filters
            </Button>
          ) : canRegister ? (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowRegister(true)}>
              Register vehicle
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="page stack">
      <PageTitle
        title="Fleet registry"
        description={
          loading ? 'Loading vehicles…' : `${total.toLocaleString('en-IN')} vehicles in your organization scope`
        }
        action={
          <div className="cluster">
            {canExport ? (
              <Button variant="secondary" icon={<Download size={16} />} onClick={exportCurrent}>
                Export CSV
              </Button>
            ) : null}
            {canRegister ? (
              <Button variant="secondary" icon={<Upload size={16} />} onClick={() => setShowImport(true)}>
                Import CSV
              </Button>
            ) : null}
            {canRegister ? (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowRegister(true)}>
                Register vehicle
              </Button>
            ) : null}
          </div>
        }
      />

      {metrics ? (
        <div className="metric-grid">
          <MetricTile label="Total" value={metrics.total} icon={<CarFront size={18} />} />
          <MetricTile label="Active" value={metrics.active} tone="success" />
          <MetricTile label="In maintenance" value={metrics.maintenance} tone="warning" />
          <MetricTile label="Restricted / ineligible" value={metrics.restricted} tone="danger" />
          <MetricTile label="Pending verification" value={metrics.pending} tone="brand" />
          <MetricTile label="Stale telemetry" value={metrics.stale} tone="neutral" />
        </div>
      ) : null}

      <Panel>
        <div className="stack">
          <div className="veh-toolbar-row">
            <div className="veh-search">
              <SearchField
                value={filters.q}
                onChange={(v) => update({ q: v })}
                placeholders={SEARCH_PLACEHOLDERS}
                ariaLabel="Search vehicles"
              />
            </div>
            <Select
              value={filters.vehicleClass}
              onChange={(v) => update({ vehicleClass: v })}
              options={[{ value: '', label: 'All classes' }, ...CLASSES.map((c) => ({ value: c, label: classLabel(c) }))]}
              ariaLabel="Filter by class"
            />
            <Select
              value={filters.sector}
              onChange={(v) => update({ sector: v })}
              options={[{ value: '', label: 'All sectors' }, ...SECTORS.map((s) => ({ value: s, label: sectorLabel(s) }))]}
              ariaLabel="Filter by sector"
            />
            <Select
              value={filters.stationId}
              onChange={(v) => update({ stationId: v })}
              options={[{ value: '', label: 'All stations' }, ...stations.map((s) => ({ value: s.id, label: s.name }))]}
              ariaLabel="Filter by station"
            />
            <Select
              value={filters.operationalStatus}
              onChange={(v) => update({ operationalStatus: v })}
              options={[
                { value: '', label: 'Any operational status' },
                ...OPERATIONAL.map((s) => ({ value: s, label: titleCase(s) }))
              ]}
              ariaLabel="Filter by operational status"
            />
            <Select
              value={filters.eligibility}
              onChange={(v) => update({ eligibility: v })}
              options={[
                { value: '', label: 'Any eligibility' },
                ...ELIGIBILITY.map((s) => ({ value: s, label: titleCase(s) }))
              ]}
              ariaLabel="Filter by eligibility"
            />
            <Select
              value={filters.ownership}
              onChange={(v) => update({ ownership: v })}
              options={[
                { value: '', label: 'Any ownership' },
                ...OWNERSHIP.map((s) => ({ value: s, label: titleCase(s) }))
              ]}
              ariaLabel="Filter by ownership"
            />
            <Select
              value={filters.complianceState}
              onChange={(v) => update({ complianceState: v })}
              options={[
                { value: '', label: 'Any compliance' },
                { value: 'expired', label: 'Expired' },
                { value: 'expiring', label: 'Expiring' },
                { value: 'ok', label: 'Compliant' }
              ]}
              ariaLabel="Filter by compliance"
            />
          </div>

          <div className="cluster" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className="veh-chip"
              aria-pressed={filters.staleTelemetry}
              onClick={() => update({ staleTelemetry: !filters.staleTelemetry })}
            >
              Stale telemetry only
            </button>
            <div className="veh-viewtoggle" role="group" aria-label="View mode">
              <button type="button" aria-pressed={filters.view === 'table'} onClick={() => update({ view: 'table' }, false)}>
                <List size={15} /> Table
              </button>
              <button type="button" aria-pressed={filters.view === 'cards'} onClick={() => update({ view: 'cards' }, false)}>
                <LayoutGrid size={15} /> Cards
              </button>
            </div>
          </div>
        </div>
      </Panel>

      {loading && !result ? (
        <Panel>
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }} aria-busy="true">
            <LoaderCircle size={18} className="spin" aria-hidden="true" /> Loading fleet…
          </p>
        </Panel>
      ) : rows.length === 0 ? (
        renderEmpty()
      ) : filters.view === 'table' ? (
        <div className="table-wrap" aria-busy={loading || undefined}>
          <table>
            <thead>
              <tr>
                {canEdit ? (
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      className="veh-checkbox"
                      aria-label="Select all on page"
                      checked={ownRows.length > 0 && ownRows.every((v) => selected.has(v.id))}
                      onChange={toggleAllOnPage}
                    />
                  </th>
                ) : null}
                <th><SortHeader label="Asset code" field="assetCode" filters={filters} onSort={onSort} /></th>
                <th><SortHeader label="Registration" field="registration" filters={filters} onSort={onSort} /></th>
                <th>Type</th>
                <th>Organization</th>
                <th>Station</th>
                <th><SortHeader label="Operational" field="status" filters={filters} onSort={onSort} /></th>
                <th>Ownership / eligibility</th>
                <th>Compliance</th>
                <th><SortHeader label="Telemetry" field="lastSeen" filters={filters} onSort={onSort} /></th>
                <th>Next maintenance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const full = isVehicleView(v);
                const id = v.id;
                return (
                  <tr
                    key={id}
                    className={`veh-row ${selected.has(id) ? 'veh-row--selected' : ''}`}
                    onClick={() => router.push(`/vehicles/${id}`)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') router.push(`/vehicles/${id}`);
                    }}
                  >
                    {canEdit ? (
                      <td onClick={(e) => e.stopPropagation()}>
                        {full ? (
                          <input
                            type="checkbox"
                            className="veh-checkbox"
                            aria-label={`Select ${registrationLabel(v)}`}
                            checked={selected.has(id)}
                            onChange={() => toggleRow(id)}
                          />
                        ) : null}
                      </td>
                    ) : null}
                    <td className="mono">{v.assetCode}</td>
                    <td className="mono">{registrationLabel(v)}</td>
                    <td>
                      <div>{CLASS_LABEL[v.vehicleClass]}</div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>{v.vehicleType}</div>
                    </td>
                    <td>{v.organizationName}</td>
                    <td>{stationLabelOf(v, stationName)}</td>
                    <td><OperationalBadge status={v.operationalStatus} /></td>
                    <td>
                      <div className="cluster" style={{ gap: '0.3rem', flexWrap: 'wrap' }}>
                        {full ? <OwnershipBadge category={(v as VehicleView).ownershipCategory} /> : null}
                        <EligibilityBadge state={v.eligibilityState} />
                      </div>
                    </td>
                    <td>{full ? <ComplianceBadge vehicle={v as VehicleView} settings={settings} /> : <span className="text-muted">—</span>}</td>
                    <td>
                      <FreshnessBadge freshness={v.telemetryFreshness} lastSeenAt={v.lastSeenAt} />
                    </td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                      {full
                        ? '—'
                        : (v as import('@/types').VehicleCardView).nextMaintenanceDue
                          ? fmtDate((v as import('@/types').VehicleCardView).nextMaintenanceDue)
                          : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="veh-cards" aria-busy={loading || undefined}>
          {rows.map((v) => (
            <VehicleCard key={v.id} vehicle={v} href={`/vehicles/${v.id}`} />
          ))}
        </div>
      )}

      {total > PAGE_SIZE ? (
        <Pagination page={filters.page} pageSize={PAGE_SIZE} total={total} onPage={(p) => update({ page: p }, false)} />
      ) : null}

      {selected.size > 0 && canEdit ? (
        <div className="veh-bulkbar" role="region" aria-label="Bulk actions">
          <span className="veh-bulkbar-count">{selected.size} selected</span>
          <div className="veh-bulkbar-spacer" />
          {canExport ? (
            <Button variant="secondary" size="sm" onClick={exportCurrent} icon={<Download size={15} />}>
              Export
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => setShowReassign(true)}>
            Reassign station
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      {showRegister ? (
        <RegisterWizard
          stations={stations}
          onClose={() => setShowRegister(false)}
          onCreated={() => {
            setShowRegister(false);
            setFilters((f) => ({ ...f }));
            toast('Vehicle registered', 'success');
          }}
        />
      ) : null}
      {showImport ? (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            setFilters((f) => ({ ...f }));
          }}
        />
      ) : null}
      {showReassign ? (
        <BulkReassignModal
          ids={[...selected]}
          stations={stations}
          onClose={() => setShowReassign(false)}
          onDone={() => {
            setShowReassign(false);
            setSelected(new Set());
            setFilters((f) => ({ ...f }));
          }}
        />
      ) : null}
    </div>
  );
}
