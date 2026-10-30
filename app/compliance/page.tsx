'use client';

import { useMemo, useState } from 'react';
import { Download, ShieldCheck, BellRing } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { complianceItems, daysUntil, severityOf } from '@/lib/fleet/compliance';
import { fmtDate } from '@/lib/fleet/format';
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
import { KpiCard } from '@/components/analytics/AnalyticsKit';
import { DocumentScanPanel } from '@/components/ai/DocumentScanPanel';
import type { VehicleView } from '@/types';

type Severity = 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'OK';
type DocType = 'PUC' | 'INSURANCE' | 'FITNESS';

interface Row {
  vehicle: VehicleView;
  document: DocType;
  expiry: string | null;
  days: number | null;
  severity: Severity;
}

const SEV_TONE: Record<Severity, 'danger' | 'warning' | 'info' | 'success'> = {
  EXPIRED: 'danger',
  CRITICAL: 'danger',
  WARNING: 'warning',
  OK: 'success',
};

const DOC_LABEL: Record<DocType, string> = {
  PUC: 'PUC',
  INSURANCE: 'Insurance',
  FITNESS: 'Fitness',
};

export default function CompliancePage() {
  const { snapshot, loading, error, refresh, can } = useFleet();
  const { toast } = useToast();
  const [sevFilter, setSevFilter] = useState<Severity | 'ALL'>('ALL');
  const [docFilter, setDocFilter] = useState<DocType | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [renew, setRenew] = useState<Row | null>(null);
  const [newExpiry, setNewExpiry] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const rows = useMemo<Row[]>(() => {
    if (!snapshot) return [];
    const out: Row[] = [];
    for (const v of snapshot.vehicles) {
      const items = complianceItems(v, snapshot.settings);
      for (const it of items) {
        out.push({
          vehicle: v,
          document: it.document as DocType,
          expiry: it.expiry,
          days: it.expiry ? daysUntil(it.expiry) : null,
          severity: (it.severity?.toUpperCase?.() as Severity) ?? sevFromDays(it.expiry, snapshot.settings.complianceWarnDays, snapshot.settings.complianceCriticalDays),
        });
      }
    }
    return out;
  }, [snapshot]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (sevFilter !== 'ALL' && r.severity !== sevFilter) return false;
      if (docFilter !== 'ALL' && r.document !== docFilter) return false;
      if (q) {
        const hay = `${r.vehicle.registrationNumber} ${r.vehicle.displayName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, sevFilter, docFilter, query]);

  const grouped = useMemo(() => {
    const g: Record<DocType, Row[]> = { PUC: [], INSURANCE: [], FITNESS: [] };
    for (const r of filtered) g[r.document].push(r);
    for (const k of Object.keys(g) as DocType[]) {
      g[k].sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
    }
    return g;
  }, [filtered]);

  const counts = useMemo(() => {
    const c = { EXPIRED: 0, CRITICAL: 0, WARNING: 0, OK: 0 };
    for (const r of rows) c[r.severity] += 1;
    return c;
  }, [rows]);

  async function submitRenew() {
    if (!renew || !newExpiry) return;
    setSaving(true);
    try {
      await api.post(`/api/cloud/vehicles/${renew.vehicle.id}/actions`, {
        type: 'renewCompliance',
        document: renew.document,
        newExpiry,
        reference: reference || undefined,
      });
      toast(`${DOC_LABEL[renew.document]} renewed for ${renew.vehicle.registrationNumber}`, 'success');
      setRenew(null);
      setNewExpiry('');
      setReference('');
      await refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not renew document', 'danger');
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    window.open('/api/cloud/exports/compliance', '_blank');
  }

  if (loading && !snapshot) {
    return (
      <div className="page stack">
        <PageTitle title="Compliance" />
        <Skeleton height={320} />
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="page">
        <EmptyState title="Could not load compliance" description={error} action={<Button onClick={() => refresh()}>Retry</Button>} />
      </div>
    );
  }

  const canExport = can('export');

  return (
    <div className="page stack">
      <PageTitle
        eyebrow="Fleet"
        title="Compliance"
        description="PUC, insurance and fitness expiry tracker."
        action={
          canExport ? (
            <Button variant="secondary" icon={<Download size={15} />} onClick={exportCsv}>
              Export CSV
            </Button>
          ) : undefined
        }
      />

      <section className="an-kpis" aria-label="Compliance health metrics">
        <KpiCard label="Expired" value={counts.EXPIRED.toLocaleString('en-IN')} tone="danger" hint="Immediate renewal required" />
        <KpiCard label="Critical (<=7d)" value={counts.CRITICAL.toLocaleString('en-IN')} tone="danger" hint="Expiring within 7 days" />
        <KpiCard label="Warning (<=30d)" value={counts.WARNING.toLocaleString('en-IN')} tone="warning" hint="Expiring within 30 days" />
        <KpiCard label="Healthy" value={counts.OK.toLocaleString('en-IN')} tone="success" hint="All documents valid" />
      </section>

      <div className="toolbar">
        <SearchField
          value={query}
          onChange={setQuery}
          ariaLabel="Search vehicles"
          placeholder="Search registration or name"
          placeholders={[
            'Search registration (e.g. "MP-07-")…',
            'Search vehicle make or model…',
            'Search by document reference…',
            'Search expiring PUC, insurance, fitness…'
          ]}
        />
        <Select
          ariaLabel="Severity filter"
          value={sevFilter}
          onChange={(v) => setSevFilter(v as Severity | 'ALL')}
          options={[
            { value: 'ALL', label: 'All severities' },
            { value: 'EXPIRED', label: 'Expired' },
            { value: 'CRITICAL', label: 'Critical' },
            { value: 'WARNING', label: 'Warning' },
            { value: 'OK', label: 'OK' },
          ]}
        />
        <Select
          ariaLabel="Document filter"
          value={docFilter}
          onChange={(v) => setDocFilter(v as DocType | 'ALL')}
          options={[
            { value: 'ALL', label: 'All documents' },
            { value: 'PUC', label: 'PUC' },
            { value: 'INSURANCE', label: 'Insurance' },
            { value: 'FITNESS', label: 'Fitness' },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={28} />} title="Nothing matches" description="Adjust filters to see compliance documents." />
      ) : (
        (['PUC', 'INSURANCE', 'FITNESS'] as DocType[])
          .filter((d) => grouped[d].length > 0)
          .map((doc) => (
            <Panel key={doc} title={DOC_LABEL[doc]} subtitle={`${grouped[doc].length} document(s)`}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Vehicle</th>
                      <th>Expiry</th>
                      <th>Days</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[doc].map((r) => (
                      <tr key={`${r.vehicle.id}-${r.document}`}>
                        <td>
                          <div><span className="reg-plate-inline">{r.vehicle.registrationNumber}</span></div>
                          <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 3 }}>{r.vehicle.displayName}</div>
                        </td>
                        <td className="mono" style={{ fontSize: '0.84rem' }}>{r.expiry ? fmtDate(r.expiry) : <span className="text-muted">—</span>}</td>
                        <td className="mono">{r.days == null ? '-' : r.days < 0 ? `${Math.abs(r.days)}d ago` : `${r.days}d`}</td>
                        <td>
                          <Badge tone={SEV_TONE[r.severity]}>{r.severity}</Badge>
                        </td>
                        <td>
                          <div className="cluster">
                            {can('vehicle.edit') && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setRenew(r);
                                  setNewExpiry('');
                                  setReference('');
                                }}
                              >
                                Renew
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<BellRing size={14} />}
                              onClick={() => toast('Reminder queued (placeholder)', 'info')}
                            >
                              Notify owner
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))
      )}

      {renew && (
        <Modal
          title={`Renew ${DOC_LABEL[renew.document]} - ${renew.vehicle.registrationNumber}`}
          onClose={() => setRenew(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRenew(null)}>
                Cancel
              </Button>
              <Button variant="primary" loading={saving} disabled={!newExpiry} onClick={submitRenew}>
                Save renewal
              </Button>
            </>
          }
        >
          <div className="stack">
            <DocumentScanPanel
              onApply={(fields) => {
                if (fields.expiryDate) {
                  setNewExpiry(fields.expiryDate);
                  toast(`Extracted expiry date: ${fields.expiryDate}`, 'success');
                }
                if (fields.registrationNumber) {
                  setReference((prev) => prev || `Slip verified (${fields.registrationNumber})`);
                }
              }}
            />
            <Field label="New expiry date" required>
              <input className="input" type="date" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} />
            </Field>
            <Field label="Reference number" hint="Policy / certificate reference (optional)">
              <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. POL-2026-0043" />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}


function sevFromDays(expiry: string | null, warn: number, critical: number): Severity {
  if (!expiry) return 'OK';
  const d = daysUntil(expiry);
  if (d == null) return 'OK';
  if (d < 0) return 'EXPIRED';
  if (d <= critical) return 'CRITICAL';
  if (d <= warn) return 'WARNING';
  return 'OK';
}
