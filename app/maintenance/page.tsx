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
import { BarList } from '@/components/ui/BarList';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
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
  const [raiseOpen, setRaiseOpen] = useState(false);
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
      .map((v) => ({ label: v.registrationNumber, value: Math.round(v.maintenanceRisk * 100), detail: `${Math.round(v.maintenanceRisk * 100)}%` }));
  }, [snapshot]);

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
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setRaiseOpen(true)}>
              Raise ticket
            </Button>
          ) : undefined
        }
      />

      <div className="metric-grid">
        <div className="metric-tile"><span className="text-muted">Open tickets</span><strong style={{ fontSize: '1.6rem' }}>{stats.open}</strong></div>
        <div className="metric-tile"><span className="text-muted">Overdue</span><strong style={{ fontSize: '1.6rem' }}>{stats.overdue}</strong></div>
        <div className="metric-tile"><span className="text-muted">Upcoming</span><strong style={{ fontSize: '1.6rem' }}>{stats.upcoming}</strong></div>
        <div className="metric-tile"><span className="text-muted">Total cost</span><strong style={{ fontSize: '1.4rem' }}>{fmtInr(stats.totalCost)}</strong></div>
      </div>

      <div className="grid-2">
        <Panel title="Service tickets" action={<ViewToggle value={viewMode} onChange={setViewMode} />}>
          <div className="toolbar">
            <SearchField value={query} onChange={setQuery} ariaLabel="Search tickets" placeholder="Search ticket, vehicle, title" />
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
            <EmptyState icon={<Wrench size={28} />} title="No tickets" description="No maintenance tickets match the filters." />
          ) : viewMode === 'table' ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Vehicle</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th>Cost</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const v = vehicleById(t.vehicleId);
                    return (
                      <tr key={t.id}>
                        <td>
                          <div style={{ fontWeight: 540 }} className="mono">{t.ticketCode}</div>
                          <div className="text-muted" style={{ fontSize: '0.8rem' }}>{t.title}</div>
                        </td>
                        <td className="mono">{v?.registrationNumber ?? '-'}</td>
                        <td><Badge tone={SEV_TONE[t.severity]}>{t.severity}</Badge></td>
                        <td><Badge tone={STATUS_TONE[t.status]}>{t.status.replace('_', ' ')}</Badge></td>
                        <td>{t.dueDate ? fmtDate(t.dueDate) : '-'}</td>
                        <td className="mono">{t.costInr ? fmtInr(t.costInr) : '-'}</td>
                        <td>
                          {can('maintenance.write') && t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && (
                            <Button size="sm" variant="secondary" onClick={() => setUpdate(t)}>Update</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="veh-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
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
                    <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div><strong>Vehicle:</strong> <span className="mono">{v?.registrationNumber ?? '-'}</span></div>
                      <div><strong>Status:</strong> <Badge tone={STATUS_TONE[t.status]}>{t.status.replace('_', ' ')}</Badge></div>
                      <div><strong>Due:</strong> {t.dueDate ? fmtDate(t.dueDate) : '—'}</div>
                      <div><strong>Cost:</strong> <span className="mono">{t.costInr ? fmtInr(t.costInr) : '—'}</span></div>
                    </div>
                    {can('maintenance.write') && t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && (
                      <div className="veh-card-foot" style={{ justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="secondary" onClick={() => setUpdate(t)}>Update</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Predicted risk" subtitle="Top vehicles by maintenance risk" icon={<AlertTriangle size={16} />}>
          {riskList.length === 0 ? (
            <EmptyState title="No risk data" />
          ) : (
            <BarList items={riskList} />
          )}
        </Panel>
      </div>

      {raiseOpen && <RaiseTicketModal vehicles={snapshot!.vehicles} onClose={() => setRaiseOpen(false)} onDone={async () => { setRaiseOpen(false); await refresh(); }} toast={toast} />}
      {update && <UpdateTicketModal ticket={update} onClose={() => setUpdate(null)} onDone={async () => { setUpdate(null); await refresh(); }} toast={toast} />}
    </div>
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
