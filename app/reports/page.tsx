'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Info, Printer, RefreshCw } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { formatCell, renderReportCell } from '@/components/ops/shared';
import { api } from '@/lib/client/api';
import { PageTitle } from '@/components/ui/PageTitle';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Field } from '@/components/ui/Field';
import {
  AnalyticsSkeleton,
  BarTrend,
  ChartCard,
  DonutChart,
  EmptyState,
  KpiCard,
  RankedList,
  SectionHeading,
  type DonutDatum,
  type RankedListItem
} from '@/components/analytics/AnalyticsKit';
import type { ReportKind, ReportResult } from '@/types';

const REPORTS: { kind: ReportKind; label: string; group: string }[] = [
  { kind: 'fleet-composition', label: 'Fleet composition', group: 'Fleet' },
  { kind: 'utilization', label: 'Utilisation', group: 'Fleet' },
  { kind: 'downtime', label: 'Downtime', group: 'Fleet' },
  { kind: 'maintenance', label: 'Vehicles in maintenance', group: 'Fleet' },
  { kind: 'maintenance-history', label: 'Maintenance history', group: 'Fleet' },
  { kind: 'restricted-unverified', label: 'Restricted and unverified', group: 'Eligibility' },
  { kind: 'compliance-due', label: 'Compliance due', group: 'Eligibility' },
  { kind: 'stale-telemetry', label: 'Stale telemetry', group: 'Eligibility' },
  { kind: 'pending-approvals', label: 'Pending approvals', group: 'Requests' },
  { kind: 'approval-cycle-time', label: 'Approval cycle time', group: 'Requests' },
  { kind: 'active-allocations', label: 'Active allocations', group: 'Allocations' },
  { kind: 'overdue-returns', label: 'Overdue returns', group: 'Allocations' },
  { kind: 'allocation-history', label: 'Allocation history', group: 'Allocations' },
  { kind: 'audit-events', label: 'Audit events', group: 'Governance' }
];

