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
  const [confirm, setConfirm] = useState<null | 'grant_clearance' | 'grant_sanction' | 'handover' | 'complete' | 'cancel'>(null);

  const stationName = (id: string) => stations.find((s) => s.id === id)?.name ?? id;
  const isLender = me.stationId === transfer.sourceStationId;
  const isDest = me.stationId === transfer.destinationStationId;
  const isAdminOrOrgAdmin = me.role === 'ADMIN' || me.role === 'ORG_ADMIN' || canReview;
  const mine = transfer.requestedBy === me.username;

  const canClear = (transfer.status === 'PENDING_LENDER_REVIEW' || transfer.status === 'PENDING') && (isLender || me.role === 'ADMIN');
  const canSanction = transfer.status === 'PENDING_DISTRICT_SANCTION' && (me.role === 'ADMIN' || me.role === 'ORG_ADMIN');
  const canHandover = transfer.status === 'ALLOCATED' && (isLender || isAdminOrOrgAdmin);
  const canComplete = (transfer.status === 'ACTIVE' || (transfer.status === 'ALLOCATED' && !canHandover)) && (isDest || isLender || isAdminOrOrgAdmin);
  const canCancel = (mine || isAdminOrOrgAdmin) && ['PENDING', 'PENDING_LENDER_REVIEW', 'PENDING_DISTRICT_SANCTION', 'ALLOCATED'].includes(transfer.status);

  const steps = useMemo<TimelineStep[]>(() => {
    const s: TimelineStep[] = [
      { label: 'Requested', time: fmtDateTime(transfer.createdAt), state: 'done', detail: `by ${transfer.requestedBy}` },
    ];

    if (transfer.status === 'REJECTED_BY_LENDER') {
      s.push({
        label: 'Station Clearance',
        time: transfer.reviewedAt ? fmtDateTime(transfer.reviewedAt) : null,
        state: 'rejected',
        detail: transfer.rejectionReason ?? (transfer.reviewedBy ? `Rejected by ${transfer.reviewedBy}` : 'Rejected')
      });
      return s;
    }

    if (transfer.status === 'CANCELLED') {
      s.push({ label: 'Cancelled', state: 'rejected' });
      return s;
    }

    if (transfer.status === 'REJECTED') {
      s.push({
        label: 'Rejected',
        time: transfer.reviewedAt ? fmtDateTime(transfer.reviewedAt) : null,
        state: 'rejected',
        detail: transfer.rejectionReason ?? undefined
      });
      return s;
    }

    // Step 2: Station Clearance
    const clearanceDone = ['PENDING_DISTRICT_SANCTION', 'ALLOCATED', 'ACTIVE', 'COMPLETED', 'REJECTED_BY_ADMIN'].includes(transfer.status);
    const clearanceActive = transfer.status === 'PENDING_LENDER_REVIEW' || transfer.status === 'PENDING';
    s.push({
      label: 'Station Clearance',
      time: clearanceDone && transfer.reviewedAt ? fmtDateTime(transfer.reviewedAt) : null,
      state: clearanceDone ? 'done' : clearanceActive ? 'active' : 'pending',
      detail: clearanceDone && transfer.reviewedBy ? `Granted by ${transfer.reviewedBy}` : undefined,
    });

    if (transfer.status === 'REJECTED_BY_ADMIN') {
      s.push({
        label: 'District Movement Sanction',
        time: transfer.reviewedAt ? fmtDateTime(transfer.reviewedAt) : null,
        state: 'rejected',
        detail: transfer.rejectionReason ?? (transfer.reviewedBy ? `Rejected by ${transfer.reviewedBy}` : 'Rejected')
      });
      return s;
    }

    // Step 3: District Movement Sanction
    const sanctionDone = ['ALLOCATED', 'ACTIVE', 'COMPLETED'].includes(transfer.status);
    const sanctionActive = transfer.status === 'PENDING_DISTRICT_SANCTION';
    s.push({
      label: 'District Movement Sanction',
      time: sanctionDone && transfer.reviewedAt ? fmtDateTime(transfer.reviewedAt) : null,
      state: sanctionDone ? 'done' : sanctionActive ? 'active' : 'pending',
      detail: sanctionDone && transfer.reviewedBy ? `Sanctioned by ${transfer.reviewedBy}` : undefined,
    });

    // Step 4: Handover (Depart)
    const handoverDone = ['ACTIVE', 'COMPLETED'].includes(transfer.status);
    const handoverActive = transfer.status === 'ALLOCATED';
    s.push({
      label: 'Handover & Transit',
      state: handoverDone ? 'done' : handoverActive ? 'active' : 'pending',
    });

    // Step 5: Inbound Return & Complete
    s.push({
      label: 'Inbound Return & Complete',
      time: transfer.completedAt ? fmtDateTime(transfer.completedAt) : null,
      state: transfer.status === 'COMPLETED' ? 'done' : transfer.status === 'ACTIVE' ? 'active' : 'pending',
      detail: transfer.completedBy ? `by ${transfer.completedBy}` : undefined,
    });

    return s;
  }, [transfer]);

  async function act(type: 'grant_clearance' | 'grant_sanction' | 'handover' | 'complete' | 'cancel') {
    setBusy(true);
    try {
      await api.post(`/api/cloud/transfers/${transfer.id}/actions`, { type });
      const messages: Record<string, string> = {
        grant_clearance: 'Station clearance granted',
        grant_sanction: 'District movement sanction issued',
        handover: 'Transfer handed over & active in transit',
        complete: 'Transfer completed & inventory returned',
        cancel: 'Transfer cancelled',
      };
      toast(messages[type] ?? 'Action successful', 'success');
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

        {canClear && (
          <div className="cluster">
            <Button variant="primary" loading={busy} onClick={() => setConfirm('grant_clearance')}>Grant Station Clearance</Button>
            <Button variant="danger" onClick={() => setRejectOpen(true)}>Reject</Button>
          </div>
        )}
        {canSanction && (
          <div className="cluster">
            <Button variant="primary" loading={busy} onClick={() => setConfirm('grant_sanction')}>Issue District Movement Sanction</Button>
            <Button variant="danger" onClick={() => setRejectOpen(true)}>Reject</Button>
          </div>
        )}
        {canHandover && (
          <Button variant="primary" loading={busy} onClick={() => setConfirm('handover')}>Confirm Handover (Depart)</Button>
        )}
        {canComplete && (
          <Button variant="primary" loading={busy} onClick={() => setConfirm('complete')}>Inbound Return Inspection (Complete)</Button>
        )}
        {canCancel && (
          <Button variant="secondary" onClick={() => setConfirm('cancel')}>Cancel request</Button>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={
            confirm === 'grant_clearance'
              ? 'Grant Station Clearance?'
              : confirm === 'grant_sanction'
              ? 'Issue District Movement Sanction?'
              : confirm === 'handover'
              ? 'Confirm Handover & Departure?'
              : confirm === 'complete'
              ? 'Inbound Return Inspection & Completion?'
              : 'Cancel request?'
          }
          message={
            confirm === 'grant_clearance'
              ? 'This certifies that the lending station has local reserve capacity and clears the requisition for SP Fleet Desk review.'
              : confirm === 'grant_sanction'
              ? 'This grants SP Fleet Desk district movement sanction and transfers vehicle allocation quotas.'
              : confirm === 'handover'
              ? 'This marks vehicles as physically dispatched and active in transit to the destination station.'
              : confirm === 'complete'
              ? 'This verifies inbound physical return and restores vehicle inventory to the lending station pool.'
              : 'This withdraws the transfer request.'
          }
          confirmLabel={
            confirm === 'grant_clearance'
              ? 'Grant Clearance'
              : confirm === 'grant_sanction'
              ? 'Issue Sanction'
              : confirm === 'handover'
              ? 'Confirm Handover'
              : confirm === 'complete'
              ? 'Complete'
              : 'Cancel request'
          }
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
