'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Info, RefreshCw } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useFleet } from '@/lib/client/useFleet';
import { formatCell } from '@/components/ops/shared';
import { PageTitle } from '@/components/ui/PageTitle';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { AnalyticsSkeleton, ChartCard, EmptyState, KpiCard, SectionHeading } from '@/components/analytics/AnalyticsKit';
import type { ReportKind, ReportResult } from '@/types';

/** Spec file 18 operational views. Each is backed by a report with a stated definition, window and scope. */
const VIEWS: { kind: ReportKind; label: string; help: string }[] = [
  { kind: 'fleet-composition', label: 'Fleet composition', help: 'How the fleet in your scope splits by class, ownership and eligibility.' },
  { kind: 'maintenance', label: 'In maintenance', help: 'Vehicles with open maintenance or a maintenance window.' },
  { kind: 'restricted-unverified', label: 'Restricted and unverified', help: 'Vehicles that cannot be allocated, with the reason.' },
  { kind: 'compliance-due', label: 'Compliance due', help: 'Documents expired or expiring within the warning window.' },
  { kind: 'active-allocations', label: 'Active allocations', help: 'Vehicles currently handed over and in use.' },
  { kind: 'overdue-returns', label: 'Overdue returns', help: 'Active allocations past their end time plus the grace period.' },
  { kind: 'pending-approvals', label: 'Pending approvals', help: 'Requests waiting for a decision.' },
  { kind: 'stale-telemetry', label: 'Stale telemetry', help: 'Vehicles whose last location is older than the freshness window. Stale does not mean inactive.' }
];

export default function OperationsPage() {
  const { can } = useFleet();
  const [kind, setKind] = useState<ReportKind>('overdue-returns');
  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (k: ReportKind) => {
    setLoading(true);
    setError(null);
    try {
      setReport(await api.get<ReportResult>(`/api/cloud/reports/${k}`));
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : 'Could not load this view.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(kind);
  }, [kind, load]);

  const current = VIEWS.find((v) => v.kind === kind);

  return (
    <div className="page">
      <PageTitle
        title="Operations"
        description="Live operational views for your organization. Each figure states what it counts and for whom."
        action={
          <div className="cluster ops-no-print">
            <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => void load(kind)}>
              Refresh
            </Button>
            {can('export') ? (
              <a className="button button--primary" href={`/api/cloud/exports/${kind}`}>
                <Download size={15} aria-hidden="true" />
                <span>Export CSV</span>
              </a>
            ) : null}
          </div>
        }
      />
      <Tabs tabs={VIEWS.map((v) => ({ id: v.kind, label: v.label }))} active={kind} onChange={(id) => setKind(id as ReportKind)} />
      <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>{current?.help}</p>

      <div className="an-dashboard">
        {loading ? <AnalyticsSkeleton /> : null}
        {!loading && error ? <EmptyState label={error} /> : null}
        {!loading && report ? (
          <>
            <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
              Scope: {report.scope}. Generated {new Date(report.generatedAt).toLocaleString('en-IN')}.
            </p>
            {report.metrics.length ? (
              <section className="an-kpis" aria-label="Metrics">
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
            <SectionHeading title="Detail" description={`${report.rows.length.toLocaleString('en-IN')} row${report.rows.length === 1 ? '' : 's'}`} />
            <ChartCard title={current?.label ?? 'Operational view'}>
              {report.rows.length === 0 ? (
                <EmptyState label="Nothing to show for this view right now." />
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
                              {formatCell(r[c.key])}
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
                  <Info size={14} aria-hidden="true" /> Showing the first rows only. Export the CSV for the full list (capped by the export row limit in Settings).
                </p>
              ) : null}
            </ChartCard>
          </>
        ) : null}
      </div>
    </div>
  );
}