const PALETTE = ['#0a7f8c', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0284c7', '#64748b', '#0d9488'];

export default function ReportsPage() {
  const { snapshot, can } = useFleet();
  const [kind, setKind] = useState<ReportKind>('fleet-composition');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [vehicleClass, setVehicleClass] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', new Date(from).toISOString());
    if (to) p.set('to', new Date(`${to}T23:59:59`).toISOString());
    if (vehicleClass) p.set('vehicleClass', vehicleClass);
    if (organizationId) p.set('organizationId', organizationId);
    return p.toString();
  }, [from, to, vehicleClass, organizationId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ReportResult>(`/api/cloud/reports/${kind}${query ? `?${query}` : ''}`);
      setReport(data);
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : 'Could not load this report.');
    } finally {
      setLoading(false);
    }
  }, [kind, query]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  // A category chart is shown when the report has a text column and a numeric column to aggregate.
  const chart = useMemo(() => {
    if (!report || report.rows.length === 0) return null;
    const textKey = report.columns.find((c) => report.rows.some((r) => typeof r[c.key] === 'string'))?.key;
    const numKey = report.columns.find((c) => report.rows.every((r) => r[c.key] === null || typeof r[c.key] === 'number'))?.key;
    if (!textKey) return null;
    const counts = new Map<string, number>();
    for (const r of report.rows) {
      const label = String(r[textKey] ?? 'Unknown');
      const add = numKey && typeof r[numKey] === 'number' ? (r[numKey] as number) : 1;
      counts.set(label, (counts.get(label) ?? 0) + add);
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (entries.length < 2 || entries.length > 40) return null;
    const max = entries[0][1] || 1;
    const donut: DonutDatum[] = entries.slice(0, 8).map(([label, count], i) => ({ label, count, color: PALETTE[i % PALETTE.length] }));
    const ranked: RankedListItem[] = entries.slice(0, 10).map(([label, count]) => ({ label, count, percent: Math.round((count / max) * 100) }));
    const textLabel = report.columns.find((c) => c.key === textKey)?.label ?? 'Group';
    return { donut, ranked, textLabel, byNumber: Boolean(numKey) };
  }, [report]);

  const trend = useMemo(() => {
    if (!report || report.rows.length === 0) return null;
    const dateKey = report.columns.find((c) => report.rows.some((r) => typeof r[c.key] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(r[c.key]))))?.key;
    if (!dateKey) return null;
    const byDay = new Map<string, number>();
    for (const r of report.rows) {
      const d = String(r[dateKey]).slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    const days = [...byDay.keys()].sort();
    if (days.length < 2) return null;
    return days.slice(-30).map((d) => ({
      dateStr: d,
      displayLabel: new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      count: byDay.get(d) ?? 0
    }));
  }, [report]);

  const orgOptions = [{ value: '', label: 'All organizations in scope' }, ...(snapshot?.organizations ?? []).map((o) => ({ value: o.id, label: o.name }))];
  const classOptions = [
    { value: '', label: 'All vehicle classes' },
    { value: 'PATROL_CAR', label: 'Patrol car' },
    { value: 'MOTORCYCLE', label: 'Motorcycle' },
    { value: 'VAN', label: 'Van' },
    { value: 'HEAVY', label: 'Heavy' }
  ];

  return (
    <div className="page">
      <PageTitle
        title="Reports"
        description="Every figure states what it counts, over which window and within which scope."
        action={
          <div className="cluster ops-no-print">
            <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => setTick((t) => t + 1)}>
              Refresh
            </Button>
            <Button variant="secondary" icon={<Printer size={15} />} onClick={() => window.print()}>
              Print
            </Button>
            {can('export') ? (
              <a className="button button--primary" href={`/api/cloud/exports/${kind}${query ? `?${query}` : ''}`}>
                <Download size={15} aria-hidden="true" />
                <span>Export CSV</span>
              </a>
            ) : null}
          </div>
        }
      />

      <div className="an-dashboard">
        <div className="toolbar ops-no-print" style={{ alignItems: 'flex-end' }}>
          <Select value={kind} onChange={(v) => setKind(v as ReportKind)} options={REPORTS.map((r) => ({ value: r.kind, label: `${r.group}: ${r.label}` }))} ariaLabel="Report" width="260px" />
          <Field label="From">
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Select value={vehicleClass} onChange={setVehicleClass} options={classOptions} ariaLabel="Vehicle class" width="190px" />
          <Select value={organizationId} onChange={setOrganizationId} options={orgOptions} ariaLabel="Organization" width="240px" />
        </div>

        {loading ? <AnalyticsSkeleton /> : null}
        {!loading && error ? <EmptyState label={error} /> : null}

        {!loading && report ? (
          <>
            <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              Scope: {report.scope}. Window: {report.window.from ? new Date(report.window.from).toLocaleDateString('en-IN') : 'start'} to{' '}
              {report.window.to ? new Date(report.window.to).toLocaleDateString('en-IN') : 'now'}. Generated {new Date(report.generatedAt).toLocaleString('en-IN')}.
            </p>

            {report.metrics.length ? (
              <section className="an-kpis" aria-label="Report metrics">
                {report.metrics.map((m) => (
                  <KpiCard
                    key={m.key}
                    label={m.label}
                    value={m.value === null || m.value === undefined ? 'No data' : typeof m.value === 'number' ? `${m.value.toLocaleString('en-IN')}${m.unit ? ` ${m.unit}` : ''}` : m.value}
                    tone="brand"
                    detail={m.definition}
                  />
                ))}
              </section>
            ) : null}

            {chart || trend ? (
              <>
                <SectionHeading title="Breakdown" />
                <div className="an-row an-row--main">
                  {chart ? (
                    <ChartCard title={`By ${chart.textLabel.toLowerCase()}`} subtitle={chart.byNumber ? 'Summed over the rows below' : 'Number of rows'}>
                      <DonutChart data={chart.donut} centerLabel="Rows" />
                    </ChartCard>
                  ) : null}
                  {chart ? (
                    <ChartCard title="Top groups">
                      <RankedList items={chart.ranked} emptyLabel="No groups." />
                    </ChartCard>
                  ) : null}
                  {trend && !chart ? (
                    <ChartCard title="Over time" subtitle="Rows per day">
                      <BarTrend data={trend} unitSingular="row" unitPlural="rows" periodLabel="this report" />
                    </ChartCard>
                  ) : null}
                </div>
              </>
            ) : null}

            <SectionHeading title="Detail" description={`${report.rows.length.toLocaleString('en-IN')} row${report.rows.length === 1 ? '' : 's'}`} />
            <ChartCard title={REPORTS.find((r) => r.kind === kind)?.label ?? 'Report'}>
              {report.rows.length === 0 ? (
                <EmptyState label="No data for this report with the current filters." />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {report.columns.map((c) => (
                          <th key={c.key}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((r, i) => (
                        <tr key={i}>
                          {report.columns.map((c) => (
                            <td key={c.key} className={typeof r[c.key] === 'number' ? 'mono' : undefined}>
                              {renderReportCell(r[c.key], c.key)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {report.truncated ? (
                <p className="cluster text-muted" style={{ marginTop: 10, fontSize: '0.82rem' }}>
                  <Info size={14} aria-hidden="true" /> Showing the first rows only. Narrow the filters or export the CSV (limited by the export row cap in Settings).
                </p>
              ) : null}
            </ChartCard>
          </>
        ) : null}
      </div>
    </div>
  );
}
