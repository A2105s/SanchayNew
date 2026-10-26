'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Plus, AlertCircle, User, Layers } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { fmtDateTime } from '@/lib/fleet/format';
import {
  VEHICLE_CLASSES,
  CLASS_LABEL_LOCAL,
  transferStatusTone,
  canReviewTransfer,
} from '@/components/ops/shared';
import { NewTransferModal, TransferDrawer } from '@/components/ops/TransfersParts';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import type { TransferStatus, TransferView } from '@/types';

type TabId = 'ACTION' | 'MINE' | 'ALL';

export default function TransfersPage() {
  const { snapshot, loading, error, refresh, can, me } = useFleet();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>('ACTION');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'ALL'>('ALL');
  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState<TransferView | null>(null);

  const transfers = snapshot?.transfers ?? [];
  const stations = snapshot?.stations ?? [];
  const canReview = can('transfer.review');
  const canCreate = can('transfer.create');

  const needsAction = useMemo(
    () => (me ? transfers.filter((t) => t.status === 'PENDING' && canReviewTransfer(me, t, canReview)) : []),
    [transfers, me, canReview]
  );
  const mine = useMemo(() => (me ? transfers.filter((t) => t.requestedBy === me.username) : []), [transfers, me]);

  const base = tab === 'ACTION' ? needsAction : tab === 'MINE' ? mine : transfers;
  const filtered = useMemo(
    () =>
      base
        .filter((t) => (statusFilter === 'ALL' ? true : t.status === statusFilter))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [base, statusFilter]
  );

  const stationName = (id: string) => stations.find((s) => s.id === id)?.name ?? id;

  // keep drawer transfer fresh after refresh
  const liveDetail = detail ? transfers.find((t) => t.id === detail.id) ?? null : null;

  if (loading && !snapshot) {
    return (
      <div className="page stack">
        <PageTitle title="Transfers" />
        <Skeleton height={320} />
      </div>
    );
  }
  if (error && !snapshot) {
    return (
      <div className="page">
        <EmptyState title="Could not load transfers" description={error} action={<Button onClick={() => refresh()}>Retry</Button>} />
      </div>
    );
  }

  return (
    <div className="page stack">
      <PageTitle
        eyebrow="Fleet"
        title="Transfers"
        description="Inter-station fleet transfers: request, approve (allocate), complete."
        action={
          canCreate ? (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setNewOpen(true)}>
              New transfer
            </Button>
          ) : undefined
        }
      />

      <Tabs
        tabs={[
          { id: 'ACTION', label: 'Needs my action', count: needsAction.length, icon: <AlertCircle size={15} /> },
          { id: 'MINE', label: 'My requests', count: mine.length, icon: <User size={15} /> },
          { id: 'ALL', label: 'All transfers', count: transfers.length, icon: <Layers size={15} /> },
        ]}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
        layoutId="transfersActiveTab"
        toolbar
        toolbarEyebrow="Transfer queue"
      />

      <div className="toolbar" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Select
          ariaLabel="Status filter"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as TransferStatus | 'ALL')}
          options={[
            { value: 'ALL', label: 'All statuses' },
            { value: 'PENDING', label: 'Pending' },
            { value: 'ALLOCATED', label: 'Allocated' },
            { value: 'COMPLETED', label: 'Completed' },
            { value: 'REJECTED', label: 'Rejected' },
            { value: 'CANCELLED', label: 'Cancelled' },
          ]}
        />
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ArrowRight size={28} />}
          title={tab === 'ACTION' ? 'Nothing needs your action' : 'No transfers'}
          description={tab === 'ACTION' ? 'Pending requests requiring your approval will appear here.' : 'Create a transfer to get started.'}
          action={canCreate ? <Button onClick={() => setNewOpen(true)}>New transfer</Button> : undefined}
        />
      ) : viewMode === 'table' ? (
        <Panel>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Transfer</th>
                  <th>Route</th>
                  <th>Vehicles</th>
                  <th>Window</th>
                  <th>Status</th>
                  <th aria-label="Action" style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(t)}>
                    <td>
                      <strong className="mono table-code">{t.transferCode}</strong>
                    </td>
                    <td>
                      <span className="cluster" style={{ gap: 4, fontSize: '0.85rem' }}>
                        {stationName(t.sourceStationId)} <ArrowRight size={12} /> {stationName(t.destinationStationId)}
                      </span>
                    </td>
                    <td>
                      <div className="cluster" style={{ gap: 4 }}>
                        {VEHICLE_CLASSES.filter((c) => (t.counts[c] ?? 0) > 0).map((c) => (
                          <span className="chip" key={c}>{CLASS_LABEL_LOCAL[c].slice(0, 3)}:{t.counts[c]}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{fmtDateTime(t.startAt)}</td>
                    <td><Badge tone={transferStatusTone(t.status)}>{t.status}</Badge></td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="table-action">View <ArrowRight size={13} /></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <div className="veh-cards">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="veh-card"
              style={{ cursor: 'pointer' }}
              onClick={() => setDetail(t)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setDetail(t);
              }}
            >
              <div className="veh-card-head">
                <div>
                  <div className="mono" style={{ fontWeight: 700, color: 'var(--color-brand)' }}>
                    {t.transferCode}
                  </div>
                  <div className="veh-card-sub" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {stationName(t.sourceStationId)} → {stationName(t.destinationStationId)}
                  </div>
                </div>
                <Badge tone={transferStatusTone(t.status)}>{t.status}</Badge>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="cluster" style={{ gap: 4 }}>
                  {VEHICLE_CLASSES.filter((c) => (t.counts[c] ?? 0) > 0).map((c) => (
                    <span className="chip" key={c}>{CLASS_LABEL_LOCAL[c].slice(0, 3)}:{t.counts[c]}</span>
                  ))}
                </div>
                <div><strong>Start:</strong> {fmtDateTime(t.startAt)}</div>
              </div>
              <div className="veh-card-foot" style={{ justifyContent: 'flex-end' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-brand)', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  View details <ArrowRight size={12} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {newOpen && me && (
        <NewTransferModal
          stations={stations}
          me={me}
          onClose={() => setNewOpen(false)}
          onDone={async () => { setNewOpen(false); await refresh(); }}
          toast={toast}
        />
      )}
      {liveDetail && me && (
        <TransferDrawer
          transfer={liveDetail}
          stations={stations}
          me={me}
          canReview={canReview}
          onClose={() => setDetail(null)}
          onDone={async () => { await refresh(); }}
          toast={toast}
        />
      )}
    </div>
  );
}
