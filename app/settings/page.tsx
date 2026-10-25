'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Info, Moon, Palette, ShieldCheck, Sliders, Sun, User } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { can as clientCan, type Permission } from '@/lib/client/permissions';
import { getActiveTheme, setTheme, subscribeTheme, type ThemeMode } from '@/lib/theme/theme';
import { OperatorsPanel, DataCloudPanel } from '@/components/ops/SettingsParts';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Tabs } from '@/components/ui/Tabs';
import { AiSettingsSection } from '@/components/ai/AiSettingsSection';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { KvRow } from '@/components/ops/primitives';
import type { FleetSettings, Role } from '@/types';

const ALL_PERMISSIONS: Permission[] = [
  'fleet.read', 'vehicle.register', 'vehicle.edit', 'eligibility.verify', 'restriction.manage', 'maintenance.write',
  'trip.write', 'incident.write', 'request.create', 'request.review', 'handover.record', 'return.record',
  'return.inspect', 'extension.decide', 'transfer.create', 'transfer.review', 'device.manage', 'document.read',
  'document.write', 'audit.read', 'report.read', 'export', 'settings.manage', 'operators.manage',
];

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Platform administrator',
  ORG_ADMIN: 'Organization administrator',
  DEPT_OFFICER: 'Department officer (approver)',
  STATION_OFFICER: 'Station officer',
  FIELD_STAFF: 'Field staff',
  AUDITOR: 'Auditor',
};

type TabId = 'profile' | 'appearance' | 'policy' | 'ai' | 'operators' | 'data' | 'about';

export default function SettingsPage() {
  const { snapshot, loading, error, refresh, can, me } = useFleet();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>('profile');

  const canSettings = can('settings.manage');
  const canOperators = can('operators.manage');
  const isAdmin = me?.role === 'ADMIN';

  if (loading && !snapshot) {
    return (
      <div className="page stack">
        <PageTitle title="Settings" />
        <Skeleton height={320} />
      </div>
    );
  }
  if (error && !snapshot) {
    return (
      <div className="page">
        <EmptyState title="Could not load settings" description={error} action={<Button onClick={() => refresh()}>Retry</Button>} />
      </div>
    );
  }
  if (!snapshot || !me) return null;

  const tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'appearance', label: 'Appearance' },
    ...(canSettings ? [{ id: 'policy', label: 'Fleet policy' }, { id: 'ai', label: 'AI' }] : []),
    ...(canOperators ? [{ id: 'operators', label: 'Operators' }] : []),
    { id: 'data', label: 'Data & cloud' },
    { id: 'about', label: 'About' },
  ];

  return (
    <div className="page stack">
      <PageTitle eyebrow="Account" title="Settings" description="Your profile, appearance, fleet policy and system controls." />
      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as TabId)} />

      {tab === 'profile' && <ProfileTab me={me} />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'policy' && canSettings && <PolicyTab settings={snapshot.settings} toast={toast} onSaved={refresh} />}
      {tab === 'ai' && canSettings && <AiSettingsSection />}
      {tab === 'operators' && canOperators && <OperatorsPanel stations={snapshot.stations} toast={toast} />}
      {tab === 'data' && <DataCloudPanel isAdmin={isAdmin} toast={toast} />}
      {tab === 'about' && <AboutTab />}
    </div>
  );
}

