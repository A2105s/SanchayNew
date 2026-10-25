'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle, LoaderCircle } from 'lucide-react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Timeline, type TimelineEntry } from '@/components/ui/Timeline';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFleet } from '@/lib/client/useFleet';
import { useApiResource } from '@/hooks/useApiResource';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { CLASS_LABEL, REQUEST_STATE_LABEL, requestStateTone, fmtDateTime } from '@/lib/fleet/format';
import type { AssetRequestView, RequestAction } from '@/types';

type ActionKind = RequestAction['type'];

interface PendingAction {
  kind: ActionKind;
  title: string;
  needsComment?: boolean;
  commentRequired?: boolean;
  commentLabel?: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
}

export function RequestDetail({ id }: { id: string }) {
  const router = useRouter();
  const { me, can } = useFleet();
  const { toast } = useToast();
  const { data: request, loading, error, refetch, setData } = useApiResource<AssetRequestView>(`/api/cloud/requests/${id}`);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function runAction(action: RequestAction) {
    setBusy(true);
    setActionError(null);
    try {
      // Authoritative server state is returned; never optimistic.
      const updated = await api.post<AssetRequestView>(`/api/cloud/requests/${id}/actions`, action);
      setData(updated);
      toast('Request updated', 'success');
      setPending(null);
      setComment('');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Action failed.';
      // 409 on approve: vehicle no longer available; state is unchanged.
      if (err instanceof ApiError && err.status === 409) {
        setActionError(`Vehicle no longer available: ${message}`);
        refetch();
      } else {
        setActionError(message);
      }
      toast(message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  function openAction(p: PendingAction) {
    setComment('');
    setActionError(null);
    setPending(p);
  }

  function confirmPending() {
    if (!pending) return;
    if (pending.commentRequired && !comment.trim()) {
      setActionError(`${pending.commentLabel ?? 'Comment'} is required.`);
      return;
    }
    const kind = pending.kind;
    const text = comment.trim();
    switch (kind) {
      case 'submit':
        return runAction({ type: 'submit' });
      case 'startReview':
        return runAction({ type: 'startReview' });
      case 'approve':
        return runAction({ type: 'approve', comment: text || undefined });
      case 'reject':
        return runAction({ type: 'reject', reason: text });
      case 'requestChanges':
        return runAction({ type: 'requestChanges', comment: text });
      case 'escalate':
        return runAction({ type: 'escalate', comment: text || undefined });
      case 'cancel':
        return runAction({ type: 'cancel', reason: text || undefined });
      default:
        return undefined;
    }
  }

  if (loading && !request) {
    return (
      <div className="page">
        <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }} aria-busy="true">
          <LoaderCircle size={18} className="spin" aria-hidden="true" /> Loading request…
        </p>
      </div>
    );
  }
  if (error || !request) {
    return (
      <div className="page">
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title="Could not load this request"
          description={error ?? 'Request not found or outside your access.'}
          action={<Button variant="primary" onClick={refetch}>Retry</Button>}
        />
      </div>
    );
  }

  const isRequester = me?.username === request.requesterUsername;
  const canReview = can('request.review');
  const state = request.state;

  // Approver cannot act on their own request (separation of duties).
  const reviewBlockedReason = isRequester
    ? 'You raised this request — a different officer must review it (separation of duties).'
    : !canReview
      ? 'You do not have permission to review requests.'
      : null;

  const timeline: TimelineEntry[] = [
    {
      id: 'created',
      title: 'Request created',
      tone: 'neutral',
      who: `${request.requesterName} · ${request.requestingOrgName}`,
      when: fmtDateTime(request.createdAt)
    },
    ...(request.submittedAt
      ? [{ id: 'submitted', title: 'Submitted', tone: 'info' as const, when: fmtDateTime(request.submittedAt) }]
      : []),
    ...request.steps.map<TimelineEntry>((s) => ({
      id: s.id,
      title: `Step ${s.stepOrder}: ${s.decision.replace(/_/g, ' ').toLowerCase()} — ${s.approverOrgName}`,
      tone:
        s.decision === 'APPROVED'
          ? 'success'
          : s.decision === 'REJECTED'
            ? 'danger'
            : s.decision === 'CHANGES_REQUESTED' || s.decision === 'ESCALATED'
              ? 'warning'
              : 'neutral',
      who: s.decidedBy ? `${s.decidedBy}${s.decidedByRole ? ` (${s.decidedByRole})` : ''}` : null,
      when: s.decidedAt ? fmtDateTime(s.decidedAt) : null,
      comment: s.comment
    }))
  ];

  const canEdit = isRequester && (state === 'DRAFT' || state === 'CHANGES_REQUESTED');

  return (
    <div className="page stack">
      <Link href="/requests" className="back-link">
        <ArrowLeft size={15} aria-hidden="true" /> Back to requests
      </Link>

      <PageTitle
        title={`Request ${request.requestCode}`}
        description={request.purpose}
        action={<Badge tone={requestStateTone(state)}>{REQUEST_STATE_LABEL[state]}</Badge>}
      />

      {actionError ? (
        <div className="toast-inline toast-inline--danger" role="alert">
          <AlertTriangle size={16} className="toast-inline__icon" aria-hidden="true" />
          <span className="toast-inline__message">{actionError}</span>
        </div>
      ) : null}

      <div className="veh-detail-grid">
        <Panel title="Details">
          <div className="kv">
            <span>Requested class</span>
            <span>{CLASS_LABEL[request.requestedClass]}</span>
            <span>Vehicle</span>
            <span>{request.vehicleLabel ?? 'To be assigned by approver'}</span>
            <span>Owning org</span>
            <span>{request.vehicleOrgName ?? '—'}</span>
            <span>Destination</span>
            <span>{request.destination ?? '—'}</span>
            <span>Passengers</span>
            <span>{request.passengers}</span>
            <span>Window</span>
            <span>{fmtDateTime(request.startAt)} → {fmtDateTime(request.endAt)}</span>
            <span>Accountable officer</span>
            <span>{request.accountableOfficer}{request.accountablePhone ? ` · ${request.accountablePhone}` : ''}</span>
            <span>Contact</span>
            <span>{request.contactPhone ?? '—'}</span>
            {request.decisionReason ? (
              <>
                <span>Decision reason</span>
                <span>{request.decisionReason}</span>
              </>
            ) : null}
            {request.allocationId ? (
              <>
                <span>Allocation</span>
                <span><Link href={`/allocations/${request.allocationId}`}>View allocation</Link></span>
              </>
            ) : null}
          </div>
        </Panel>

        <Panel title="Approval timeline">
          <Timeline entries={timeline} />
        </Panel>
      </div>

      <Panel title="Actions">
        {reviewBlockedReason && canReview === false ? null : null}
        <div className="cluster" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          {/* Requester actions */}
          {canEdit ? (
            <Button variant="secondary" onClick={() => toast('Open the request form to edit (draft/changes requested).', 'info')}>
              Update details
            </Button>
          ) : null}
          {isRequester && (state === 'DRAFT' || state === 'CHANGES_REQUESTED') ? (
            <Button variant="primary" onClick={() => openAction({ kind: 'submit', title: 'Submit request', confirmLabel: 'Submit' })}>
              Submit
            </Button>
          ) : null}
          {isRequester && !['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(state) ? (
            <Button
              variant="danger"
              onClick={() => openAction({ kind: 'cancel', title: 'Cancel request', needsComment: true, commentLabel: 'Reason (optional)', confirmLabel: 'Cancel request', tone: 'danger' })}
            >
              Cancel request
            </Button>
          ) : null}

          {/* Reviewer actions */}
          {(state === 'SUBMITTED' || state === 'UNDER_REVIEW' || state === 'CHANGES_REQUESTED') && !reviewBlockedReason ? (
            <>
              {state === 'SUBMITTED' ? (
                <Button variant="secondary" onClick={() => openAction({ kind: 'startReview', title: 'Start review', confirmLabel: 'Start review' })}>
                  Start review
                </Button>
              ) : null}
              <Button
                variant="primary"
                onClick={() => openAction({ kind: 'approve', title: 'Approve request', needsComment: true, commentLabel: 'Comment (optional)', confirmLabel: 'Approve' })}
              >
                Approve
              </Button>
              <Button
                variant="secondary"
                onClick={() => openAction({ kind: 'requestChanges', title: 'Request changes', needsComment: true, commentRequired: true, commentLabel: 'What needs changing', confirmLabel: 'Request changes' })}
              >
                Request changes
              </Button>
              <Button
                variant="secondary"
                onClick={() => openAction({ kind: 'escalate', title: 'Escalate to parent org', needsComment: true, commentLabel: 'Comment (optional)', confirmLabel: 'Escalate' })}
              >
                Escalate
              </Button>
              <Button
                variant="danger"
                onClick={() => openAction({ kind: 'reject', title: 'Reject request', needsComment: true, commentRequired: true, commentLabel: 'Reason', confirmLabel: 'Reject', tone: 'danger' })}
              >
                Reject
              </Button>
            </>
          ) : null}
        </div>
        {reviewBlockedReason && (state === 'SUBMITTED' || state === 'UNDER_REVIEW') ? (
          <p className="text-muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
            {reviewBlockedReason}
          </p>
        ) : null}
        {['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(state) ? (
          <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            This request is {REQUEST_STATE_LABEL[state].toLowerCase()} and has no further actions.
            {state === 'APPROVED' ? ' Note: approval creates a reservation — the vehicle is handed over only when a handover is recorded on the allocation.' : ''}
          </p>
        ) : null}
      </Panel>

      {pending ? (
        <Modal
          title={pending.title}
          size="small"
          onClose={() => setPending(null)}
          closeDisabled={busy}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant={pending.tone === 'danger' ? 'danger' : 'primary'} onClick={confirmPending} loading={busy}>
                {pending.confirmLabel}
              </Button>
            </>
          }
        >
          <div className="stack">
            {actionError ? (
              <div className="toast-inline toast-inline--danger" role="alert">
                <span className="toast-inline__message">{actionError}</span>
              </div>
            ) : null}
            {pending.needsComment ? (
              <Field label={pending.commentLabel ?? 'Comment'} required={pending.commentRequired}>
                <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
              </Field>
            ) : (
              <p className="modal-copy">Confirm this action? The authoritative result will be shown after the server responds.</p>
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
