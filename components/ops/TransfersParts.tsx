'use client';

import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { fmtDateTime } from '@/lib/fleet/format';
import {
  VEHICLE_CLASSES,
  CLASS_LABEL_LOCAL,
  countsTotal,
  transferStatusTone,
  canReviewTransfer,
} from './shared';
import { Timeline, Stepper, KvRow, type TimelineStep } from './primitives';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Field } from '@/components/ui/Field';
import type { SessionUser, StationView, TransferView, VehicleClass } from '@/types';

type ToastFn = (m: string, v?: 'success' | 'warning' | 'danger' | 'info') => void;

export function NewTransferModal({
  stations,
  me,
  defaultSource,
  onClose,
  onDone,
  toast,
}: {
  stations: StationView[];
  me: SessionUser;
  defaultSource?: string | null;
  onClose: () => void;
  onDone: () => void;
  toast: ToastFn;
}) {
  const [source, setSource] = useState(defaultSource ?? '');
  const [dest, setDest] = useState(me.stationId ?? '');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [counts, setCounts] = useState<Record<VehicleClass, number>>({ PATROL_CAR: 0, MOTORCYCLE: 0, VAN: 0, HEAVY: 0 });
  const [purpose, setPurpose] = useState('');
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  const sourceStation = stations.find((s) => s.id === source);
  const total = countsTotal(counts);
  const timeValid = startAt && endAt && Date.parse(endAt) > Date.parse(startAt);
  const sameStation = source && dest && source === dest;
  const valid = source && dest && !sameStation && timeValid && total > 0 && purpose.trim();

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      const payload = {
        sourceStationId: source,
        destinationStationId: dest,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        counts,
        purpose: purpose.trim(),
        comments: comments || undefined,
      };
      await api.post('/api/cloud/transfers', payload);
      toast('Transfer request created', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not create transfer', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="New transfer request"
      size="large"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!valid} onClick={submit}>Request transfer</Button>
        </>
      }
    >
      <div className="stack">
        <div className="grid-2">
          <Field label="Source station" required>
            <Select
              ariaLabel="Source"
              value={source}
              onChange={setSource}
              placeholder="Lending station"
              options={stations.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Field>
          <Field label="Destination station" required error={sameStation ? 'Source and destination must differ' : undefined}>
            <Select
              ariaLabel="Destination"
              value={dest}
              onChange={setDest}
              placeholder="Receiving station"
              options={stations.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Window start" required>
            <input className="input" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </Field>
          <Field label="Window end" required error={startAt && endAt && !timeValid ? 'End must be after start' : undefined}>
            <input className="input" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </Field>
        </div>

        <Field label="Vehicles requested" hint={sourceStation ? 'Capped by source station availability' : 'Select a source station first'}>
          <div className="stack" style={{ gap: 8 }}>
            {VEHICLE_CLASSES.map((c) => {
              const avail = sourceStation?.inventory?.[c] ?? 0;
              return (
                <div key={c} className="cluster" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <span>{CLASS_LABEL_LOCAL[c]}</span>
                    <span className="text-muted" style={{ fontSize: '0.78rem', marginLeft: 8 }}>
                      {sourceStation ? `${avail} available` : ''}
                    </span>
                  </div>
                  <Stepper
                    value={counts[c]}
                    onChange={(v) => setCounts((prev) => ({ ...prev, [c]: v }))}
                    min={0}
                    max={avail}
                    ariaLabel={`${CLASS_LABEL_LOCAL[c]} count`}
                  />
                </div>
              );
            })}
          </div>
        </Field>

        <Field label="Purpose" required>
          <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Festival bandobast reinforcement" />
        </Field>
        <Field label="Comments">
          <textarea className="textarea" value={comments} onChange={(e) => setComments(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

export function TransferDrawer({
  transfer,
  stations,
  me,
  canReview,
  onClose,
  onDone,
  toast,
}: {
  transfer: TransferView;
  stations: StationView[];
  me: SessionUser;
  canReview: boolean;
  onClose: () => void;
  onDone: () => void;
  toast: ToastFn;
}) {
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [confirm, setConfirm] = useState<null | 'approve' | 'complete' | 'cancel'>(null);

  const stationName = (id: string) => stations.find((s) => s.id === id)?.name ?? id;
  const reviewable = canReviewTransfer(me, transfer, canReview);
  const mine = transfer.requestedBy === me.username;

  const steps = useMemo<TimelineStep[]>(() => {
    const s: TimelineStep[] = [
      { label: 'Requested', time: fmtDateTime(transfer.createdAt), state: 'done', detail: `by ${transfer.requestedBy}` },
    ];
    if (transfer.status === 'REJECTED') {
      s.push({ label: 'Rejected', time: transfer.reviewedAt ? fmtDateTime(transfer.reviewedAt) : null, state: 'rejected', detail: transfer.rejectionReason ?? undefined });
    } else if (transfer.status === 'CANCELLED') {
      s.push({ label: 'Cancelled', state: 'rejected' });
    } else {
      s.push({
        label: 'Allocated',
        time: transfer.reviewedAt ? fmtDateTime(transfer.reviewedAt) : null,
        state: transfer.status === 'ALLOCATED' || transfer.status === 'COMPLETED' ? 'done' : 'active',
        detail: transfer.reviewedBy ? `by ${transfer.reviewedBy}` : undefined,
      });
      s.push({
        label: 'Completed',
        time: transfer.completedAt ? fmtDateTime(transfer.completedAt) : null,
        state: transfer.status === 'COMPLETED' ? 'done' : 'pending',
      });
    }
    return s;
  }, [transfer]);

  async function act(type: 'approve' | 'complete' | 'cancel') {
    setBusy(true);
    try {
      await api.post(`/api/cloud/transfers/${transfer.id}/actions`, { type });
      toast(
        type === 'approve' ? 'Transfer allocated' : type === 'complete' ? 'Transfer completed' : 'Transfer cancelled',
        'success'
      );
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast('Inventory changed since this request. Refresh and try again.', 'warning');
      } else {
        toast(e instanceof ApiError ? e.message : 'Action failed', 'danger');
      }
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function reject() {
    if (!rejectReason.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/cloud/transfers/${transfer.id}/actions`, { type: 'reject', reason: rejectReason.trim() });
      toast('Transfer rejected', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not reject', 'danger');
    } finally {
      setBusy(false);
      setRejectOpen(false);
    }
  }

  return (
    <Drawer title={transfer.transferCode} onClose={onClose} width={440}>
      <div className="stack">
        <div className="cluster" style={{ justifyContent: 'space-between' }}>
          <Badge tone={transferStatusTone(transfer.status)}>{transfer.status}</Badge>
          <span className="cluster text-muted" style={{ gap: 6, fontSize: '0.85rem' }}>
            {stationName(transfer.sourceStationId)} <ArrowRight size={13} /> {stationName(transfer.destinationStationId)}
          </span>
        </div>

        <div className="cluster">
          {VEHICLE_CLASSES.filter((c) => (transfer.counts[c] ?? 0) > 0).map((c) => (
            <span className="chip" key={c}>{CLASS_LABEL_LOCAL[c]}: {transfer.counts[c]}</span>
          ))}
        </div>

        <div className="stack" style={{ gap: 4 }}>
          <KvRow k="Window" v={`${fmtDateTime(transfer.startAt)} - ${fmtDateTime(transfer.endAt)}`} />
          <KvRow k="Purpose" v={transfer.purpose} />
          {transfer.comments && <KvRow k="Comments" v={transfer.comments} />}
        </div>

        <div>
          <h4 style={{ margin: '0 0 8px' }}>Timeline</h4>
          <Timeline steps={steps} />
        </div>

        {transfer.status === 'PENDING' && reviewable && (
          <div className="cluster">
            <Button variant="primary" loading={busy} onClick={() => setConfirm('approve')}>Approve (allocate)</Button>
            <Button variant="danger" onClick={() => setRejectOpen(true)}>Reject</Button>
          </div>
        )}
        {transfer.status === 'ALLOCATED' && reviewable && (
          <Button variant="primary" loading={busy} onClick={() => setConfirm('complete')}>Mark completed</Button>
        )}
        {transfer.status === 'PENDING' && mine && (
          <Button variant="secondary" onClick={() => setConfirm('cancel')}>Cancel request</Button>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm === 'approve' ? 'Allocate vehicles?' : confirm === 'complete' ? 'Mark completed?' : 'Cancel request?'}
          message={
            confirm === 'approve'
              ? 'This moves the requested counts from the source to the destination station.'
              : confirm === 'complete'
              ? 'This returns the allocated counts to the source station pool.'
              : 'This withdraws the transfer request.'
          }
          confirmLabel={confirm === 'approve' ? 'Allocate' : confirm === 'complete' ? 'Complete' : 'Cancel request'}
          tone={confirm === 'cancel' ? 'danger' : 'primary'}
          loading={busy}
          onConfirm={() => act(confirm)}
          onClose={() => setConfirm(null)}
        />
      )}

      {rejectOpen && (
        <Modal
          title="Reject transfer"
          onClose={() => setRejectOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button variant="danger" loading={busy} disabled={!rejectReason.trim()} onClick={reject}>Reject</Button>
            </>
          }
        >
          <Field label="Reason" required>
            <textarea className="textarea" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
          </Field>
        </Modal>
      )}
    </Drawer>
  );
}
