'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, LoaderCircle, EyeOff, RefreshCw, FileText, Building2, ShieldCheck, Sliders, FileCheck, Wrench, Calendar, Radio, History } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Timeline, type TimelineEntry } from '@/components/ui/Timeline';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { OperationalBadge, OwnershipBadge, EligibilityBadge, AvailabilityBadge } from '@/components/ui/StatusBadges';
import { MiniMap } from '@/components/vehicles/MiniMap';
import { isVehicleView } from '@/components/vehicles/card-view';
import { useFleet } from '@/lib/client/useFleet';
import { useApiResource } from '@/hooks/useApiResource';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import {
  CLASS_LABEL,
  SECTOR_LABEL,
  fmtDate,
  fmtDateTime,
  fmtClock,
  fmtKm,
  ALLOCATION_LABEL,
  allocationTone
} from '@/lib/fleet/format';
import { complianceItems } from '@/lib/fleet/compliance';
import type {
  VehicleAction,
  VehicleDetail as VehicleDetailData,
  VehicleView,
  AllocationLifecycle
} from '@/types';

type TabId =
  | 'overview'
  | 'ownership'
  | 'eligibility'
  | 'specs'
  | 'compliance'
  | 'operations'
  | 'reservations'
  | 'telemetry'
  | 'audit';

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <FileText size={14} /> },
  { id: 'ownership', label: 'Ownership & control', icon: <Building2 size={14} /> },
  { id: 'eligibility', label: 'Eligibility & restrictions', icon: <ShieldCheck size={14} /> },
  { id: 'specs', label: 'Specifications', icon: <Sliders size={14} /> },
  { id: 'compliance', label: 'Compliance & documents', icon: <FileCheck size={14} /> },
  { id: 'operations', label: 'Operations', icon: <Wrench size={14} /> },
  { id: 'reservations', label: 'Reservations & allocations', icon: <Calendar size={14} /> },
  { id: 'telemetry', label: 'Telemetry', icon: <Radio size={14} /> },
  { id: 'audit', label: 'Audit history', icon: <History size={14} /> }
];

