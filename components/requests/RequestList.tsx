'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, AlertTriangle, LoaderCircle, ClipboardList } from 'lucide-react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFleet } from '@/lib/client/useFleet';
import { useApiResource } from '@/hooks/useApiResource';
import { api } from '@/lib/client/api';
import { CLASS_LABEL, REQUEST_STATE_LABEL, requestStateTone, fmtDateTime } from '@/lib/fleet/format';
import type { AssetRequestView, RequestState } from '@/types';
import { RequestWizard } from '@/components/requests/RequestWizard';

const STATES: RequestState[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED'
];

type TabId = 'mine' | 'needs' | 'all';

export function RequestList() {
  const { me, can } = useFleet();
  const router = useRouter();
  const params = useSearchParams();
  const urlTab = params.get('tab');
  const initialTab: TabId = urlTab === 'all' ? 'all' : urlTab === 'needs' || urlTab === 'decide' ? 'needs' : 'mine';
  const [tab, setTab] = useState<TabId>(initialTab);
  const [q, setQ] = useState('');
  const [stateFilter, setStateFilter] = useState(params.get('state') ?? '');
  const [showWizard, setShowWizard] = useState(params.get('new') === '1');
  const prefillVehicleId = params.get('vehicleId');
  // Approvers land on the queue that needs them when there is no explicit tab in the URL.
  const autoSwitched = useRef(false);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (tab === 'mine') sp.set('mine', 'true');
    if (tab === 'needs') sp.set('needsMyDecision', 'true');
    if (stateFilter) sp.set('state', stateFilter);
    return sp.toString();
  }, [tab, stateFilter]);

  const { data, loading, error, refetch } = useApiResource<AssetRequestView[]>(`/api/cloud/requests?${query}`);

  const rows = useMemo(() => {
    const list = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((r) =>
      [r.requestCode, r.purpose, r.vehicleLabel ?? '', r.requestingOrgName, r.requesterName]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [data, q]);

  const canCreate = can('request.create');
  // Land approvers on the queue that needs them unless the URL asked for a specific tab.
  useEffect(() => {
    if (autoSwitched.current || urlTab || !me || !can('request.review')) return;
    autoSwitched.current = true;
    const orgIds = new Set<string>();
    api.get<AssetRequestView[]>('/api/cloud/requests?needsMyDecision=true').then((list) => {
      if ((list ?? []).length > 0) setTab('needs');
    }).catch(() => undefined);
    void orgIds;
  }, [me, can, urlTab]);
  const canReview = can('request.review');

  const tabs = [
    { id: 'mine', label: 'Mine' },
    ...(canReview ? [{ id: 'needs', label: 'Needs my decision' }] : []),
    { id: 'all', label: 'All in scope' }
  ];

  return (
    <div className="page stack">
      <PageTitle
        title="Requests"
        description="Vehicle requests you raised or that need your organization's decision."
        action={
          canCreate ? (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowWizard(true)}>
              New request
            </Button>
          ) : undefined
        }
      />

      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as TabId)} />

      <Panel>
        <div className="veh-toolbar-row">
          <div className="veh-search">
            <SearchField value={q} onChange={setQ} placeholder="Search by code, purpose, vehicle" ariaLabel="Search requests" />
          </div>
          <Select
            value={stateFilter}
            onChange={setStateFilter}
            options={[{ value: '', label: 'Any state' }, ...STATES.map((s) => ({ value: s, label: REQUEST_STATE_LABEL[s] }))]}
            ariaLabel="Filter by state"
          />
        </div>
      </Panel>

      {loading && !data ? (
        <Panel>
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }} aria-busy="true">
            <LoaderCircle size={18} className="spin" aria-hidden="true" /> Loading requests…
          </p>
        </Panel>
      ) : error ? (
        <EmptyState icon={<AlertTriangle size={28} />} title="Could not load requests" description={error} action={<Button variant="primary" onClick={refetch}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} />}
          title={q || stateFilter ? 'No requests match these filters' : tab === 'needs' ? 'Nothing awaiting your decision' : 'No requests yet'}
          description={
            tab === 'mine'
              ? 'Raise a request to book an eligible vehicle.'
              : tab === 'needs'
                ? 'Requests needing your approval will appear here.'
                : 'No requests are visible in your scope.'
          }
          action={
            canCreate && tab === 'mine' && !q && !stateFilter ? (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowWizard(true)}>
                New request
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Purpose</th>
                <th>Vehicle</th>
                <th>Requesting org</th>
                <th>Window</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="veh-row"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('a,button')) router.push(`/requests/${r.id}`);
                  }}
                >
                  <td className="mono">
                    <Link href={`/requests/${r.id}`}>{r.requestCode}</Link>
                  </td>
                  <td>{r.purpose}</td>
                  <td>{r.vehicleLabel ?? CLASS_LABEL[r.requestedClass] + ' (class)'}</td>
                  <td>{r.requestingOrgName}</td>
                  <td className="text-muted" style={{ fontSize: '0.82rem' }}>
                    {fmtDateTime(r.startAt)} → {fmtDateTime(r.endAt)}
                  </td>
                  <td>
                    <Badge tone={requestStateTone(r.state)}>{REQUEST_STATE_LABEL[r.state]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showWizard ? (
        <RequestWizard
          prefill={prefillVehicleId ? { vehicleId: prefillVehicleId } : undefined}
          onClose={() => setShowWizard(false)}
          onDone={() => {
            setShowWizard(false);
            refetch();
          }}
        />
      ) : null}
      {me ? null : null}
    </div>
  );
}