function ProfileTab({ me }: { me: { username: string; displayName: string; role: Role; stationId: string | null } }) {
  const perms = ALL_PERMISSIONS.filter((p) => clientCan(me.role, p));
  return (
    <Panel title="Profile" subtitle="Your account and permissions" icon={<User size={17} />}>
      <div className="stack">
        <div className="stack" style={{ gap: 4 }}>
          <KvRow k="Name" v={me.displayName} />
          <KvRow k="Username" v={<span className="mono">{me.username}</span>} />
          <KvRow k="Role" v={<Badge tone="brand">{ROLE_LABEL[me.role]}</Badge>} />
        </div>
        <div>
          <h4 style={{ margin: '0 0 8px' }}>Permissions</h4>
          <div className="cluster" style={{ flexWrap: 'wrap', gap: 6 }}>
            {perms.map((p) => (
              <span className="chip" key={p}><ShieldCheck size={12} /> {p}</span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function AppearanceTab() {
  const theme = useSyncExternalStore(
    (cb) => subscribeTheme(cb),
    () => getActiveTheme(),
    () => 'light' as ThemeMode
  );
  return (
    <Panel title="Appearance" subtitle="Light or dark theme" icon={<Palette size={17} />}>
      <div className="cluster" style={{ gap: 10 }}>
        <Button variant={theme === 'light' ? 'primary' : 'secondary'} icon={<Sun size={15} />} onClick={() => setTheme('light')}>Light</Button>
        <Button variant={theme === 'dark' ? 'primary' : 'secondary'} icon={<Moon size={15} />} onClick={() => setTheme('dark')}>Dark</Button>
      </div>
      <p className="text-muted" style={{ fontSize: '0.82rem', marginTop: 10 }}>
        Your choice is stored on this device. Before you choose, Sanchay follows your operating system preference.
      </p>
    </Panel>
  );
}

function PolicyTab({ settings, toast, onSaved }: { settings: FleetSettings; toast: (m: string, v?: 'success' | 'warning' | 'danger' | 'info') => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<FleetSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  function set<K extends keyof FleetSettings>(key: K, value: FleetSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await api.put('/api/cloud/settings', form);
      toast('Fleet policy saved', 'success');
      await onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save settings', 'danger');
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  return (
    <Panel title="Fleet policy" subtitle="Thresholds used across the platform" icon={<Sliders size={17} />}>
      <div className="stack">
        <div className="grid-2">
          <Field label="Idle threshold (hours)" hint="Flag a vehicle for reuse after this many idle hours">
            <input className="input" type="number" min={1} max={8760} value={form.idleThresholdHours} onChange={(e) => set('idleThresholdHours', Number(e.target.value))} />
          </Field>
          <Field label="Compliance warning (days)" hint="Warn when a document expires within N days">
            <input className="input" type="number" min={1} max={365} value={form.complianceWarnDays} onChange={(e) => set('complianceWarnDays', Number(e.target.value))} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Compliance critical (days)" hint="Escalate when within N days or expired">
            <input className="input" type="number" min={0} max={365} value={form.complianceCriticalDays} onChange={(e) => set('complianceCriticalDays', Number(e.target.value))} />
          </Field>
          <Field label="Telemetry fresh window (minutes)" hint="An event newer than this counts as fresh. Older data is shown as stale - it never changes eligibility or availability">
            <input className="input" type="number" min={1} max={1440} value={form.telemetryFreshMinutes} onChange={(e) => set('telemetryFreshMinutes', Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Telemetry offline (minutes)" hint="Device marked offline after N minutes of silence">
          <input className="input" type="number" min={1} max={10080} value={form.telemetryOfflineMinutes} onChange={(e) => set('telemetryOfflineMinutes', Number(e.target.value))} />
        </Field>
        <div className="grid-2">
          <Field label="Request expiry (hours)" hint="Unreviewed submitted requests expire after this">
            <input className="input" type="number" min={1} max={720} value={form.requestExpiryHours} onChange={(e) => set('requestExpiryHours', Number(e.target.value))} />
          </Field>
          <Field label="Return grace (minutes)" hint="Allowed after the end time before a return counts as overdue">
            <input className="input" type="number" min={0} max={1440} value={form.returnGraceMinutes} onChange={(e) => set('returnGraceMinutes', Number(e.target.value))} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Booking horizon (days)" hint="How far ahead a request may start">
            <input className="input" type="number" min={1} max={730} value={form.maxBookingHorizonDays} onChange={(e) => set('maxBookingHorizonDays', Number(e.target.value))} />
          </Field>
          <Field label="Export row limit" hint="Hard cap for every CSV export">
            <input className="input" type="number" min={100} max={100000} value={form.exportRowLimit} onChange={(e) => set('exportRowLimit', Number(e.target.value))} />
          </Field>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <label className="cluster" style={{ gap: 8 }}>
            <input type="checkbox" checked={form.requireInspectionOnReturn} onChange={(e) => set('requireInspectionOnReturn', e.target.checked)} />
            <span>Require an inspection before a returned allocation is closed</span>
          </label>
          <label className="cluster" style={{ gap: 8 }}>
            <input type="checkbox" checked={form.allowSelfApproval} onChange={(e) => set('allowSelfApproval', e.target.checked)} />
            <span>Allow a requester to approve their own request (disables separation of duties - not recommended)</span>
          </label>
          <small className="text-muted">Eligibility policy version: <span className="mono">{form.eligibilityPolicyVersion}</span> (set by the platform)</small>
        </div>
        <div className="cluster">
          <Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>Save policy</Button>
          {dirty && <Button variant="ghost" onClick={() => setForm(settings)}>Discard</Button>}
        </div>
      </div>
    </Panel>
  );
}

function AboutTab() {
  return (
    <Panel title="About Sanchay" subtitle="Unified public fleet intelligence" icon={<Info size={17} />}>
      <div className="stack" style={{ gap: 6 }}>
        <KvRow k="Platform" v="Sanchay — government fleet operations" />
        <KvRow k="Phase" v="Phase 1 — Fleet. Civic spaces coming next." />
        <KvRow k="Data residency" v="Supabase Postgres (server-only access, RLS enforced)" />
        <KvRow k="Audit" v="Hash-chained, tamper-evident ledger" />
        <p className="text-muted" style={{ fontSize: '0.82rem', marginTop: 8 }}>
          Sanchay unifies GPS tracking, compliance, maintenance, requisitions, inter-station transfers and idle-asset reuse for municipal and
          departmental fleets.
        </p>
      </div>
    </Panel>
  );
}