export function VehicleDetail({ id }: { id: string }) {
  const { me, can } = useFleet();
  const { toast } = useToast();
  const { data, loading, error, refetch } = useApiResource<VehicleDetailData>(`/api/cloud/vehicles/${id}`);
  const [tab, setTab] = useState<TabId>('overview');
  const [actionBusy, setActionBusy] = useState(false);

  async function runAction(action: VehicleAction, successMsg: string) {
    setActionBusy(true);
    try {
      await api.post(`/api/cloud/vehicles/${id}/actions`, action);
      // Authoritative refetch, never optimistic.
      refetch();
      toast(successMsg, 'success');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Action failed.';
      toast(message, 'danger');
    } finally {
      setActionBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="page">
        <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }} aria-busy="true">
          <LoaderCircle size={18} className="spin" aria-hidden="true" /> Loading vehicle…
        </p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="page">
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title="Could not load this vehicle"
          description={error ?? 'Not found or outside your access.'}
          action={<Button variant="primary" onClick={refetch}>Retry</Button>}
        />
      </div>
    );
  }

  const { vehicle, masked, eligibility, availability, ownership, restrictions, documents, trips, maintenance, legal, incidents, fuelLogs, devices, allocations, audit } = data;
  const full = isVehicleView(vehicle);
  const v = vehicle as VehicleView;
  const reg = full ? v.registrationNumber : (vehicle as { registrationMasked: string }).registrationMasked;

  // Tabs available: masked viewers do not see compliance/documents/operations/ownership sensitive detail.
  const visibleTabs = TABS.filter((t) => {
    if (!masked) return true;
    return ['overview', 'eligibility', 'reservations', 'telemetry'].includes(t.id);
  });

  const canVerify = can('eligibility.verify');
  const canRestriction = can('restriction.manage');

  return (
    <div className="page stack">
      <Link href="/vehicles" className="back-link">
        <ArrowLeft size={15} aria-hidden="true" /> Back to fleet
      </Link>

      <PageTitle
        title={<span className="mono reg-plate">{reg}</span>}
        description={`${vehicle.displayName} · ${CLASS_LABEL[vehicle.vehicleClass]}`}
        action={
          full ? (
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} />}
              onClick={() => runAction({ type: 'reevaluateEligibility' }, 'Eligibility re-evaluated')}
              loading={actionBusy}
            >
              Re-evaluate
            </Button>
          ) : undefined
        }
      />

      {/* Header: SEPARATE badges (never merged) */}
      <div className="veh-badge-row" role="group" aria-label="Vehicle status">
        <div className="veh-badge-cell">
          <span className="veh-badge-cell__label">Operational</span>
          <OperationalBadge status={vehicle.operationalStatus} />
        </div>
        {full ? (
          <div className="veh-badge-cell">
            <span className="veh-badge-cell__label">Ownership</span>
            <OwnershipBadge category={v.ownershipCategory} />
          </div>
        ) : null}
        <div className="veh-badge-cell">
          <span className="veh-badge-cell__label">Eligibility</span>
          <EligibilityBadge state={vehicle.eligibilityState} />
        </div>
        <div className="veh-badge-cell">
          <span className="veh-badge-cell__label">Availability</span>
          <AvailabilityBadge availability={availability} />
        </div>
      </div>

      {masked ? (
        <div className="toast-inline" role="note">
          <EyeOff size={16} className="toast-inline__icon" aria-hidden="true" />
          <span className="toast-inline__message">
            This vehicle belongs to another organization. Sensitive sections (documents, driver, odometer, exact
            position) are masked.
          </span>
        </div>
      ) : null}

      <Tabs
        tabs={visibleTabs}
        active={tab}
        onChange={(t) => setTab(t as TabId)}
        layoutId="vehicleDetailActiveTab"
        toolbar
        toolbarEyebrow="Vehicle profile"
      />

      {tab === 'overview' ? (
        <Panel title="Overview">
          <div className="kv">
            <span>Asset code</span>
            <span className="mono">{vehicle.assetCode}</span>
            <span>Registration</span>
            <span className="mono">{reg}</span>
            <span>Type</span>
            <span>{vehicle.vehicleType}</span>
            <span>Class</span>
            <span>{CLASS_LABEL[vehicle.vehicleClass]}</span>
            <span>Organization</span>
            <span>{vehicle.organizationName}</span>
            {full ? (
              <>
                <span>Sector</span>
                <span>{SECTOR_LABEL[v.sector]}</span>
                <span>Managing unit</span>
                <span>{v.managingUnit ?? '—'}</span>
              </>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {tab === 'ownership' && !masked ? (
        <Panel
          title="Ownership & control"
          action={
            canVerify ? (
              <OwnershipActions vehicleId={id} onDone={refetch} />
            ) : undefined
          }
        >
          <p className="text-muted" style={{ marginTop: 0 }}>
            Current category: <OwnershipBadge category={v.ownershipCategory} />
          </p>
          <Timeline
            emptyLabel="No ownership verification history."
            entries={ownership.map<TimelineEntry>((o) => ({
              id: o.id,
              title: `${o.category.replace(/_/g, ' ')} — ${o.status}`,
              tone: o.status === 'VERIFIED' ? 'success' : o.status === 'REJECTED' ? 'danger' : 'info',
              who: o.verifiedBy ? `Verified by ${o.verifiedBy}` : `Submitted by ${o.submittedBy}`,
              when: o.verifiedAt ? fmtDateTime(o.verifiedAt) : fmtDateTime(o.createdAt),
              comment: o.rejectionNote ?? o.evidenceNote ?? `Evidence: ${o.evidenceRef}`,
              children:
                o.status === 'PENDING' && canVerify ? (
                  <OwnershipDecision vehicleId={id} verificationId={o.id} submittedBy={o.submittedBy} onDone={refetch} />
                ) : undefined
            }))}
          />
        </Panel>
      ) : null}

      {tab === 'eligibility' ? (
        <div className="stack">
          <Panel title="Eligibility decision">
            <div className="cluster" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
              <EligibilityBadge state={eligibility.state} />
              <Badge tone="neutral">Policy {eligibility.policyVersion}</Badge>
              <span className="text-muted" style={{ fontSize: '0.82rem' }}>Evaluated {fmtDateTime(eligibility.evaluatedAt)}</span>
              {full ? (
                <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => runAction({ type: 'reevaluateEligibility' }, 'Eligibility re-evaluated')} loading={actionBusy}>
                  Re-evaluate
                </Button>
              ) : null}
            </div>
            {eligibility.reasons.length === 0 ? (
              <p className="text-muted">No blocking reasons.</p>
            ) : (
              <ul className="plain-list">
                {eligibility.reasons.map((r, i) => (
                  <li key={i} className="cluster" style={{ gap: '0.4rem' }}>
                    <Badge tone={r.blocking ? 'danger' : 'warning'}>{r.code}</Badge>
                    <span>{r.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {!masked ? (
            <Panel
              title="Restrictions"
              action={canRestriction ? <RestrictionActions vehicleId={id} onDone={refetch} /> : undefined}
            >
              {restrictions.length === 0 ? (
                <p className="text-muted">No restrictions on record.</p>
              ) : (
                <ul className="plain-list">
                  {restrictions.map((r) => (
                    <li key={r.id} className="veh-restriction">
                      <div className="cluster" style={{ gap: '0.4rem' }}>
                        <Badge tone={r.active ? 'danger' : 'neutral'}>{r.type.replace(/_/g, ' ')}</Badge>
                        <strong>{r.reasonCode}</strong>
                        {r.active ? null : <Badge tone="neutral">Lifted</Badge>}
                      </div>
                      <p className="text-muted" style={{ margin: '0.25rem 0' }}>{r.description}</p>
                      <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                        Authority: {r.authority} · {r.evidenceRef ? `Evidence: ${r.evidenceRef} · ` : ''}
                        {r.reviewAt ? `Review ${fmtDate(r.reviewAt)} · ` : ''}
                        {r.expiresAt ? `Expires ${fmtDate(r.expiresAt)}` : 'No expiry'}
                      </div>
                      {r.active && canRestriction ? (
                        <RestrictionLift vehicleId={id} restrictionId={r.id} onDone={refetch} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}
        </div>
      ) : null}

      {tab === 'specs' ? (
        <Panel title="Specifications">
          <div className="kv">
            <span>Make & model</span>
            <span>{full ? v.makeModel ?? '—' : '—'}</span>
            <span>Year</span>
            <span>{full ? v.year ?? '—' : '—'}</span>
            <span>Fuel type</span>
            <span>{full ? v.fuelType ?? '—' : '—'}</span>
            <span>Seating</span>
            <span>{vehicle.seating ?? '—'}</span>
            {full ? (
              <>
                <span>Colour</span>
                <span>{v.color ?? '—'}</span>
                <span>Chassis</span>
                <span className="mono">{v.chassisNumber ?? '—'}</span>
                <span>Engine</span>
                <span className="mono">{v.engineNumber ?? '—'}</span>
                <span>Odometer</span>
                <span>{fmtKm(v.odometerKm)}</span>
              </>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {tab === 'compliance' && !masked ? (
        <div className="stack">
          <Panel title="Compliance">
            <div className="veh-compliance-grid">
              {complianceItems(v, {
                idleThresholdHours: 72,
                complianceWarnDays: 30,
                complianceCriticalDays: 7,
                telemetryFreshMinutes: 10,
                telemetryOfflineMinutes: 60,
                eligibilityPolicyVersion: eligibility.policyVersion,
                requestExpiryHours: 72,
                returnGraceMinutes: 60,
                exportRowLimit: 5000,
                maxBookingHorizonDays: 90,
                requireInspectionOnReturn: true,
                allowSelfApproval: false
              }).map((item) => (
                <div key={item.document} className="veh-compliance-card">
                  <strong>{item.label}</strong>
                  <span>{item.expiry ? fmtDate(item.expiry) : 'No record'}</span>
                  <Badge tone={item.severity === 'critical' ? 'danger' : item.severity === 'warning' ? 'warning' : 'success'}>
                    {item.severity === 'critical' ? 'Expired / critical' : item.severity === 'warning' ? 'Expiring' : 'OK'}
                  </Badge>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Documents">
            <DocumentSection vehicleId={id} documents={documents} canWrite={can('document.write')} onDone={refetch} />
          </Panel>
        </div>
      ) : null}

      {tab === 'operations' && !masked ? (
        <OperationsSection vehicle={v} trips={trips} maintenance={maintenance} incidents={incidents} fuelLogs={fuelLogs} legal={legal} canRestriction={canRestriction} onDone={refetch} />
      ) : null}

      {tab === 'reservations' ? (
        <Panel title="Reservations & allocations">
          {allocations.length === 0 ? (
            <p className="text-muted">No reservations or allocations.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Window</th>
                    <th>Lifecycle</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a) => (
                    <tr key={a.id}>
                      <td className="mono"><Link href={`/allocations/${a.id}`}>{a.allocationCode}</Link></td>
                      <td className="text-muted" style={{ fontSize: '0.82rem' }}>{fmtDateTime(a.startAt)} → {fmtDateTime(a.endAt)}</td>
                      <td><Badge tone={allocationTone(a.lifecycle)}>{ALLOCATION_LABEL[a.lifecycle as AllocationLifecycle]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === 'telemetry' ? (
        <TelemetrySection vehicle={vehicle} devices={devices} masked={masked} />
      ) : null}

      {tab === 'audit' && !masked ? (
        <Panel title="Audit history">
          {audit.length === 0 ? (
            <p className="text-muted">No audit entries.</p>
          ) : (
            <Timeline
              entries={audit.map<TimelineEntry>((a) => ({
                id: a.id,
                title: `${a.action}${a.fieldName ? ` · ${a.fieldName}` : ''}`,
                tone: a.outcome === 'DENIED' || a.outcome === 'FAILED' ? 'danger' : 'neutral',
                who: `${a.performedBy}${a.performedByRole ? ` (${a.performedByRole})` : ''}`,
                when: fmtDateTime(a.performedAt),
                comment: a.reason ?? (a.oldValue || a.newValue ? `${a.oldValue ?? ''} → ${a.newValue ?? ''}` : null)
              }))}
            />
          )}
        </Panel>
      ) : null}
    </div>
  );
}

/* ---------------- Ownership actions ---------------- */

function OwnershipActions({ vehicleId, onDone }: { vehicleId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<'GOVERNMENT_FLEET' | 'SEIZED_IMPOUNDED' | 'OTHER_UNVERIFIED'>('GOVERNMENT_FLEET');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!evidenceRef.trim()) return setErr('Evidence reference is required.');
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/cloud/vehicles/${vehicleId}/actions`, { type: 'submitOwnership', category, evidenceRef: evidenceRef.trim(), evidenceNote: note.trim() || undefined });
      toast('Ownership evidence submitted', 'success');
      setOpen(false);
      onDone();
    } catch (e) {
      const m = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed';
      setErr(m);
      toast(m, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Submit evidence</Button>
      {open ? (
        <div className="veh-inline-form">
          {err ? <div className="toast-inline toast-inline--danger" role="alert"><span className="toast-inline__message">{err}</span></div> : null}
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as typeof category)} aria-label="Ownership category">
            <option value="GOVERNMENT_FLEET">Government fleet</option>
            <option value="SEIZED_IMPOUNDED">Seized / impounded</option>
            <option value="OTHER_UNVERIFIED">Other / unverified</option>
          </select>
          <input className="input" placeholder="Evidence reference" value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} />
          <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="cluster">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={submit} loading={busy}>Submit</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function OwnershipDecision({ vehicleId, verificationId, submittedBy, onDone }: { vehicleId: string; verificationId: string; submittedBy: string; onDone: () => void }) {
  const { me } = useFleet();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const sameUser = me?.username === submittedBy;

  async function decide(decision: 'VERIFIED' | 'REJECTED') {
    setBusy(true);
    try {
      await api.post(`/api/cloud/vehicles/${vehicleId}/actions`, { type: 'decideOwnership', verificationId, decision, note: note.trim() || undefined });
      toast(`Ownership ${decision.toLowerCase()}`, 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed', 'danger');
    } finally {
      setBusy(false);
    }
  }

  if (sameUser) {
    return (
      <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
        You submitted this evidence. A different officer must verify or reject it (separation of duties).
      </p>
    );
  }
  return (
    <div className="veh-inline-form" style={{ marginTop: '0.4rem' }}>
      <input className="input" placeholder="Decision note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="cluster">
        <Button variant="primary" size="sm" onClick={() => decide('VERIFIED')} loading={busy}>Verify</Button>
        <Button variant="danger" size="sm" onClick={() => decide('REJECTED')} loading={busy}>Reject</Button>
      </div>
    </div>
  );
}

/* ---------------- Restriction actions ---------------- */

function RestrictionActions({ vehicleId, onDone }: { vehicleId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'LEGAL_CUSTODY' | 'COURT_ORDER' | 'SAFETY' | 'MAINTENANCE_HOLD' | 'COMPLIANCE' | 'OTHER'>('SAFETY');
  const [reasonCode, setReasonCode] = useState('');
  const [authority, setAuthority] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!reasonCode.trim() || !authority.trim()) return setErr('Reason code and authority are required.');
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/cloud/vehicles/${vehicleId}/actions`, { type: 'addRestriction', restrictionType: type, reasonCode: reasonCode.trim(), authority: authority.trim(), description: description.trim() || undefined });
      toast('Restriction added', 'success');
      setOpen(false);
      onDone();
    } catch (e) {
      const m = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed';
      setErr(m);
      toast(m, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Add restriction</Button>
      {open ? (
        <div className="veh-inline-form">
          {err ? <div className="toast-inline toast-inline--danger" role="alert"><span className="toast-inline__message">{err}</span></div> : null}
          <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Restriction type">
            <option value="LEGAL_CUSTODY">Legal custody</option>
            <option value="COURT_ORDER">Court order</option>
            <option value="SAFETY">Safety</option>
            <option value="MAINTENANCE_HOLD">Maintenance hold</option>
            <option value="COMPLIANCE">Compliance</option>
            <option value="OTHER">Other</option>
          </select>
          <input className="input" placeholder="Reason code" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} />
          <input className="input" placeholder="Authority" value={authority} onChange={(e) => setAuthority(e.target.value)} />
          <input className="input" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="cluster">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={submit} loading={busy}>Add</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function RestrictionLift({ vehicleId, restrictionId, onDone }: { vehicleId: string; restrictionId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/cloud/vehicles/${vehicleId}/actions`, { type: 'liftRestriction', restrictionId, reason: reason.trim() });
      toast('Restriction lifted', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed', 'danger');
    } finally {
      setBusy(false);
    }
  }

  return open ? (
    <div className="veh-inline-form" style={{ marginTop: '0.4rem' }}>
      <input className="input" placeholder="Lift reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="cluster">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={submit} loading={busy} disabled={!reason.trim()}>Lift</Button>
      </div>
    </div>
  ) : (
    <Button variant="ghost" size="sm" onClick={() => setOpen(true)} style={{ marginTop: '0.4rem' }}>Lift restriction</Button>
  );
}

/* ---------------- Documents ---------------- */

function DocumentSection({ vehicleId, documents, canWrite, onDone }: { vehicleId: string; documents: VehicleDetailData['documents']; canWrite: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('OTHER');
  const [file, setFile] = useState<File | null>(null);

  async function upload() {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast('File exceeds the 10 MB limit.', 'danger');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('kind', kind);
      form.append('title', file.name);
      form.append('file', file);
      await api.postForm(`/api/cloud/vehicles/${vehicleId}/documents`, form);
      toast('Document uploaded', 'success');
      setFile(null);
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Upload failed', 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function openDoc(docId: string) {
    try {
      const res = await api.get<{ url: string }>(`/api/cloud/documents/${docId}/url`);
      window.open(res.url, '_blank', 'noopener');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not open document', 'danger');
    }
  }

  return (
    <div className="stack">
      {documents.length === 0 ? (
        <p className="text-muted">No documents uploaded.</p>
      ) : (
        <ul className="plain-list">
          {documents.map((d) => (
            <li key={d.id} className="cluster" style={{ justifyContent: 'space-between' }}>
              <span>
                <strong>{d.title}</strong> <Badge tone="neutral">{d.kind}</Badge>
                <br />
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  {d.mimeType} · {(d.sizeBytes / 1024).toFixed(0)} KB{d.expiresAt ? ` · expires ${fmtDate(d.expiresAt)}` : ''}
                </span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => openDoc(d.id)}>Open</Button>
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <div className="veh-inline-form">
          <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>PDF / JPG / PNG up to 10 MB.</p>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Document kind">
            {['RC', 'INSURANCE', 'PUC', 'FITNESS', 'OWNERSHIP_EVIDENCE', 'HANDOVER_EVIDENCE', 'OTHER'].map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <input className="input" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Document file" />
          <Button variant="primary" size="sm" onClick={upload} loading={busy} disabled={!file}>Upload</Button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Operations ---------------- */

function OperationsSection({
  vehicle,
  trips,
  maintenance,
  incidents,
  fuelLogs,
  legal,
  canRestriction,
  onDone
}: {
  vehicle: VehicleView;
  trips: VehicleDetailData['trips'];
  maintenance: VehicleDetailData['maintenance'];
  incidents: VehicleDetailData['incidents'];
  fuelLogs: VehicleDetailData['fuelLogs'];
  legal: VehicleDetailData['legal'];
  canRestriction: boolean;
  onDone: () => void;
}) {
  return (
    <div className="stack">
      <CustodyPanel vehicle={vehicle} legal={legal} canRestriction={canRestriction} onDone={onDone} />
      <Panel title="Maintenance">
        {maintenance.length === 0 ? (
          <p className="text-muted">No maintenance records.</p>
        ) : (
          <ul className="plain-list">
            {maintenance.map((m) => (
              <li key={m.id}>
                <strong>{m.title}</strong> <Badge tone="neutral">{m.status}</Badge>{' '}
                {m.blocksAvailability ? <Badge tone="danger">Blocks availability</Badge> : null}
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                  {m.windowStart ? `Window ${fmtDateTime(m.windowStart)} → ${fmtDateTime(m.windowEnd)} · ` : ''}
                  {m.dueDate ? `Due ${fmtDate(m.dueDate)}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Trips">
        {trips.length === 0 ? <p className="text-muted">No trips recorded.</p> : (
          <ul className="plain-list">
            {trips.map((t) => (
              <li key={t.id}>
                <strong className="mono">{t.tripCode}</strong> · {t.status} · {t.driverName}
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>{fmtDateTime(t.startedAt)}{t.endedAt ? ` → ${fmtDateTime(t.endedAt)}` : ''}</div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Incidents">
        {incidents.length === 0 ? <p className="text-muted">No incidents.</p> : (
          <ul className="plain-list">
            {incidents.map((i) => (
              <li key={i.id}><strong>{i.type}</strong> · {i.status} — {i.message}</li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Fuel">
        {fuelLogs.length === 0 ? <p className="text-muted">No fuel logs.</p> : (
          <ul className="plain-list">
            {fuelLogs.map((f) => (
              <li key={f.id}><span className="mono">{f.liters} L</span> · <span className="mono">{fmtDateTime(f.loggedAt)}</span> · {f.source}</li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Legal records">
        {legal.length === 0 ? <p className="text-muted">No legal records.</p> : (
          <ul className="plain-list">
            {legal.map((l) => (
              <li key={l.id}>
                <strong>{l.type}</strong> · <span className="mono">{l.referenceNo}</span> · {l.status}{' '}
                <Badge tone="neutral">{l.authority}</Badge>
                {l.cnr ? (
                  <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                    CNR <span className="mono">{l.cnr}</span>
                    {l.caseStage ? ` · stage: ${l.caseStage}` : ''}
                    {l.caseVerifiedAt ? ` · verified ${fmtDateTime(l.caseVerifiedAt)}` : ''}
                  </div>
                ) : null}
                {canRestriction && l.cnr ? <CourtCaseRefresh vehicleId={l.vehicleId} recordId={l.id} onDone={onDone} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Custody & disposal workflow ---------------- */

const CUSTODY_LABEL: Record<string, string> = {
  IN_CUSTODY: 'In custody',
  AUCTION_READY: 'Auction / disposal ready',
  RELEASED: 'Released from custody',
  DISPOSED: 'Disposed'
};

function CustodyPanel({ vehicle, legal, canRestriction, onDone }: { vehicle: VehicleView; legal: VehicleDetailData['legal']; canRestriction: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const closed = vehicle.custodyState === 'RELEASED' || vehicle.custodyState === 'DISPOSED';
  const seized = vehicle.ownershipCategory === 'SEIZED_IMPOUNDED';
  const showWorkflow = seized || vehicle.custodyState != null;
  const [mode, setMode] = useState<'none' | 'link' | 'release' | 'auction'>('none');
  const [cnr, setCnr] = useState('');
  const [reason, setReason] = useState('');
  const [authority, setAuthority] = useState('');
  const [releasedTo, setReleasedTo] = useState('');
  const [busy, setBusy] = useState(false);

  if (!showWorkflow) return null;

  async function submit(action: 'linkCourtCase' | 'releaseCustody' | 'markAuctionReady', payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await api.post(`/api/cloud/vehicles/${vehicle.id}/actions`, { type: action, ...payload });
      toast('Recorded', 'success');
      setMode('none');
      setCnr('');
      setReason('');
      setAuthority('');
      setReleasedTo('');
      onDone();
    } catch (e) {
      const m = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed';
      toast(m, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Custody & disposal">
      <div className="cluster" style={{ flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <Badge tone={vehicle.custodyState === 'AUCTION_READY' ? 'warning' : closed ? 'neutral' : 'danger'}>
          {CUSTODY_LABEL[vehicle.custodyState ?? 'IN_CUSTODY']}
        </Badge>
        {seized ? <OwnershipBadge category={vehicle.ownershipCategory} /> : null}
      </div>
      {vehicle.custodyNote ? (
        <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>{vehicle.custodyNote}</p>
      ) : null}
      {seized && legal.filter((l) => l.type === 'COURT_CASE').length === 0 ? (
        <div className="toast-inline toast-inline--warning" role="note">
          <AlertTriangle size={16} className="toast-inline__icon" aria-hidden="true" />
          <span className="toast-inline__message">
            No court case is linked. Release or auction must rest on a verified legal authorisation — link the eCourts case (CNR) as evidence first.
          </span>
        </div>
      ) : null}
      {canRestriction && !closed ? (
        <div className="cluster" style={{ flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={() => setMode(mode === 'link' ? 'none' : 'link')}>Link court case (CNR)</Button>
          {seized ? <Button variant="secondary" size="sm" onClick={() => setMode(mode === 'release' ? 'none' : 'release')}>Record custody release</Button> : null}
          <Button variant="secondary" size="sm" onClick={() => setMode(mode === 'auction' ? 'none' : 'auction')}>Mark auction-ready</Button>
        </div>
      ) : null}
      {mode === 'link' ? (
        <div className="veh-inline-form">
          <input className="input" placeholder="16-character CNR, e.g. MPGW010012342024" value={cnr} onChange={(e) => setCnr(e.target.value)} maxLength={16} aria-label="CNR number" />
          <div className="cluster">
            <Button variant="ghost" size="sm" onClick={() => setMode('none')} disabled={busy}>Cancel</Button>
            <Button variant="primary" size="sm" loading={busy} disabled={cnr.trim().length !== 16} onClick={() => submit('linkCourtCase', { cnr: cnr.trim().toUpperCase() })}>Fetch & link</Button>
          </div>
          <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>Case data comes from eCourts as supporting evidence for a human decision — it never changes eligibility by itself.</p>
        </div>
      ) : null}
      {mode === 'release' ? (
        <div className="veh-inline-form">
          <input className="input" placeholder="Authority (e.g. CJM Gwalior order dt. …)" value={authority} onChange={(e) => setAuthority(e.target.value)} aria-label="Releasing authority" />
          <input className="input" placeholder="Released to (owner / department, optional)" value={releasedTo} onChange={(e) => setReleasedTo(e.target.value)} aria-label="Released to" />
          <input className="input" placeholder="Reason / order reference" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Release reason" />
          <div className="cluster">
            <Button variant="ghost" size="sm" onClick={() => setMode('none')} disabled={busy}>Cancel</Button>
            <Button variant="primary" size="sm" loading={busy} disabled={!reason.trim() || !authority.trim()} onClick={() => submit('releaseCustody', { reason: reason.trim(), authority: authority.trim(), releasedTo: releasedTo.trim() || undefined })}>Record release</Button>
          </div>
          <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>Lifts custody restrictions, closes open seizure/court records and retires the asset. Everything is written to the audit ledger.</p>
        </div>
      ) : null}
      {mode === 'auction' ? (
        <div className="veh-inline-form">
          <input className="input" placeholder="Authorising authority" value={authority} onChange={(e) => setAuthority(e.target.value)} aria-label="Auction authority" />
          <div className="cluster">
            <Button variant="ghost" size="sm" onClick={() => setMode('none')} disabled={busy}>Cancel</Button>
            <Button variant="primary" size="sm" loading={busy} disabled={!authority.trim()} onClick={() => submit('markAuctionReady', { authority: authority.trim() })}>Mark auction-ready</Button>
          </div>
          <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>Withdraws the vehicle from ordinary allocation and lists it for the GeM disposal export on the Idle &amp; reuse page.</p>
        </div>
      ) : null}
    </Panel>
  );
}

function CourtCaseRefresh({ vehicleId, recordId, onDone }: { vehicleId: string; recordId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      await api.post(`/api/cloud/vehicles/${vehicleId}/actions`, { type: 'refreshCourtCase', recordId });
      toast('Case refreshed from eCourts cache', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed', 'danger');
    } finally {
      setBusy(false);
    }
  }

  return <Button variant="ghost" size="sm" onClick={refresh} loading={busy}>Refresh case</Button>;
}

/* ---------------- Telemetry ---------------- */

function TelemetrySection({ vehicle, devices, masked }: { vehicle: VehicleDetailData['vehicle']; devices: VehicleDetailData['devices']; masked: boolean }) {
  const full = isVehicleView(vehicle);
  const v = vehicle as VehicleView;
  const simulated = full && v.gpsSource === 'SIMULATED';

  return (
    <div className="stack">
      <Panel title="Last known position">
        {masked || !full ? (
          <p className="text-muted">Exact position is masked for vehicles outside your organization.</p>
        ) : (
          <>
            <div className="cluster" style={{ gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <FreshnessBadge freshness={v.telemetryFreshness} lastSeenAt={v.lastSeenAt} />
              <Badge tone={simulated ? 'warning' : 'info'}>{simulated ? 'Simulated demo telemetry' : 'Live device'}</Badge>
              <Badge tone="neutral">Source: {v.gpsSource}</Badge>
            </div>
            <div className="kv" style={{ marginBottom: '0.5rem' }}>
              <span>Device time (recorded)</span>
              <span>{fmtClock(v.lastSeenAt)}</span>
              <span>Server ingestion time</span>
              <span>{fmtClock(v.lastIngestedAt)}</span>
            </div>
            {v.telemetryFreshness !== 'FRESH' ? (
              <div className="toast-inline toast-inline--warning" role="note">
                <AlertTriangle size={16} className="toast-inline__icon" aria-hidden="true" />
                <span className="toast-inline__message">
                  Telemetry is {v.telemetryFreshness.toLowerCase()}. This does <strong>not</strong> mean the vehicle is
                  inactive, unavailable or lost — only that the last reported position is older than the freshness
                  threshold. Positions are never interpolated.
                </span>
              </div>
            ) : null}
            <MiniMap lat={v.lat} lng={v.lng} heading={v.heading} />
          </>
        )}
      </Panel>
      {!masked ? (
        <Panel title="Devices">
          {devices.length === 0 ? <p className="text-muted">No devices bound.</p> : (
            <ul className="plain-list">
              {devices.map((d) => (
                <li key={d.id}>
                  <strong className="mono">{d.deviceCode}</strong> · {d.kind} · {d.status}{' '}
                  {d.simulated ? <Badge tone="warning">Simulated</Badge> : <Badge tone="info">Real</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
