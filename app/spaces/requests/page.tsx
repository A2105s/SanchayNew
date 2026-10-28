'use client';

import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { useApiResource } from '@/hooks/useApiResource';
import { fmtDateTime } from '@/lib/fleet/format';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import type { SpaceRequestView } from '@/types';

export default function SpaceRequestsPage() {
  const { can } = useFleet();
  const { toast } = useToast();
  const [reviewMode, setReviewMode] = useState(false);
  const canReview = can('space.review');

  const scope = reviewMode && canReview ? 'review' : 'mine';
  const { data, loading, error, refetch } = useApiResource<{ requests: SpaceRequestView[]; total: number }>(`/api/cloud/space-requests?scope=${scope}`);
  const requests = data?.requests ?? [];
  const [dialog, setDialog] = useState<{ request: SpaceRequestView; action: 'approve' | 'reject' | 'info' } | null>(null);

  return (
    <div className="page stack">
      <PageTitle
        title="Space request center"
        description="Auditable workflow for registering new spaces and amending existing ones."
        action={canReview ? (
          <Button variant={reviewMode ? 'secondary' : 'ghost'} size="sm" onClick={() => setReviewMode(!reviewMode)}>
            {reviewMode ? 'View my requests' : 'Review queue'}
          </Button>
        ) : undefined}
      />

      <Panel title={reviewMode ? 'Requests in your review scope' : 'My requests'}>
        {loading && requests.length === 0 ? <p className="text-muted">Loading…</p> : error ? (
          <EmptyState title={`Could not load requests: ${error}`} action={<Button variant="secondary" onClick={refetch}>Retry</Button>} />
        ) : requests.length === 0 ? (
          <EmptyState icon={<Inbox size={26} />} title={reviewMode ? 'Nothing awaiting review in your scope' : 'No requests yet — register a space from the Spaces page'} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Space</th>
                  {reviewMode ? <th>Requested by</th> : null}
                  <th>Submitted</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td><Badge tone={r.type === 'REGISTER' ? 'info' : 'neutral'}>{r.type}</Badge></td>
                    <td>{r.spaceName ?? <span className="text-muted">new space — {String(r.payload.name ?? '')}</span>}</td>
                    {reviewMode ? <td>{r.requestedBy}</td> : null}
                    <td>{fmtDateTime(r.createdAt)}</td>
                    <td>
                      <Badge tone={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'danger' : r.status === 'NEEDS_INFO' || r.status === 'UNDER_REVIEW' || r.status === 'SUBMITTED' ? 'warning' : 'neutral'}>
                        {r.status.replaceAll('_', ' ')}
                      </Badge>
                      {r.infoRequestReason ? <div className="text-muted" style={{ fontSize: '0.78rem' }}>Info needed: {r.infoRequestReason}</div> : null}
                      {r.reviewNote ? <div className="text-muted" style={{ fontSize: '0.78rem' }}>{r.reviewNote}</div> : null}
                    </td>
                    <td>
                      <RequestActions request={r} reviewMode={reviewMode} onAction={(action) => setDialog({ request: r, action })} onWithdraw={() => void makeWithdraw(refetch, toast)(r)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {dialog ? (
        <RequestActionDialog
          request={dialog.request}
          action={dialog.action}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); refetch(); }}
        />
      ) : null}
    </div>
  );
}

function makeWithdraw(refetch: () => void, toast: (m: string, t?: 'success' | 'danger' | 'warning') => void) {
  return async function withdraw(request: SpaceRequestView) {
    try {
      await api.post(`/api/cloud/space-requests/${request.id}/actions`, { type: 'withdraw' });
      toast('Request withdrawn', 'success');
      refetch();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed', 'danger');
    }
  };
}

function RequestActions({ request, reviewMode, onAction, onWithdraw }: { request: SpaceRequestView; reviewMode: boolean; onAction: (a: 'approve' | 'reject' | 'info') => void; onWithdraw: () => void }) {
  const reviewable = reviewMode && (request.status === 'SUBMITTED' || request.status === 'UNDER_REVIEW' || request.status === 'NEEDS_INFO');
  const withdrawable = !reviewMode && (request.status === 'SUBMITTED' || request.status === 'UNDER_REVIEW' || request.status === 'NEEDS_INFO');
  return (
    <div className="cluster" style={{ flexWrap: 'wrap' }}>
      {reviewable ? (
        <>
          <Button variant="primary" size="sm" onClick={() => onAction('approve')}>Approve</Button>
          <Button variant="secondary" size="sm" onClick={() => onAction('reject')}>Reject</Button>
          <Button variant="ghost" size="sm" onClick={() => onAction('info')}>Request info</Button>
        </>
      ) : null}
      {withdrawable ? <Button variant="ghost" size="sm" onClick={onWithdraw}>Withdraw</Button> : null}
    </div>
  );
}

function RequestActionDialog({ request, action, onClose, onDone }: { request: SpaceRequestView; action: 'approve' | 'reject' | 'info'; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const labels = { approve: 'Approve request', reject: 'Reject request', info: 'Request more information' } as const;

  async function submit() {
    setBusy(true);
    try {
      const payload = action === 'approve' ? { type: 'approve', note: text.trim() || undefined } : action === 'reject' ? { type: 'reject', reason: text.trim() } : { type: 'requestInfo', reason: text.trim() };
      await api.post(`/api/cloud/space-requests/${request.id}/actions`, payload);
      toast('Decision recorded', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Action failed', 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={labels[action]} onClose={onClose}>
      <div className="stack">
        <p className="text-muted" style={{ margin: 0 }}>
          {request.type === 'REGISTER' ? `Register "${String(request.payload.name ?? '')}"` : `Update ${request.spaceName}`} — requested by {request.requestedBy}
        </p>
        <details>
          <summary className="text-muted" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>Proposed changes</summary>
          <pre className="mono" style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(request.payload, null, 2)}</pre>
        </details>
        <Field label={action === 'approve' ? 'Note (optional)' : action === 'reject' ? 'Rejection reason' : 'What information is needed?'}>
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="cluster" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Back</Button>
          <Button variant={action === 'approve' ? 'primary' : 'secondary'} onClick={submit} loading={busy} disabled={action !== 'approve' && !text.trim()}>
            Confirm
          </Button>
        </div>
      </div>
    </Modal>
  );
}
