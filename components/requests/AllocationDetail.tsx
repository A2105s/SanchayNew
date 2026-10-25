'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, LoaderCircle, Plus, X } from 'lucide-react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { PolishButton } from '@/components/ai/PolishButton';
import { Field } from '@/components/ui/Field';
import { Stepper, type StepperStep } from '@/components/ui/Stepper';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFleet } from '@/lib/client/useFleet';
import { useApiResource } from '@/hooks/useApiResource';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { ALLOCATION_LABEL, allocationTone, fmtDateTime } from '@/lib/fleet/format';
import type { AllocationAction, AllocationView, AllocationLifecycle } from '@/types';

type FormKind =
  | 'prepareHandover'
  | 'recordHandover'
  | 'recordReturn'
  | 'inspect'
  | 'requestExtension'
  | 'decideExtension'
  | 'hold'
  | 'releaseHold'
  | 'cancel';

const MAIN_FLOW: { key: AllocationLifecycle; label: string }[] = [
  { key: 'RESERVED', label: 'Reserved' },
  { key: 'AWAITING_HANDOVER', label: 'Awaiting handover' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'RETURNED_PENDING_INSPECTION', label: 'Returned — pending inspection' },
  { key: 'COMPLETED', label: 'Completed' }
];

function buildSteps(a: AllocationView): StepperStep[] {
  const order = MAIN_FLOW.map((s) => s.key);
  const currentIndex = order.indexOf(a.lifecycle as AllocationLifecycle);
  const isBranch = a.lifecycle === 'CANCELLED' || a.lifecycle === 'INCIDENT_HOLD';

  const steps: StepperStep[] = MAIN_FLOW.map((s, i) => {
    let state: StepperStep['state'] = 'upcoming';
    if (!isBranch) {
      if (i < currentIndex) state = 'done';
      else if (i === currentIndex) state = 'current';
    } else {
      // On a branch, mark reached steps as done up to where the branch happened.
      state = 'upcoming';
    }
    // Derived "Return due" annotation on the ACTIVE step.
    const detail = s.key === 'ACTIVE' && a.returnDue ? 'Return due (derived)' : undefined;
    return { id: s.key, label: s.label, state, detail };
  });

  if (a.lifecycle === 'CANCELLED') {
    steps.push({ id: 'CANCELLED', label: 'Cancelled', state: 'branch', detail: a.cancelReason ?? undefined });
  }
  if (a.lifecycle === 'INCIDENT_HOLD') {
    steps.push({ id: 'INCIDENT_HOLD', label: 'Incident hold', state: 'branch', detail: a.holdReason ?? undefined });
  }
  return steps;
}

interface ChecklistItem {
  item: string;
  present: boolean;
}

