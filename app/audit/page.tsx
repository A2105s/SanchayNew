'use client';

import { useEffect, useMemo, useState, Fragment } from 'react';
import { ChevronDown, ChevronRight, Download, ShieldCheck, ShieldAlert, History, ScrollText, Terminal } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { api } from '@/lib/client/api';
import { fmtDateTime } from '@/lib/fleet/format';
import { CopyButton, KvRow } from '@/components/ops/primitives';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { SearchField } from '@/components/ui/SearchField';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { AuditEntryView } from '@/types';

interface BackendEventRow {
  id: string;
  level: string;
  category: string;
  action: string;
  status: string;
  message: string;
  createdAt: string;
}
interface VerifyInfo {
  ok: boolean;
  checked: number;
  brokenAtSeq: number | null;
}
interface ActivityResponse {
  audit: AuditEntryView[];
  events: BackendEventRow[];
  verify: VerifyInfo;
}

function shortHash(h: string | null): string {
  if (!h) return '—';
  return h.length > 16 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
}

export default function AuditPage() {
  const { can } = useFleet();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'LEDGER' | 'SYSTEM'>('LEDGER');
  const [entity, setEntity] = useState('ALL');
  const [action, setAction] = useState('ALL');
  const [actor, setActor] = useState('ALL');
  const [date, setDate] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const canRead = can('audit.read');
  const canExport = can('export');

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<ActivityResponse>('/api/cloud/activity?limit=500')
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setErr(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load the ledger');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canRead]);

  const audit = data?.audit ?? [];
  const entities = useMemo(() => Array.from(new Set(audit.map((a) => a.entityType))).sort(), [audit]);
  const actions = useMemo(() => Array.from(new Set(audit.map((a) => a.action))).sort(), [audit]);
  const actors = useMemo(() => Array.from(new Set(audit.map((a) => a.performedBy))).sort(), [audit]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return audit.filter((a) => {
      if (entity !== 'ALL' && a.entityType !== entity) return false;
      if (action !== 'ALL' && a.action !== action) return false;
      if (actor !== 'ALL' && a.performedBy !== actor) return false;
      if (date && !a.performedAt.startsWith(date)) return false;
      if (q) {
        const hay = [a.entityType, a.entityId, a.action, a.performedBy, a.fieldName, a.oldValue, a.newValue, a.reason]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [audit, entity, action, actor, date, query]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  if (!canRead) {
    return (
      <div className="page">
        <EmptyState icon={<ShieldAlert size={28} />} title="Audit access required" description="Your role does not have the audit.read permission." />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="page stack">
        <PageTitle title="Audit ledger" />
        <Skeleton height={320} />
      </div>
    );
  }
  if (err && !data) {
    return (
      <div className="page">
        <EmptyState title="Could not load the ledger" description={err} action={<Button onClick={() => location.reload()}>Retry</Button>} />
      </div>
    );
  }

  const verify = data?.verify;

  return (
    <div className="page stack">
      <PageTitle
        eyebrow="Governance"
        title="Audit ledger"
        description="Hash-chained, tamper-evident record of every mutation."
        action={
          canExport ? (
            <Button variant="secondary" icon={<Download size={15} />} onClick={() => window.open('/api/cloud/exports/audit', '_blank')}>
              Export CSV
            </Button>
          ) : undefined
        }
      />

      {verify && (
        <div className="cluster" style={{ gap: 8 }}>
          {verify.ok ? (
            <Badge tone="success"><ShieldCheck size={13} /> Chain verified</Badge>
          ) : (
            <Badge tone="danger"><ShieldAlert size={13} /> Chain broken at seq {verify.brokenAtSeq ?? '?'}</Badge>
          )}
          <span className="text-muted" style={{ fontSize: '0.82rem' }}>{verify.checked} entries checked</span>
        </div>
      )}

      <Tabs
        tabs={[
          { id: 'LEDGER', label: 'Ledger', count: audit.length, icon: <ScrollText size={15} /> },
          { id: 'SYSTEM', label: 'System events', count: data?.events.length ?? 0, icon: <Terminal size={15} /> },
        ]}
        active={tab}
        onChange={(id) => setTab(id as 'LEDGER' | 'SYSTEM')}
        layoutId="auditActiveTab"
        toolbar
        toolbarEyebrow="Audit record"
      />

      {tab === 'LEDGER' ? (
        <>
          <div className="toolbar cluster" style={{ gap: 10, flexWrap: 'wrap' }}>
            <SearchField
              value={query}
              onChange={setQuery}
              ariaLabel="Search ledger"
              placeholder="Search entries…"
              placeholders={[
                'Search ledger entries…',
                'Search by actor or username…',
                'Search action (e.g. "VEHICLE_DISPATCH")…',
                'Search by entity ID or hash…'
              ]}
            />
            <Select ariaLabel="Entity" width="150px" value={entity} onChange={setEntity} options={[{ value: 'ALL', label: 'All entities' }, ...entities.map((e) => ({ value: e, label: e }))]} />
            <Select ariaLabel="Action" width="160px" value={action} onChange={setAction} options={[{ value: 'ALL', label: 'All actions' }, ...actions.map((a) => ({ value: a, label: a }))]} />
            <Select ariaLabel="Actor" width="150px" value={actor} onChange={setActor} options={[{ value: 'ALL', label: 'All actors' }, ...actors.map((a) => ({ value: a, label: a }))]} />
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date filter" style={{ width: 160 }} />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={<History size={28} />} title="No matching entries" description="Adjust the filters to see ledger entries." />
          ) : (
            <Panel>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }} aria-label="Expand" />
                      <th>Seq</th>
                      <th>When</th>
                      <th>Entity</th>
                      <th>Action</th>
                      <th>Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => {
                      const open = expanded.has(a.id);
                      return (
                        <Fragment key={a.id}>
                          <tr style={{ cursor: 'pointer' }} onClick={() => toggle(a.id)}>
                            <td>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                            <td className="mono">{a.seq}</td>
                            <td style={{ fontSize: '0.82rem' }}>{fmtDateTime(a.performedAt)}</td>
                            <td>
                              <div style={{ fontWeight: 540 }}>{a.entityType}</div>
                              <div className="text-muted mono" style={{ fontSize: '0.72rem' }}>{a.entityId.slice(0, 12)}</div>
                            </td>
                            <td><Badge tone="info">{a.action}</Badge></td>
                            <td style={{ fontSize: '0.82rem' }}>
                              {a.performedBy}
                              {a.performedByRole && <div className="text-muted" style={{ fontSize: '0.72rem' }}>{a.performedByRole}</div>}
                            </td>
                          </tr>
                          {open && (
                            <tr key={`${a.id}-x`}>
                              <td colSpan={6}>
                                <div className="ops-audit-expand">
                                  {a.fieldName && <KvRow k="Field" v={a.fieldName} />}
                                  {a.oldValue != null && <KvRow k="Old value" v={<span className="mono">{a.oldValue}</span>} />}
                                  {a.newValue != null && <KvRow k="New value" v={<span className="mono">{a.newValue}</span>} />}
                                  {a.reason && <KvRow k="Reason" v={a.reason} />}
                                  <div className="ops-hashline">
                                    <span className="text-muted">hash</span>
                                    <span className="ops-hash">{shortHash(a.hash)}</span>
                                    {a.hash && <CopyButton text={a.hash} label="Copy" />}
                                  </div>
                                  <div className="ops-hashline">
                                    <span className="text-muted">prev</span>
                                    <span className="ops-hash">{shortHash(a.prevHash)}</span>
                                    {a.prevHash && <CopyButton text={a.prevHash} label="Copy" />}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      ) : (
        <Panel title="System events" subtitle="Backend operations and sync jobs">
          {(data?.events.length ?? 0) === 0 ? (
            <EmptyState title="No system events" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Category</th>
                    <th>Action</th>
                    <th>Status</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.events.map((ev) => (
                    <tr key={ev.id}>
                      <td style={{ fontSize: '0.82rem' }}>{fmtDateTime(ev.createdAt)}</td>
                      <td className="mono" style={{ fontSize: '0.8rem' }}>{ev.category}</td>
                      <td>{ev.action}</td>
                      <td>
                        <Badge tone={ev.status === 'succeeded' ? 'success' : ev.status === 'failed' ? 'danger' : ev.level === 'error' ? 'danger' : 'neutral'}>
                          {ev.status}
                        </Badge>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{ev.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
