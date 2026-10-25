'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
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
import type { TransferStatus, TransferView } from '@/types';

type TabId = 'ACTION' | 'MINE' | 'ALL';

export default function TransfersPage() {
  const { snapshot, loading, error, refresh, can, me } = useFleet();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>('ACTION');
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
          { id: 'ACTION', label: 'Needs my action', count: needsAction.length },
          { id: 'MINE', label: 'My requests', count: mine.length },
          { id: 'ALL', label: 'All', count: transfers.length },
        ]}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      <div className="toolbar">
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
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ArrowRight size={28} />}
          title={tab === 'ACTION' ? 'Nothing needs your action' : 'No transfers'}
          description={tab === 'ACTION' ? 'Pending requests requiring your approval will appear here.' : 'Create a transfer to get started.'}
          action={canCreate ? <Button onClick={() => setNewOpen(true)}>New transfer</Button> : undefined}
        />
      ) : (
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
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(t)}>
                    <td className="mono">{t.transferCode}</td>
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
                    <td><ArrowRight size={14} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
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