export function AllocationDetail({ id }: { id: string }) {
  const { can } = useFleet();
  const { toast } = useToast();
  const { data: alloc, loading, error, refetch, setData } = useApiResource<AllocationView>(`/api/cloud/allocations/${id}`);
  const [form, setForm] = useState<FormKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Shared form fields
  const [receivedBy, setReceivedBy] = useState('');
  const [conditionNotes, setConditionNotes] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [fuelPercent, setFuelPercent] = useState('');
  const [discrepancies, setDiscrepancies] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([{ item: 'Keys', present: true }]);
  const [newEndAt, setNewEndAt] = useState('');
  const [reason, setReason] = useState('');
  const [inspectDecision, setInspectDecision] = useState<'ACCEPTED' | 'DISPUTED'>('ACCEPTED');
  const [extensionId, setExtensionId] = useState('');
  const [extDecision, setExtDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');

  function resetForm() {
    setReceivedBy('');
    setConditionNotes('');
    setOdometerKm('');
    setFuelPercent('');
    setDiscrepancies('');
    setEvidenceRef('');
    setChecklist([{ item: 'Keys', present: true }]);
    setNewEndAt('');
    setReason('');
    setInspectDecision('ACCEPTED');
    setFormError(null);
  }

  function open(kind: FormKind, extId?: string) {
    resetForm();
    if (extId) setExtensionId(extId);
    setForm(kind);
  }

  async function run(action: AllocationAction) {
    setBusy(true);
    setFormError(null);
    try {
      const updated = await api.post<AllocationView>(`/api/cloud/allocations/${id}/actions`, action);
      setData(updated);
      toast('Allocation updated', 'success');
      setForm(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Action failed.';
      if (err instanceof ApiError && err.status === 409) {
        setFormError(`Conflict: ${message}`);
        refetch();
      } else {
        setFormError(message);
      }
      toast(message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  function submitForm() {
    if (!form) return;
    const odo = odometerKm ? Number(odometerKm) : undefined;
    const fuel = fuelPercent ? Number(fuelPercent) : undefined;
    switch (form) {
      case 'prepareHandover':
        return run({ type: 'prepareHandover' });
      case 'recordHandover':
        if (!receivedBy.trim()) return setFormError('Received by is required.');
        if (!conditionNotes.trim()) return setFormError('Condition notes are required.');
        return run({ type: 'recordHandover', receivedBy: receivedBy.trim(), conditionNotes: conditionNotes.trim(), odometerKm: odo, fuelPercent: fuel, checklist, evidenceRef: evidenceRef.trim() || undefined });
      case 'recordReturn':
        if (!receivedBy.trim()) return setFormError('Received by is required.');
        if (!conditionNotes.trim()) return setFormError('Condition notes are required.');
        return run({ type: 'recordReturn', receivedBy: receivedBy.trim(), conditionNotes: conditionNotes.trim(), odometerKm: odo, fuelPercent: fuel, discrepancies: discrepancies.trim() || undefined, evidenceRef: evidenceRef.trim() || undefined });
      case 'inspect':
        return run({ type: 'inspect', decision: inspectDecision, notes: conditionNotes.trim() || undefined });
      case 'requestExtension':
        if (!newEndAt) return setFormError('New end date/time is required.');
        if (!reason.trim()) return setFormError('Reason is required.');
        return run({ type: 'requestExtension', newEndAt: new Date(newEndAt).toISOString(), reason: reason.trim() });
      case 'decideExtension':
        return run({ type: 'decideExtension', extensionId, decision: extDecision, note: reason.trim() || undefined });
      case 'hold':
        if (!reason.trim()) return setFormError('Reason is required.');
        return run({ type: 'hold', reason: reason.trim() });
      case 'releaseHold':
        return run({ type: 'releaseHold' });
      case 'cancel':
        if (!reason.trim()) return setFormError('Reason is required.');
        return run({ type: 'cancel', reason: reason.trim() });
      default:
        return undefined;
    }
  }

  if (loading && !alloc) {
    return (
      <div className="page">
        <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }} aria-busy="true">
          <LoaderCircle size={18} className="spin" aria-hidden="true" /> Loading allocation…
        </p>
      </div>
    );
  }
  if (error || !alloc) {
    return (
      <div className="page">
        <EmptyState icon={<AlertTriangle size={28} />} title="Could not load this allocation" description={error ?? 'Not found or outside your access.'} action={<Button variant="primary" onClick={refetch}>Retry</Button>} />
      </div>
    );
  }

  const canHandover = can('handover.record');
  const canReturn = can('return.record');
  const canInspect = can('return.inspect');
  const canExtend = can('extension.decide');
  const lc = alloc.lifecycle;

  return (
    <div className="page stack">
      <Link href="/allocations" className="back-link">
        <ArrowLeft size={15} aria-hidden="true" /> Back to allocations
      </Link>

      <PageTitle
        title={`Allocation ${alloc.allocationCode}`}
        description={alloc.vehicleLabel}
        action={<Badge tone={allocationTone(lc)}>{ALLOCATION_LABEL[lc as AllocationLifecycle]}</Badge>}
      />

      <div className="toast-inline" role="note">
        <AlertTriangle size={16} className="toast-inline__icon" aria-hidden="true" />
        <span className="toast-inline__message">
          Approval creates this reservation but is <strong>not</strong> handover. The vehicle only shows as in use after a
          handover is recorded.
        </span>
      </div>

      <Panel title="Lifecycle">
        <Stepper steps={buildSteps(alloc)} label="Allocation lifecycle" />
        {alloc.returnDue ? (
          <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Return is due{alloc.overdueHours > 0 ? ` — ${alloc.overdueHours}h overdue` : ''}. “Return due” is derived from
            the end time and grace period; it does not change the stored lifecycle.
          </p>
        ) : null}
      </Panel>

      <div className="veh-detail-grid">
        <Panel title="Window & records">
          <div className="kv">
            <span>Start</span>
            <span>{fmtDateTime(alloc.startAt)}</span>
            <span>End</span>
            <span>{fmtDateTime(alloc.endAt)}</span>
            <span>Request</span>
            <span><Link href={`/requests/${alloc.requestId}`}>View request</Link></span>
            {alloc.handover ? (
              <>
                <span>Handover</span>
                <span>{alloc.handover.receivedBy} · {fmtDateTime(alloc.handover.acknowledgedAt)}</span>
              </>
            ) : null}
            {alloc.returnRecord ? (
              <>
                <span>Return</span>
                <span>{alloc.returnRecord.receivedBy} · {alloc.returnRecord.inspectionStatus}</span>
              </>
            ) : null}
          </div>
        </Panel>

        <Panel title="Extensions">
          {alloc.extensions.length === 0 ? (
            <p className="text-muted">No extension requests.</p>
          ) : (
            <ul className="plain-list">
              {alloc.extensions.map((ext) => (
                <li key={ext.id} className="cluster" style={{ justifyContent: 'space-between' }}>
                  <span>
                    New end {fmtDateTime(ext.newEndAt)} — {ext.reason}
                    <br />
                    <Badge tone={ext.status === 'APPROVED' ? 'success' : ext.status === 'REJECTED' ? 'danger' : 'info'}>{ext.status}</Badge>
                  </span>
                  {ext.status === 'PENDING' && canExtend ? (
                    <Button variant="secondary" size="sm" onClick={() => open('decideExtension', ext.id)}>
                      Decide
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Actions">
        <div className="cluster" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          {lc === 'RESERVED' && canHandover ? (
            <Button variant="secondary" onClick={() => open('prepareHandover')}>Prepare handover</Button>
          ) : null}
          {(lc === 'RESERVED' || lc === 'AWAITING_HANDOVER') && canHandover ? (
            <Button variant="primary" onClick={() => open('recordHandover')}>Record handover</Button>
          ) : null}
          {lc === 'ACTIVE' && canReturn ? (
            <Button variant="primary" onClick={() => open('recordReturn')}>Record return</Button>
          ) : null}
          {lc === 'RETURNED_PENDING_INSPECTION' && canInspect ? (
            <Button variant="primary" onClick={() => open('inspect')}>Inspect</Button>
          ) : null}
          {lc === 'ACTIVE' ? (
            <Button variant="secondary" onClick={() => open('requestExtension')}>Request extension</Button>
          ) : null}
          {lc === 'ACTIVE' ? (
            <Button variant="secondary" onClick={() => open('hold')}>Hold (incident)</Button>
          ) : null}
          {lc === 'INCIDENT_HOLD' ? (
            <Button variant="secondary" onClick={() => open('releaseHold')}>Release hold</Button>
          ) : null}
          {(lc === 'RESERVED' || lc === 'AWAITING_HANDOVER') ? (
            <Button variant="danger" onClick={() => open('cancel')}>Cancel</Button>
          ) : null}
        </div>
        {lc === 'ACTIVE' || lc === 'RETURNED_PENDING_INSPECTION' || lc === 'COMPLETED' ? (
          <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Cancellation is only possible before handover. This allocation can no longer be cancelled.
          </p>
        ) : null}
      </Panel>

      {form ? (
        <Modal
          title={
            {
              prepareHandover: 'Prepare handover',
              recordHandover: 'Record handover',
              recordReturn: 'Record return',
              inspect: 'Inspect return',
              requestExtension: 'Request extension',
              decideExtension: 'Decide extension',
              hold: 'Place on incident hold',
              releaseHold: 'Release hold',
              cancel: 'Cancel allocation'
            }[form]
          }
          onClose={() => setForm(null)}
          closeDisabled={busy}
          footer={
            <>
              <Button variant="secondary" onClick={() => setForm(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant={form === 'cancel' ? 'danger' : 'primary'} onClick={submitForm} loading={busy}>
                Confirm
              </Button>
            </>
          }
        >
          <div className="stack">
            {formError ? (
              <div className="toast-inline toast-inline--danger" role="alert">
                <span className="toast-inline__message">{formError}</span>
              </div>
            ) : null}

            {form === 'prepareHandover' ? (
              <p className="modal-copy">Move this reservation to “Awaiting handover”. The vehicle is still not in use until handover is recorded.</p>
            ) : null}
            {form === 'releaseHold' ? <p className="modal-copy">Release the incident hold and return the allocation to active.</p> : null}

            {(form === 'recordHandover' || form === 'recordReturn') ? (
              <>
                <Field label="Received by" required>
                  <input className="input" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
                </Field>
                <Field label="Condition notes" required>
                  <textarea className="input" rows={2} value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} />
                  <PolishButton kind={form === 'recordHandover' ? 'handover' : 'return'} value={conditionNotes} onApply={setConditionNotes} />
                </Field>
                <div className="grid-2">
                  <Field label="Odometer (km)">
                    <input className="input" value={odometerKm} onChange={(e) => setOdometerKm(e.target.value)} inputMode="numeric" />
                  </Field>
                  <Field label="Fuel (%)">
                    <input className="input" value={fuelPercent} onChange={(e) => setFuelPercent(e.target.value)} inputMode="numeric" />
                  </Field>
                </div>
                {form === 'recordReturn' ? (
                  <Field label="Discrepancies">
                    <textarea className="input" rows={2} value={discrepancies} onChange={(e) => setDiscrepancies(e.target.value)} />
                  </Field>
                ) : null}
                {form === 'recordHandover' ? (
                  <div className="stack">
                    <span className="field-label">Checklist</span>
                    {checklist.map((c, i) => (
                      <div key={i} className="cluster" style={{ gap: '0.5rem' }}>
                        <input
                          className="input"
                          value={c.item}
                          aria-label={`Checklist item ${i + 1}`}
                          onChange={(e) => setChecklist((list) => list.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))}
                        />
                        <label className="cluster" style={{ gap: '0.3rem' }}>
                          <input
                            type="checkbox"
                            checked={c.present}
                            onChange={(e) => setChecklist((list) => list.map((x, j) => (j === i ? { ...x, present: e.target.checked } : x)))}
                          />
                          Present
                        </label>
                        <button type="button" className="icon-button" aria-label="Remove item" onClick={() => setChecklist((list) => list.filter((_, j) => j !== i))}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setChecklist((list) => [...list, { item: '', present: true }])}>
                      Add item
                    </Button>
                  </div>
                ) : null}
                <Field label="Evidence reference">
                  <input className="input" value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} placeholder="e.g. photo/document ref" />
                </Field>
              </>
            ) : null}

            {form === 'inspect' ? (
              <>
                <Field label="Decision" required>
                  <div className="cluster" role="radiogroup" aria-label="Inspection decision">
                    <label className="cluster" style={{ gap: '0.3rem' }}>
                      <input type="radio" checked={inspectDecision === 'ACCEPTED'} onChange={() => setInspectDecision('ACCEPTED')} /> Accept
                    </label>
                    <label className="cluster" style={{ gap: '0.3rem' }}>
                      <input type="radio" checked={inspectDecision === 'DISPUTED'} onChange={() => setInspectDecision('DISPUTED')} /> Dispute
                    </label>
                  </div>
                </Field>
                <Field label="Notes">
                  <textarea className="input" rows={2} value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} />
                </Field>
              </>
            ) : null}

            {form === 'requestExtension' ? (
              <>
                <Field label="New end date/time" required>
                  <input className="input" type="datetime-local" value={newEndAt} onChange={(e) => setNewEndAt(e.target.value)} />
                </Field>
                <Field label="Reason" required>
                  <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
              </>
            ) : null}

            {form === 'decideExtension' ? (
              <>
                <Field label="Decision" required>
                  <div className="cluster" role="radiogroup" aria-label="Extension decision">
                    <label className="cluster" style={{ gap: '0.3rem' }}>
                      <input type="radio" checked={extDecision === 'APPROVED'} onChange={() => setExtDecision('APPROVED')} /> Approve
                    </label>
                    <label className="cluster" style={{ gap: '0.3rem' }}>
                      <input type="radio" checked={extDecision === 'REJECTED'} onChange={() => setExtDecision('REJECTED')} /> Reject
                    </label>
                  </div>
                </Field>
                <Field label="Note" hint="A later reservation conflict is reported by the server.">
                  <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
              </>
            ) : null}

            {(form === 'hold' || form === 'cancel') ? (
              <Field label="Reason" required>
                <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
