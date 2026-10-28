'use client';

import { useState } from 'react';
import { CalendarCheck } from 'lucide-react';
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
import { SpaceBookingView } from '@/types';

const BUCKETS = ['upcoming', 'pending', 'completed', 'cancelled', 'rejected'] as const;
type Bucket = (typeof BUCKETS)[number];

export default function SpaceBookingsPage() {
  const { can } = useFleet();
  const [bucket, setBucket] = useState<Bucket>('upcoming');
  const [reviewMode, setReviewMode] = useState(false);
  const canReview = can('space.review');

  const scope = reviewMode && canReview ? 'review' : 'mine';
  const { data, loading, error, refetch } = useApiResource<{ bookings: SpaceBookingView[]; total: number }>(
    `/api/cloud/space-bookings?scope=${scope}&bucket=${bucket}`
  );
  const bookings = data?.bookings ?? [];
  const [dialog, setDialog] = useState<{ booking: SpaceBookingView; action: 'approve' | 'reject' | 'cancel' } | null>(null);

  return (
    <div className="page stack">
      <PageTitle
        title="Space bookings"
        description={reviewMode ? 'Requests for spaces of your organization — approve, reject or cancel.' : 'Your own space bookings across all departments.'}
        action={canReview ? (
          <Button variant={reviewMode ? 'secondary' : 'ghost'} size="sm" onClick={() => setReviewMode(!reviewMode)}>
            {reviewMode ? 'View my bookings' : 'Review queue'}
          </Button>
        ) : undefined}
      />

      <div className="cluster" style={{ flexWrap: 'wrap' }}>
        {BUCKETS.map((b) => (
          <button key={b} onClick={() => setBucket(b)} className="chip" style={{ textTransform: 'capitalize' }} aria-pressed={bucket === b}>
            {b === 'pending' && reviewMode ? 'pending requests' : b}
          </button>
        ))}
      </div>

      <Panel title={`${bucket[0].toUpperCase()}${bucket.slice(1)} bookings`}>
        {loading && bookings.length === 0 ? <p className="text-muted">Loading…</p> : error ? (
          <EmptyState title={`Could not load bookings: ${error}`} action={<Button variant="secondary" onClick={refetch}>Retry</Button>} />
        ) : bookings.length === 0 ? (
          <EmptyState icon={<CalendarCheck size={26} />} title={`No ${bucket} bookings ${reviewMode ? 'for your organization' : 'yet'}`} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Space</th>
                  {reviewMode ? <th>Requested by</th> : null}
                  <th>When (IST)</th>
                  <th>Purpose</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <BookingRow key={b.id} booking={b} reviewMode={reviewMode} canReview={canReview} onAction={(action) => setDialog({ booking: b, action })} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {dialog ? (
        <BookingActionDialog
          booking={dialog.booking}
          action={dialog.action}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); refetch(); }}
        />
      ) : null}
    </div>
  );
}

function BookingRow({ booking: b, reviewMode, canReview, onAction }: { booking: SpaceBookingView; reviewMode: boolean; canReview: boolean; onAction: (action: 'approve' | 'reject' | 'cancel') => void }) {
  const isOwn = true; // "mine" scope lists only own bookings; review lists others'
  const canCancel = b.status === 'PENDING' || b.status === 'CONFIRMED';
  return (
    <tr>
      <td className="mono">{b.bookingCode}</td>
      <td><strong>{b.spaceName}</strong><div className="text-muted mono" style={{ fontSize: '0.75rem' }}>{b.spaceAssetCode}</div></td>
      {reviewMode ? <td>{b.requestedBy}</td> : null}
      <td>{fmtDateTime(b.startAt)}<div className="text-muted" style={{ fontSize: '0.78rem' }}>→ {fmtDateTime(b.endAt)}</div></td>
      <td style={{ maxWidth: 260 }}>{b.purpose}</td>
      <td>
        <Badge tone={b.status === 'CONFIRMED' ? 'success' : b.status === 'PENDING' ? 'warning' : b.status === 'REJECTED' ? 'danger' : 'neutral'}>{b.status}</Badge>
        {b.rejectionReason ? <div className="text-muted" style={{ fontSize: '0.78rem' }}>{b.rejectionReason}</div> : null}
      </td>
      <td>
        <div className="cluster" style={{ flexWrap: 'wrap' }}>
          {reviewMode && canReview && b.status === 'PENDING' ? (
            <>
              <Button variant="primary" size="sm" onClick={() => onAction('approve')}>Approve</Button>
              <Button variant="secondary" size="sm" onClick={() => onAction('reject')}>Reject</Button>
            </>
          ) : null}
          {!reviewMode && isOwn && canCancel ? (
            <Button variant="ghost" size="sm" onClick={() => onAction('cancel')}>Cancel</Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function BookingActionDialog({ booking, action, onClose, onDone }: { booking: SpaceBookingView; action: 'approve' | 'reject' | 'cancel'; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const labels = { approve: 'Approve booking', reject: 'Reject booking', cancel: 'Cancel booking' } as const;

  async function submit() {
    setBusy(true);
    try {
      const payload = action === 'approve' ? { type: 'approve', note: text.trim() || undefined } : { type: action, reason: text.trim() };
      await api.post(`/api/cloud/space-bookings/${booking.id}/actions`, payload);
      toast(`${labels[action]} — done`, 'success');
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
          {booking.spaceName} · <span className="mono">{booking.bookingCode}</span> · {fmtDateTime(booking.startAt)} → {fmtDateTime(booking.endAt)}
        </p>
        <Field label={action === 'approve' ? 'Note (optional)' : action === 'reject' ? 'Rejection reason' : 'Cancellation reason'}>
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
