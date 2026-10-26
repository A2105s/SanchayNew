'use client';

import { useMemo, useState } from 'react';
import { Wrench, AlertTriangle, Plus } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { fmtDate, fmtInr } from '@/lib/fleet/format';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { SearchField } from '@/components/ui/SearchField';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import { BarList } from '@/components/ui/BarList';
import { ExpandableCard } from '@/components/ui/ExpandableCard';
import { KpiCard } from '@/components/analytics/AnalyticsKit';
import type { MaintenanceSeverity, MaintenanceStatus, MaintenanceView, VehicleView } from '@/types';

const SEV_TONE: Record<MaintenanceSeverity, 'info' | 'warning' | 'danger' | 'neutral'> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};
const STATUS_TONE: Record<MaintenanceStatus, 'info' | 'warning' | 'success' | 'danger' | 'neutral' | 'brand'> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'brand',
  COMPLETED: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
};

export default function MaintenancePage() {
  const { snapshot, loading, error, refresh, can, vehicleById } = useFleet();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | 'ALL'>('ALL');
  const [sevFilter, setSevFilter] = useState<MaintenanceSeverity | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [showRaiseForm, setShowRaiseForm] = useState(false);
  const [showRiskBreakdown, setShowRiskBreakdown] = useState(false);
  const [raiseModalOpen, setRaiseModalOpen] = useState(false);
  const [update, setUpdate] = useState<MaintenanceView | null>(null);

  const tickets = snapshot?.maintenance ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (sevFilter !== 'ALL' && t.severity !== sevFilter) return false;
      if (q) {
        const v = vehicleById(t.vehicleId);
        const hay = `${t.ticketCode} ${t.title} ${v?.registrationNumber ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, statusFilter, sevFilter, query, vehicleById]);

  const riskList = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.vehicles]
      .filter((v) => v.operationalStatus === 'ACTIVE' || v.operationalStatus === 'MAINTENANCE')
      .sort((a, b) => b.maintenanceRisk - a.maintenanceRisk)
      .slice(0, 8)
      .map((v) => {
        const risk = v.maintenanceRisk > 1 ? Math.round(v.maintenanceRisk) : Math.round(v.maintenanceRisk * 100);
        return {
          label: v.registrationNumber,
          value: risk,
          detail: risk >= 80 ? 'CRITICAL RISK' : risk >= 50 ? 'HIGH RISK' : 'MODERATE',
        };
      });
  }, [snapshot]);

  const highRiskCount = useMemo(() => {
    return riskList.filter((r) => r.value >= 70).length;
  }, [riskList]);

  const stats = useMemo(() => {
    const open = tickets.filter((t) => t.status === 'SCHEDULED' || t.status === 'IN_PROGRESS');
    const overdue = tickets.filter((t) => t.status === 'OVERDUE');
    const totalCost = tickets.reduce((s, t) => s + (t.costInr ?? 0), 0);
    const now = Date.now();
    const upcoming = tickets.filter((t) => t.dueDate && Date.parse(t.dueDate) > now && t.status !== 'COMPLETED');
    return { open: open.length, overdue: overdue.length, totalCost, upcoming: upcoming.length };
  }, [tickets]);

  if (loading && !snapshot) {
    return (
      <div className="page stack">
        <PageTitle title="Maintenance" />
        <Skeleton height={320} />
      </div>
    );
  }
  if (error && !snapshot) {
    return (
      <div className="page">
        <EmptyState title="Could not load maintenance" description={error} action={<Button onClick={() => refresh()}>Retry</Button>} />
      </div>
    );
  }

  return (
    <div className="page stack">
      <PageTitle
        eyebrow="Fleet"
        title="Maintenance"
        description="Service tickets, predicted risk and cost tracking across the fleet."
        action={
          can('maintenance.write') ? (
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => setShowRaiseForm((prev) => !prev)}
            >
              {showRaiseForm ? 'Hide form' : 'Raise ticket'}
            </Button>
          ) : undefined
        }
      />

      <section className="an-kpis" aria-label="Maintenance overview metrics">
        <KpiCard label="Open tickets" value={stats.open.toLocaleString('en-IN')} tone={stats.open ? 'warning' : 'success'} hint="Active maintenance cases" />
        <KpiCard label="Overdue" value={stats.overdue.toLocaleString('en-IN')} tone={stats.overdue ? 'danger' : 'success'} hint="Past scheduled service date" />
        <KpiCard label="Upcoming" value={stats.upcoming.toLocaleString('en-IN')} tone="info" hint="Due for service soon" />
        <KpiCard label="Total cost" value={fmtInr(stats.totalCost)} tone="brand" hint="Cumulative repair expenditures" />
      </section>

      {/* Expandable Action Banner (EasyLife Parity: "Add Customer / Show form v") */}
      {can('maintenance.write') && snapshot && (
        <ExpandableCard
          icon={<Plus size={20} />}
          iconTone="brand"
          title="Raise Service Ticket"
          subtitle="Create a maintenance case, assign workshop or technician, and set priority."
          expandLabel="Show form"
          collapseLabel="Hide form"
          expanded={showRaiseForm}
          onToggle={setShowRaiseForm}
        >
          <InlineRaiseTicketForm
            vehicles={snapshot.vehicles}
            onDone={async () => {
              setShowRaiseForm(false);
              await refresh();
            }}
            onCancel={() => setShowRaiseForm(false)}
            toast={toast}
          />
        </ExpandableCard>
      )}

      {/* Expandable Risk Intelligence Card (Horizontal stack instead of cramping the table) */}
      <ExpandableCard
        icon={<AlertTriangle size={18} />}
        iconTone="warning"
        title="Predicted Maintenance Risk"
        subtitle="Telemetry-backed AI risk scoring detecting early component wear before roadside breakdown."
        badge={
          highRiskCount > 0 ? (
            <Badge tone="warning">{highRiskCount} high-risk vehicles</Badge>
          ) : (
            <Badge tone="success">Fleet healthy</Badge>
          )
        }
        expandLabel="Show risk analysis"
        collapseLabel="Hide risk analysis"
        expanded={showRiskBreakdown}
        onToggle={setShowRiskBreakdown}
      >
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-muted" style={{ fontSize: '0.84rem' }}>
              Top fleet vehicles ranked by predictive failure probability index (0 - 100%)
            </span>
            <span className="mono text-muted" style={{ fontSize: '0.78rem' }}>
              Telemetry: Live sensor & OBD diagnostics
            </span>
          </div>

          {riskList.length === 0 ? (
            <EmptyState title="No risk data" description="All vehicles are operating within normal tolerances." />
          ) : (
            <BarList
              items={riskList}
              tone="warning"
              maxValue={100}
              valueFormatter={(val) => `${val}%`}
            />
          )}
        </div>
      </ExpandableCard>

      {/* Main Service Tickets: 100% full width table cards */}
      <Panel
        title="Service tickets"
        action={
          <div className="cluster" style={{ gap: 'var(--space-3)', alignItems: 'center' }}>
            <Badge tone="neutral">{filtered.length} {filtered.length === 1 ? 'ticket' : 'tickets'}</Badge>
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        }
      >
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          <div className="toolbar" style={{ margin: 0, gap: 'var(--space-2)', display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 320px' }}>
              <SearchField
                value={query}
                onChange={setQuery}
                ariaLabel="Search tickets"
                placeholder="Search ticket code, vehicle reg, issue, or workshop..."
                placeholders={[
                  'Search maintenance tickets (e.g. "TCK-")…',
                  'Search by vehicle (e.g. "MP-07-")…',
                  'Search issue title or workshop…',
                  'Search by severity or vendor…',
                ]}
              />
            </div>
            <Select
              ariaLabel="Status filter"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as MaintenanceStatus | 'ALL')}
              options={[
                { value: 'ALL', label: 'All statuses' },
                { value: 'SCHEDULED', label: 'Scheduled' },
                { value: 'IN_PROGRESS', label: 'In progress' },
                { value: 'OVERDUE', label: 'Overdue' },
                { value: 'COMPLETED', label: 'Completed' },
                { value: 'CANCELLED', label: 'Cancelled' },
              ]}
            />
            <Select
              ariaLabel="Severity filter"
              value={sevFilter}
              onChange={(v) => setSevFilter(v as MaintenanceSeverity | 'ALL')}
              options={[
                { value: 'ALL', label: 'All severities' },
                { value: 'CRITICAL', label: 'Critical' },
                { value: 'HIGH', label: 'High' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'LOW', label: 'Low' },
              ]}
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={<Wrench size={28} />} title="No tickets" description="No maintenance tickets match the active filters." />
          ) : viewMode === 'table' ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Vehicle</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Due date</th>
                    <th>Cost</th>
                    <th aria-label="Actions" style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const v = vehicleById(t.vehicleId);
                    return (
                      <tr key={t.id}>
                        <td>
                          <div><strong className="mono table-code">{t.ticketCode}</strong></div>
                          <div className="text-muted" style={{ fontSize: '0.82rem' }}>{t.title}</div>
                        </td>
                        <td>
                          {v?.registrationNumber ? (
                            <div className="cluster" style={{ gap: 6, alignItems: 'center' }}>
                              <span className="reg-plate-inline">{v.registrationNumber}</span>
                              <span className="text-muted" style={{ fontSize: '0.8rem' }}>{v.displayName}</span>
                            </div>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td><Badge tone={SEV_TONE[t.severity]}>{t.severity}</Badge></td>
                        <td><Badge tone={STATUS_TONE[t.status]}>{t.status.replace('_', ' ')}</Badge></td>
                        <td className="mono" style={{ fontSize: '0.84rem' }}>{t.dueDate ? fmtDate(t.dueDate) : '—'}</td>
                        <td className="mono">{t.costInr ? fmtInr(t.costInr) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {can('maintenance.write') && t.status !== 'COMPLETED' && t.status !== 'CANCELLED' ? (
                            <button type="button" className="table-action" onClick={() => setUpdate(t)}>
                              Update
                            </button>
                          ) : (
                            <span className="text-muted" style={{ fontSize: '0.8rem' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="veh-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {filtered.map((t) => {
                const v = vehicleById(t.vehicleId);
                return (
                  <div key={t.id} className="veh-card">
                    <div className="veh-card-head">
                      <div>
                        <div className="mono" style={{ fontWeight: 700, color: 'var(--color-brand)' }}>
                          {t.ticketCode}
                        </div>
                        <div className="veh-card-sub" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {t.title}
                        </div>
                      </div>
                      <Badge tone={SEV_TONE[t.severity]}>{t.severity}</Badge>
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div><strong>Vehicle:</strong> <span className="mono">{v?.registrationNumber ?? '-'}</span> {v?.displayName ? `(${v.displayName})` : ''}</div>
                      <div><strong>Status:</strong> <Badge tone={STATUS_TONE[t.status]}>{t.status.replace('_', ' ')}</Badge></div>
                      <div><strong>Due:</strong> {t.dueDate ? fmtDate(t.dueDate) : '—'}</div>
                      <div><strong>Cost:</strong> <span className="mono">{t.costInr ? fmtInr(t.costInr) : '—'}</span></div>
                    </div>
                    {can('maintenance.write') && t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && (
                      <div className="veh-card-foot" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                        <Button size="sm" variant="secondary" onClick={() => setUpdate(t)}>Update</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Panel>

      {raiseModalOpen && snapshot && (
        <RaiseTicketModal
          vehicles={snapshot.vehicles}
          onClose={() => setRaiseModalOpen(false)}
          onDone={async () => {
            setRaiseModalOpen(false);
            await refresh();
          }}
          toast={toast}
        />
      )}

      {update && (
        <UpdateTicketModal
          ticket={update}
          onClose={() => setUpdate(null)}
          onDone={async () => {
            setUpdate(null);
            await refresh();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

function InlineRaiseTicketForm({
  vehicles,
  onCancel,
  onDone,
  toast,
}: {
  vehicles: VehicleView[];
  onCancel: () => void;
  onDone: () => void;
  toast: (m: string, v?: 'success' | 'warning' | 'danger' | 'info') => void;
}) {
  const [vehicleId, setVehicleId] = useState('');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<MaintenanceSeverity>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!vehicleId || !title.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/cloud/vehicles/${vehicleId}/actions`, {
        type: 'raiseMaintenance',
        title: title.trim(),
        severity,
        dueDate: dueDate || undefined,
        vendor: vendor || undefined,
        notes: notes || undefined,
      });
      toast('Maintenance ticket raised successfully', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not raise ticket', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="stack"
      style={{ gap: 'var(--space-4)' }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
        <Field label="Vehicle" required>
          <Select
            ariaLabel="Vehicle"
            value={vehicleId}
            onChange={setVehicleId}
            placeholder="Select vehicle"
            options={vehicles.map((v) => ({ value: v.id, label: `${v.registrationNumber} - ${v.displayName}` }))}
          />
        </Field>
        <Field label="Issue title" required>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Brake pad replacement"
          />
        </Field>
        <Field label="Severity">
          <Select
            ariaLabel="Severity"
            value={severity}
            onChange={(v) => setSeverity(v as MaintenanceSeverity)}
            options={[
              { value: 'LOW', label: 'Low' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'HIGH', label: 'High' },
              { value: 'CRITICAL', label: 'Critical' },
            ]}
          />
        </Field>
        <Field label="Due date">
          <input
            className="input"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
        <Field label="Workshop / Vendor">
          <input
            className="input"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Workshop or technician"
          />
        </Field>
      </div>

      <Field label="Diagnostic notes & instructions">
        <textarea
          className="textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional notes or fault codes observed..."
        />
      </Field>

      <div className="cluster" style={{ justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          type="submit"
          loading={saving}
          disabled={!vehicleId || !title.trim()}
          icon={<Plus size={15} />}
        >
          Raise ticket
        </Button>
      </div>
    </form>
  );
}

function RaiseTicketModal({
  vehicles,
  onClose,
  onDone,
  toast,
}: {
  vehicles: VehicleView[];
  onClose: () => void;
  onDone: () => void;
  toast: (m: string, v?: 'success' | 'warning' | 'danger' | 'info') => void;
}) {
  const [vehicleId, setVehicleId] = useState('');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<MaintenanceSeverity>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!vehicleId || !title.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/cloud/vehicles/${vehicleId}/actions`, {
        type: 'raiseMaintenance',
        title: title.trim(),
        severity,
        dueDate: dueDate || undefined,
        vendor: vendor || undefined,
        notes: notes || undefined,
      });
      toast('Maintenance ticket raised', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not raise ticket', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Raise maintenance ticket"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!vehicleId || !title.trim()} onClick={submit}>Raise ticket</Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Vehicle" required>
          <Select
            ariaLabel="Vehicle"
            value={vehicleId}
            onChange={setVehicleId}
            placeholder="Select vehicle"
            options={vehicles.map((v) => ({ value: v.id, label: `${v.registrationNumber} - ${v.displayName}` }))}
          />
        </Field>
        <Field label="Title" required>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Brake pad replacement" />
        </Field>
        <div className="grid-2">
          <Field label="Severity">
            <Select
              ariaLabel="Severity"
              value={severity}
              onChange={(v) => setSeverity(v as MaintenanceSeverity)}
              options={[
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
                { value: 'CRITICAL', label: 'Critical' },
              ]}
            />
          </Field>
          <Field label="Due date">
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Vendor">
          <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Workshop / garage" />
        </Field>
        <Field label="Notes">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

function UpdateTicketModal({
  ticket,
  onClose,
  onDone,
  toast,
}: {
  ticket: MaintenanceView;
  onClose: () => void;
  onDone: () => void;
  toast: (m: string, v?: 'success' | 'warning' | 'danger' | 'info') => void;
}) {
  const [status, setStatus] = useState<MaintenanceStatus>(ticket.status);
  const [cost, setCost] = useState(ticket.costInr ? String(ticket.costInr) : '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api.post(`/api/cloud/vehicles/${ticket.vehicleId}/actions`, {
        type: 'updateMaintenance',
        ticketId: ticket.id,
        status,
        costInr: cost ? Number(cost) : undefined,
        notes: notes || undefined,
      });
      toast('Ticket updated', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not update ticket', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Update ${ticket.ticketCode}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={submit}>Save</Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Status">
          <Select
            ariaLabel="Status"
            value={status}
            onChange={(v) => setStatus(v as MaintenanceStatus)}
            options={[
              { value: 'SCHEDULED', label: 'Scheduled' },
              { value: 'IN_PROGRESS', label: 'In progress' },
              { value: 'OVERDUE', label: 'Overdue' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ]}
          />
        </Field>
        <Field label="Cost (INR)">
          <input className="input" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Field label="Notes">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
