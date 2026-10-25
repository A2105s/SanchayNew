'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Plus, RefreshCw, RotateCcw, Trash2, UserCog, Database } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { fmtDateTime, fmtRelative } from '@/lib/fleet/format';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { OperatorView, Role, StationView } from '@/types';

type ToastFn = (m: string, v?: 'success' | 'warning' | 'danger' | 'info') => void;

const ROLES: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'DEPT_OFFICER', label: 'Department officer' },
  { value: 'STATION_OFFICER', label: 'Station officer' },
  { value: 'FIELD_STAFF', label: 'Field staff' },
  { value: 'AUDITOR', label: 'Auditor' },
];

export function OperatorsPanel({ stations, toast }: { stations: StationView[]; toast: ToastFn }) {
  const [operators, setOperators] = useState<OperatorView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<OperatorView | null>(null);
  const [deactivate, setDeactivate] = useState<OperatorView | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setOperators(await api.get<OperatorView[]>('/api/cloud/operators'));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load operators');
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function toggleActive(op: OperatorView) {
    setBusy(true);
    try {
      await api.post(`/api/cloud/operators/${op.id}/actions`, { type: 'setActive', active: !op.active });
      toast(op.active ? 'Operator deactivated' : 'Operator activated', 'success');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Action failed', 'danger');
    } finally {
      setBusy(false);
      setDeactivate(null);
    }
  }

  const stationName = (id: string | null) => (id ? stations.find((s) => s.id === id)?.name ?? id : '—');

  return (
    <Panel
      title="Operators"
      subtitle="Manage who can sign in"
      icon={<UserCog size={17} />}
      action={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>Add operator</Button>}
    >
      {err ? (
        <EmptyState title="Could not load operators" description={err} action={<Button onClick={() => load()}>Retry</Button>} />
      ) : operators === null ? (
        <Skeleton height={160} />
      ) : operators.length === 0 ? (
        <EmptyState title="No operators" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Operator</th>
                <th>Role</th>
                <th>Station</th>
                <th>Last login</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {operators.map((op) => (
                <tr key={op.id}>
                  <td>
                    <div style={{ fontWeight: 540 }}>{op.displayName}</div>
                    <div className="text-muted mono" style={{ fontSize: '0.78rem' }}>{op.username}</div>
                  </td>
                  <td>{ROLES.find((r) => r.value === op.role)?.label ?? op.role}</td>
                  <td style={{ fontSize: '0.85rem' }}>{stationName(op.stationId)}</td>
                  <td className="text-muted" style={{ fontSize: '0.8rem' }}>{op.lastLoginAt ? fmtRelative(op.lastLoginAt) : 'Never'}</td>
                  <td><Badge tone={op.active ? 'success' : 'neutral'}>{op.active ? 'Active' : 'Inactive'}</Badge></td>
                  <td>
                    <div className="cluster" style={{ gap: 4 }}>
                      <Button size="sm" variant="ghost" icon={<KeyRound size={13} />} onClick={() => setResetFor(op)}>Reset</Button>
                      <Button size="sm" variant={op.active ? 'danger' : 'secondary'} onClick={() => (op.active ? setDeactivate(op) : toggleActive(op))}>
                        {op.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CreateOperatorModal
          stations={stations}
          onClose={() => setCreateOpen(false)}
          onDone={async () => { setCreateOpen(false); await load(); }}
          toast={toast}
        />
      )}
      {resetFor && (
        <ResetPasswordModal
          operator={resetFor}
          onClose={() => setResetFor(null)}
          onDone={() => setResetFor(null)}
          toast={toast}
        />
      )}
      {deactivate && (
        <ConfirmDialog
          title="Deactivate operator?"
          message={`${deactivate.displayName} will no longer be able to sign in. You can reactivate them later.`}
          confirmLabel="Deactivate"
          tone="danger"
          loading={busy}
          onConfirm={() => toggleActive(deactivate)}
          onClose={() => setDeactivate(null)}
        />
      )}
    </Panel>
  );
}

function CreateOperatorModal({
  stations,
  onClose,
  onDone,
  toast,
}: {
  stations: StationView[];
  onClose: () => void;
  onDone: () => void;
  toast: ToastFn;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('STATION_OFFICER');
  const [stationId, setStationId] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const usernameValid = /^[a-zA-Z0-9._-]{3,60}$/.test(username);
  const valid = usernameValid && displayName.trim() && password.length >= 8;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      await api.post('/api/cloud/operators', {
        username: username.trim(),
        displayName: displayName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role,
        stationId: stationId || undefined,
        password,
      });
      toast('Operator created', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not create operator', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add operator"
      size="large"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!valid} onClick={submit}>Create</Button>
        </>
      }
    >
      <div className="stack">
        <div className="grid-2">
          <Field label="Username" required error={username && !usernameValid ? '3-60 chars: letters, numbers, . _ -' : undefined}>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Display name" required>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Role" required>
            <Select ariaLabel="Role" value={role} onChange={(v) => setRole(v as Role)} options={ROLES} />
          </Field>
          <Field label="Station">
            <Select
              ariaLabel="Station"
              value={stationId}
              onChange={setStationId}
              placeholder="None"
              options={[{ value: '', label: 'None' }, ...stations.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </Field>
        </div>
        <Field label="Temporary password" required hint="Minimum 8 characters" error={password && password.length < 8 ? 'At least 8 characters' : undefined}>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({
  operator,
  onClose,
  onDone,
  toast,
}: {
  operator: OperatorView;
  onClose: () => void;
  onDone: () => void;
  toast: ToastFn;
}) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = password.length >= 8;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      await api.post(`/api/cloud/operators/${operator.id}/actions`, { type: 'resetPassword', password });
      toast('Password reset', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not reset password', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Reset password — ${operator.displayName}`}
      size="small"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!valid} onClick={submit}>Reset password</Button>
        </>
      }
    >
      <Field label="New temporary password" required error={password && !valid ? 'At least 8 characters' : undefined}>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </Field>
    </Modal>
  );
}

interface SyncJobRow {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError?: string;
  updatedAt: string;
}
interface SyncSummary {
  pending: number;
  processing: number;
  failed: number;
  completed: number;
  recent: SyncJobRow[];
}

export function DataCloudPanel({ isAdmin, toast }: { isAdmin: boolean; toast: ToastFn }) {
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [seedMode, setSeedMode] = useState<null | 'demo' | 'reset'>(null);
  const [confirmText, setConfirmText] = useState('');
  const [seeding, setSeeding] = useState(false);

  async function load() {
    try {
      setSummary(await api.get<SyncSummary>('/api/cloud/sync-jobs'));
    } catch {
      setSummary(null);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function retry() {
    setRetrying(true);
    try {
      setSummary(await api.post<SyncSummary>('/api/cloud/sync-jobs'));
      toast('Server retries processed', 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not process retries', 'danger');
    } finally {
      setRetrying(false);
    }
  }

  async function runSeed() {
    if (!seedMode) return;
    setSeeding(true);
    try {
      await api.post('/api/cloud/seed', { mode: seedMode });
      toast(seedMode === 'demo' ? 'Demo data loaded' : 'Demo data reset', 'success');
      setSeedMode(null);
      setConfirmText('');
      await load();
      // Snapshot reloads automatically via dataVersion polling.
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Seed operation failed', 'danger');
    } finally {
      setSeeding(false);
    }
  }

  const expectedConfirm = seedMode === 'reset' ? 'RESET' : 'LOAD';

  return (
    <div className="stack">
      <Panel title="Cloud status" subtitle="Background sync queue" icon={<Database size={17} />} action={
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} loading={retrying} onClick={retry}>Process retries</Button>
      }>
        {summary === null ? (
          <Skeleton height={80} />
        ) : (
          <>
            <div className="metric-grid" style={{ marginBottom: 12 }}>
              <div className="metric-tile"><span className="text-muted">Pending</span><strong style={{ fontSize: '1.4rem' }}>{summary.pending}</strong></div>
              <div className="metric-tile"><span className="text-muted">Processing</span><strong style={{ fontSize: '1.4rem' }}>{summary.processing}</strong></div>
              <div className="metric-tile"><span className="text-muted">Failed</span><strong style={{ fontSize: '1.4rem' }}>{summary.failed}</strong></div>
              <div className="metric-tile"><span className="text-muted">Completed</span><strong style={{ fontSize: '1.4rem' }}>{summary.completed}</strong></div>
            </div>
            {summary.recent.length === 0 ? (
              <EmptyState title="No sync jobs" description="Background jobs will appear here." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Status</th>
                      <th>Attempts</th>
                      <th>Updated</th>
                      <th>Last error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recent.slice(0, 15).map((j) => (
                      <tr key={j.id}>
                        <td className="mono" style={{ fontSize: '0.82rem' }}>{j.type}</td>
                        <td>
                          <Badge tone={j.status === 'Completed' ? 'success' : j.status === 'Failed' ? 'danger' : j.status === 'Processing' ? 'info' : 'warning'}>
                            {j.status}
                          </Badge>
                        </td>
                        <td className="mono">{j.attempts}/{j.maxAttempts}</td>
                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>{fmtRelative(j.updatedAt)}</td>
                        <td className="text-muted" style={{ fontSize: '0.78rem', maxWidth: 240 }}>{j.lastError ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Panel>

      {isAdmin && (
        <Panel title="Demo data" subtitle="Administrator only">
          <div className="stack">
            <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>
              Load the Gwalior demo fleet into an empty database, or reset all fleet data and re-seed. Operators and the audit ledger are preserved.
            </p>
            <div className="cluster">
              <Button variant="secondary" icon={<Database size={15} />} onClick={() => { setSeedMode('demo'); setConfirmText(''); }}>Load demo data</Button>
              <Button variant="danger" icon={<RotateCcw size={15} />} onClick={() => { setSeedMode('reset'); setConfirmText(''); }}>Reset demo data</Button>
            </div>
          </div>
        </Panel>
      )}

      {seedMode && (
        <Modal
          title={seedMode === 'reset' ? 'Reset all fleet data' : 'Load demo data'}
          size="small"
          onClose={() => setSeedMode(null)}
          closeDisabled={seeding}
          footer={
            <>
              <Button variant="ghost" onClick={() => setSeedMode(null)} disabled={seeding}>Cancel</Button>
              <Button
                variant={seedMode === 'reset' ? 'danger' : 'primary'}
                loading={seeding}
                disabled={confirmText !== expectedConfirm}
                onClick={runSeed}
                icon={seedMode === 'reset' ? <Trash2 size={15} /> : <Database size={15} />}
              >
                {seedMode === 'reset' ? 'Reset and re-seed' : 'Load demo data'}
              </Button>
            </>
          }
        >
          <div className="stack">
            {seedMode === 'reset' ? (
              <p className="modal-copy" style={{ color: 'var(--color-danger)' }}>
                This permanently deletes all vehicles, trips, telemetry, bookings and transfers, then loads the demo fleet. This cannot be undone.
              </p>
            ) : (
              <p className="modal-copy">This loads the Gwalior demo fleet. It only works when the fleet is currently empty.</p>
            )}
            <Field label={`Type ${expectedConfirm} to confirm`} required>
              <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={expectedConfirm} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

export { fmtDateTime };
