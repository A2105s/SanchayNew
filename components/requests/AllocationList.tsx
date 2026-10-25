'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, LoaderCircle, PackageCheck } from 'lucide-react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { SearchField } from '@/components/ui/SearchField';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiResource } from '@/hooks/useApiResource';
import { ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import { ALLOCATION_LABEL, allocationTone, fmtDateTime } from '@/lib/fleet/format';
import type { AllocationView, AllocationLifecycle } from '@/types';

type TabId = 'active' | 'upcoming' | 'awaiting' | 'overdue' | 'history';

const TABS: { id: TabId; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'awaiting', label: 'Awaiting inspection' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'history', label: 'History' }
];

function matchesTab(a: AllocationView, tab: TabId): boolean {
  switch (tab) {
    case 'active':
      return a.lifecycle === 'ACTIVE' || a.lifecycle === 'INCIDENT_HOLD';
    case 'upcoming':
      return a.lifecycle === 'RESERVED' || a.lifecycle === 'AWAITING_HANDOVER';
    case 'awaiting':
      return a.lifecycle === 'RETURNED_PENDING_INSPECTION';
    case 'overdue':
      return a.returnDue || a.overdueHours > 0;
    case 'history':
      return a.lifecycle === 'COMPLETED' || a.lifecycle === 'CANCELLED';
    default:
      return true;
  }
}

export function AllocationList() {
  const [tab, setTab] = useState<TabId>('active');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [q, setQ] = useState('');

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (tab === 'overdue') sp.set('overdue', 'true');
    return sp.toString();
  }, [tab]);

  const { data, loading, error, refetch } = useApiResource<AllocationView[]>(`/api/cloud/allocations?${query}`);

  const rows = useMemo(() => {
    const list = (data ?? []).filter((a) => matchesTab(a, tab));
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((a) => [a.allocationCode, a.vehicleLabel].join(' ').toLowerCase().includes(needle));
  }, [data, tab, q]);

  return (
    <div className="page stack">
      <PageTitle title="Allocations" description="Reservations and active vehicle allocations across their lifecycle." />

      <Tabs tabs={TABS} active={tab} onChange={(id) => setTab(id as TabId)} />

      <Panel>
        <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="veh-search" style={{ flex: '1 1 320px', maxWidth: '420px', margin: 0 }}>
            <SearchField value={q} onChange={setQ} placeholder="Search by code or vehicle" ariaLabel="Search allocations" />
          </div>
          <ViewToggle value={viewMode} onChange={setViewMode} />
        </div>
      </Panel>

      {loading && !data ? (
        <Panel>
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }} aria-busy="true">
            <LoaderCircle size={18} className="spin" aria-hidden="true" /> Loading allocations…
          </p>
        </Panel>
      ) : error ? (
        <EmptyState icon={<AlertTriangle size={28} />} title="Could not load allocations" description={error} action={<Button variant="primary" onClick={refetch}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<PackageCheck size={28} />} title="Nothing here" description={`No ${tab} allocations in your scope.`} />
      ) : viewMode === 'table' ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Vehicle</th>
                <th>Window</th>
                <th>Lifecycle</th>
                <th>Return</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="veh-row">
                  <td className="mono">
                    <Link href={`/allocations/${a.id}`}>{a.allocationCode}</Link>
                  </td>
                  <td>{a.vehicleLabel}</td>
                  <td className="text-muted" style={{ fontSize: '0.82rem' }}>
                    {fmtDateTime(a.startAt)} → {fmtDateTime(a.endAt)}
                  </td>
                  <td>
                    <Badge tone={allocationTone(a.lifecycle)}>{ALLOCATION_LABEL[a.lifecycle as AllocationLifecycle]}</Badge>
                  </td>
                  <td>
                    {a.returnDue ? (
                      <Badge tone="danger">Return due{a.overdueHours > 0 ? ` · ${a.overdueHours}h overdue` : ''}</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="veh-cards">
          {rows.map((a) => (
            <Link
              key={a.id}
              href={`/allocations/${a.id}`}
              className="veh-card"
              style={{ textDecoration: 'none' }}
            >
              <div className="veh-card-head">
                <div>
                  <div className="mono" style={{ fontWeight: 700, color: 'var(--color-brand)' }}>
                    {a.allocationCode}
                  </div>
                  <div className="veh-card-sub" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {a.vehicleLabel}
                  </div>
                </div>
                <Badge tone={allocationTone(a.lifecycle)}>
                  {ALLOCATION_LABEL[a.lifecycle as AllocationLifecycle]}
                </Badge>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                <div><strong>Window:</strong> {fmtDateTime(a.startAt)} → {fmtDateTime(a.endAt)}</div>
              </div>
              <div className="veh-card-foot">
                {a.returnDue ? (
                  <Badge tone="danger">Return due{a.overdueHours > 0 ? ` · ${a.overdueHours}h overdue` : ''}</Badge>
                ) : (
                  <span className="text-muted">On schedule</span>
                )}
                <span style={{ fontWeight: 600, color: 'var(--color-brand)', fontSize: '0.8rem' }}>
                  Manage →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
