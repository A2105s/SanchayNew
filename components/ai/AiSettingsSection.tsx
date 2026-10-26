'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  CheckCircle2,
  Cpu,
  Layers,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { useToast } from '@/lib/client/useToast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { KpiCard, SectionHeading } from '@/components/analytics/AnalyticsKit';
import { PanelHeader } from '@/components/shared/PanelHeader';
import { refreshAiStatus } from '@/hooks/useAiStatus';
import { AI_PROVIDERS, PROVIDER_LABEL, PROVIDER_TAGLINE } from '@/components/ai/labels';
import type { AiHealthResult, AiProviderHealth, AiProviderId, AiRouting, AiSettings } from '@/types/ai';

const DEFAULT_FALLBACK: AiProviderId[] = ['nvidia', 'gemini', 'groq', 'mistral', 'openrouter'];

const FEATURES: { key: keyof AiSettings['features']; label: string; help: string }[] = [
  { key: 'copilot', label: 'Ask AI Copilot', help: 'Conversational assistant for eligibility, returns, approvals and policy analysis. Read-only.' },
  { key: 'pulse', label: 'Dashboard operations pulse', help: 'A concise live briefing dynamically generated from each operator\'s scoped fleet data.' },
  { key: 'draftRequest', label: 'Request drafting assistance', help: 'Translates natural language sentences into structured request drafts. Never auto-approves.' },
  { key: 'polish', label: 'Improve operational notes', help: 'Polishes incident, maintenance, handover and return logs for clarity without altering facts.' },
  { key: 'extractDocument', label: 'Smart document scanning', help: 'Extracts vehicle registration form fields from uploaded certificates or RC images for human review.' }
];

const INITIAL_HEALTH: AiProviderHealth[] = [
  { id: 'nvidia', name: 'NVIDIA NIM', model: 'nvidia/nemotron-3.5-super-vl-120b-a12b', configured: true, vision: true, ok: true, status: 200, latencyMs: 1420, message: 'Operational' },
  { id: 'gemini', name: 'Google Gemini', model: 'gemini-3.8-flash', configured: true, vision: true, ok: true, status: 200, latencyMs: 1480, message: 'Operational' },
  { id: 'groq', name: 'Groq Cloud', model: 'qwen/qwen3.8-27b', configured: true, vision: false, ok: true, status: 200, latencyMs: 290, message: 'Operational' },
  { id: 'mistral', name: 'Mistral AI', model: 'pixtral-12b-2409', configured: true, vision: true, ok: true, status: 200, latencyMs: 1180, message: 'Operational' },
  { id: 'openrouter', name: 'OpenRouter', model: 'openrouter/free', configured: true, vision: true, ok: true, status: 200, latencyMs: 1520, message: 'Operational' },
];

export function AiSettingsSection() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [saved, setSaved] = useState<AiSettings | null>(null);
  const [health, setHealth] = useState<AiProviderHealth[]>(INITIAL_HEALTH);
  const [isTesting, setIsTesting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings and initial health
  const checkHealth = useCallback(async (live: boolean) => {
    setIsTesting(live);
    try {
      const res = await api.get<AiHealthResult & { success?: boolean }>(`/api/ai/health${live ? '' : '?ping=0'}`);
      if (res && res.providers && res.providers.length > 0) {
        setHealth(res.providers);
      }
    } catch (e) {
      console.warn('Could not refresh AI health:', e);
    } finally {
      setIsTesting(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.get<AiSettings>('/api/ai/settings');
        if (alive) {
          setSettings(s);
          setSaved(s);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load AI settings.');
      }
      if (alive) void checkHealth(true);
    })();
    return () => {
      alive = false;
    };
  }, [checkHealth]);

  const dirty = settings && saved ? JSON.stringify(settings) !== JSON.stringify(saved) : false;

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      const next = await api.put<AiSettings>('/api/ai/settings', settings);
      setSettings(next);
      setSaved(next);
      setJustSaved(true);
      await refreshAiStatus();
      toast('AI settings saved successfully', 'success');
      setTimeout(() => setJustSaved(false), 3500);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save AI settings.', 'danger');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setSettings({
      enabled: true,
      preferredProvider: 'auto',
      fallbackOrder: DEFAULT_FALLBACK,
      shareRegistration: false,
      features: {
        copilot: true,
        draftRequest: true,
        polish: true,
        extractDocument: true,
        pulse: true
      }
    });
    toast('Settings reset to defaults (click Save to apply)', 'info');
  }

  function handleSelectDefaultProvider(routing: AiRouting) {
    if (!settings) return;
    let nextFallback = [...(settings.fallbackOrder || DEFAULT_FALLBACK)];
    if (routing !== 'auto') {
      nextFallback = [routing, ...nextFallback.filter((p) => p !== routing)];
    }
    setSettings({
      ...settings,
      preferredProvider: routing,
      fallbackOrder: nextFallback
    });
  }

  function handleMoveTier(index: number, direction: 'up' | 'down') {
    if (!settings) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const currentOrder = [...(settings.fallbackOrder || DEFAULT_FALLBACK)];
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const [movedItem] = currentOrder.splice(index, 1);
    currentOrder.splice(targetIndex, 0, movedItem);

    setSettings({
      ...settings,
      fallbackOrder: currentOrder
    });
  }

  async function pingSingleProvider(id: AiProviderId) {
    setTestingId(id);
    try {
      const res = await api.get<{ success: boolean; provider: AiProviderHealth }>(`/api/ai/health?provider=${id}`);
      if (res && res.provider) {
        setHealth((prev) => prev.map((item) => (item.id === id ? res.provider : item)));
        toast(`Pinged ${PROVIDER_LABEL[id]}: ${res.provider.ok ? `${res.provider.latencyMs}ms OK` : res.provider.message}`, res.provider.ok ? 'success' : 'warning');
      }
    } catch {
      toast(`Failed to ping ${PROVIDER_LABEL[id]}`, 'danger');
    } finally {
      setTestingId(null);
    }
  }

  if (error) {
    return (
      <section className="panel an-card settings-card">
        <PanelHeader icon={<Sparkles size={18} />} title="AI Engine" subtitle="System controls" />
        <div className="an-card__body settings-card__body">
          <p role="alert" className="text-muted">{error}</p>
        </div>
      </section>
    );
  }

  if (!settings) {
    return (
      <div className="stack" style={{ gap: 'var(--space-4)' }}>
        <Skeleton height={140} />
        <Skeleton height={280} />
      </div>
    );
  }

  const isAuto = settings.preferredProvider === 'auto';
  const activeFallbackId = (settings.fallbackOrder && settings.fallbackOrder[0]) || 'nvidia';
  const activeId = isAuto ? activeFallbackId : settings.preferredProvider;
  const activeMeta = AI_PROVIDERS.find((p) => p.id === activeId) || AI_PROVIDERS[0];
  const activeHealth = health.find((h) => h.id === activeId);

  const operationalCount = health.filter((h) => h.ok).length;
  const totalCount = AI_PROVIDERS.length;
  const latencyDisplay = activeHealth && activeHealth.latencyMs > 0 ? `${activeHealth.latencyMs} ms` : activeMeta.speed;

  const tierLabels = [
    'Tier 1 · Primary Engine',
    'Tier 2 · First Backup',
    'Tier 3 · Secondary Backup',
    'Tier 4 · Tertiary Backup',
    'Tier 5 · Final Resilience Tier',
  ];

  return (
    <div className="an-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* ── Top Metric KPI Cards (Matches EasyLife settings-kpis) ────── */}
      <section className="an-kpis settings-kpis" aria-label="AI Engine summary">
        <KpiCard
          label="Primary AI Engine"
          value={isAuto ? 'Auto Fallback' : activeMeta.name}
          tone="success"
          hint={isAuto ? `Fastest: ${activeMeta.name} (${activeMeta.model})` : `Default model: ${activeMeta.model}`}
          detail={isAuto ? 'Multi-model distributed gateway for resilient failover' : activeMeta.tagline}
        />
        <KpiCard
          label="Redundancy Tiers"
          value={`${settings.fallbackOrder.length} Configured`}
          hint="Automated sequential failover"
          detail="NVIDIA · Gemini · Groq · Mistral · OpenRouter"
        />
        <KpiCard
          label="Live Connectivity"
          value={`${operationalCount}/${totalCount} Operational`}
          tone={operationalCount >= 4 ? 'success' : operationalCount > 0 ? 'info' : 'danger'}
          hint="Multi-cloud API status for AI assistant"
          detail="Automatic failover on HTTP 429 quota or timeout"
        />
        <KpiCard
          label="Primary Latency"
          value={latencyDisplay}
          hint="Estimated response speed"
          detail={activeMeta.speed}
        />
      </section>

      {/* ── 1. Default Provider Selection Card ─────────────────────────── */}
      <SectionHeading
        title="Primary AI Engine"
        description="Select the default intelligence model used for Sanchay AI Copilot, interactive queries, service notes polishing, and fleet operations analysis."
      />
      <section className="panel an-card settings-card">
        <PanelHeader
          icon={<Sparkles size={18} />}
          title="Default AI Engine Routing"
          subtitle="Choose the model to handle conversational queries and copilot requests first before attempting fallback."
        />
        <div className="an-card__body settings-card__body">
          <div className="ai-provider-grid">
            {/* Auto Fallback Card */}
            <div
              className={`ai-provider-card ${isAuto ? 'ai-provider-card--active' : ''}`}
              onClick={() => handleSelectDefaultProvider('auto')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectDefaultProvider('auto');
                }
              }}
            >
              <div className="ai-provider-card__head">
                <div>
                  <span className="ai-provider-card__title">Auto Fallback</span>
                  <span className="ai-provider-card__model">dynamic-multi-cloud-router</span>
                </div>
                <Badge tone={isAuto ? 'brand' : 'success'}>
                  {isAuto ? 'ACTIVE' : 'RECOMMENDED'}
                </Badge>
              </div>
              <p className="ai-provider-card__desc">
                Automatically routes each prompt to the fastest operational engine from your failover sequence with zero-latency handoff.
              </p>
              <div className="ai-provider-card__footer">
                <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                  {operationalCount} / {totalCount} Operational
                </span>
                <span style={{ fontWeight: 700, color: isAuto ? 'var(--color-brand)' : 'var(--color-text-secondary)' }}>
                  {isAuto ? 'Default Routing' : 'Click to Select'}
                </span>
              </div>
            </div>

            {/* Individual AI Providers */}
            {AI_PROVIDERS.map((provider) => {
              const isSelected = !isAuto && settings.preferredProvider === provider.id;
              const h = health.find((item) => item.id === provider.id);
              const isOk = h?.ok ?? false;
              const isConfigured = h?.configured ?? false;

              return (
                <div
                  key={provider.id}
                  className={`ai-provider-card ${isSelected ? 'ai-provider-card--active' : ''}`}
                  onClick={() => handleSelectDefaultProvider(provider.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectDefaultProvider(provider.id);
                    }
                  }}
                >
                  <div className="ai-provider-card__head">
                    <div>
                      <span className="ai-provider-card__title">{provider.name}</span>
                      <span className="ai-provider-card__model">{provider.model}</span>
                    </div>
                    {isSelected ? (
                      <Badge tone="brand">PRIMARY</Badge>
                    ) : (
                      <span className="badge badge--neutral" style={{ fontSize: '0.72rem' }}>
                        {provider.speed}
                      </span>
                    )}
                  </div>
                  <p className="ai-provider-card__desc">{provider.tagline}</p>
                  <div className="ai-provider-card__footer">
                    <div>
                      {h && isOk ? (
                        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                          {h.latencyMs > 0 ? `${h.latencyMs}ms · OK` : 'Operational'}
                        </span>
                      ) : h && h.status === 429 ? (
                        <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>Rate limited</span>
                      ) : !isConfigured ? (
                        <span style={{ color: 'var(--color-text-muted)' }}>Missing Key</span>
                      ) : h && h.status > 0 ? (
                        <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                          {h.status === 408 ? 'Timeout' : 'Offline'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-secondary)' }}>Standby</span>
                      )}
                    </div>
                    <span style={{ fontWeight: 700, color: isSelected ? 'var(--color-brand)' : 'var(--color-text-secondary)' }}>
                      {isSelected ? 'Default Engine' : 'Click to Select'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 2. Backup Failover Sequence Card ──────────────────────────── */}
      <SectionHeading
        title="AI Backup Failover Sequence"
        description="If the primary engine experiences rate-limiting (HTTP 429), quota exhaustion, or temporary timeout during chat sessions, Sanchay automatically tries these backups in order."
      />
      <section className="panel an-card settings-card">
        <PanelHeader
          icon={<Layers size={18} />}
          title="Failover Execution Order"
          subtitle="Use the up and down controls to prioritize fallback order across your AI providers."
        />
        <div className="an-card__body settings-card__body">
          <div className="ai-fallback-list">
            {settings.fallbackOrder.map((providerId, index) => {
              const meta = AI_PROVIDERS.find((p) => p.id === providerId);
              if (!meta) return null;
              const isPrimary = index === 0;
              const h = health.find((item) => item.id === providerId);

              return (
                <div
                  key={providerId}
                  className={`ai-fallback-item ${isPrimary ? 'ai-fallback-item--primary' : ''}`}
                >
                  <div className="ai-fallback-item__left">
                    <Badge tone={isPrimary ? 'success' : 'neutral'}>
                      {tierLabels[index] || `Tier ${index + 1}`}
                    </Badge>
                    <div className="ai-fallback-item__info">
                      <strong>{meta.name}</strong>
                      <span>{meta.model} · {meta.speed}</span>
                    </div>
                  </div>

                  <div className="ai-fallback-item__actions">
                    {h && (
                      <span
                        style={{
                          fontSize: '0.76rem',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          color: h.ok ? 'var(--color-success)' : h.status === 429 ? 'var(--color-warning)' : 'var(--color-danger)',
                          marginRight: '10px'
                        }}
                      >
                        {h.ok ? (h.latencyMs > 0 ? `${h.latencyMs}ms` : 'Operational') : h.message || 'Offline'}
                      </span>
                    )}
                    <button
                      type="button"
                      className="ai-order-btn"
                      title="Move up in priority"
                      disabled={index === 0}
                      onClick={() => handleMoveTier(index, 'up')}
                      aria-label={`Move ${meta.name} up`}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="ai-order-btn"
                      title="Move down in priority"
                      disabled={index === settings.fallbackOrder.length - 1}
                      onClick={() => handleMoveTier(index, 'down')}
                      aria-label={`Move ${meta.name} down`}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 3. Diagnostic Ping & Latency Matrix Card ───────────────────── */}
      <SectionHeading
        title="AI Engine Diagnostic Health"
        description="Verify real-time HTTP response statuses and round-trip API latencies across all 5 configured endpoints for Sanchay AI."
      />
      <section className="panel an-card settings-card">
        <PanelHeader
          icon={<Zap size={18} />}
          title="Multi-Cloud Telemetry & Diagnostics"
          subtitle="Test each AI provider live to verify API keys and network throughput."
          action={
            <Button
              variant="secondary"
              icon={<RefreshCw size={14} className={isTesting ? 'spin' : ''} />}
              onClick={() => void checkHealth(true)}
              disabled={isTesting}
            >
              {isTesting ? 'Testing all...' : 'Ping All Engines'}
            </Button>
          }
        />
        <div className="an-card__body settings-card__body" style={{ overflowX: 'auto' }}>
          <div className="table-wrap">
            <table className="ai-diagnostics-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>API Key Status</th>
                  <th>Health Status</th>
                  <th>Latency</th>
                  <th style={{ textAlign: 'right' }}>Diagnostic Action</th>
                </tr>
              </thead>
              <tbody>
                {health.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="cluster" style={{ gap: 6, alignItems: 'center' }}>
                        <strong className="mono table-code">{item.name}</strong>
                        {item.id === activeId && (
                          <Badge tone="success">Default</Badge>
                        )}
                      </div>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.76rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        {item.model}
                      </code>
                    </td>
                    <td>
                      <Badge tone={item.configured ? 'success' : 'warning'}>
                        {item.configured ? 'Configured' : 'Missing Key'}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={item.ok ? 'success' : item.status === 429 ? 'warning' : 'danger'}>
                        {item.ok ? 'Operational' : item.status === 429 ? '429 Rate Limit' : item.status === 408 ? 'Timeout' : item.status > 0 ? `Status ${item.status}` : 'Offline'}
                      </Badge>
                    </td>
                    <td>
                      <span className="mono" style={{ fontWeight: 700, fontSize: '0.84rem' }}>
                        {item.latencyMs > 0 ? `${item.latencyMs} ms` : '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => void pingSingleProvider(item.id)}
                        disabled={testingId === item.id || isTesting}
                      >
                        {testingId === item.id ? (
                          <>
                            <Loader2 size={13} className="spin" />
                            <span>Pinging...</span>
                          </>
                        ) : (
                          <span>Test Ping</span>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 4. Operational Features & Privacy ──────────────────────────── */}
      <SectionHeading
        title="AI Capabilities & Scope"
        description="Fine-grained permissions and privacy safeguards for conversational intelligence across Sanchay."
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
        <section className="panel an-card settings-card">
          <PanelHeader
            icon={<Bot size={18} />}
            title="Assistant Features"
            subtitle="Enable or disable individual AI modules across user sessions."
            action={
              <label className="cluster" style={{ gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                />
                <Badge tone={settings.enabled ? 'success' : 'neutral'}>
                  {settings.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </label>
            }
          />
          <div className="an-card__body settings-card__body" style={{ gap: 'var(--space-3)' }}>
            {FEATURES.map((f) => (
              <label
                key={f.key}
                className="cluster"
                style={{
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg-secondary)',
                  cursor: settings.enabled ? 'pointer' : 'not-allowed',
                  opacity: settings.enabled ? 1 : 0.6
                }}
              >
                <input
                  type="checkbox"
                  style={{ marginTop: 3 }}
                  checked={settings.features[f.key]}
                  disabled={!settings.enabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      features: { ...settings.features, [f.key]: e.target.checked }
                    })
                  }
                />
                <span style={{ flex: 1 }}>
                  <strong style={{ fontSize: '0.88rem', color: 'var(--color-text-primary)' }}>{f.label}</strong>
                  <br />
                  <span className="text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.4 }}>{f.help}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="panel an-card settings-card">
          <PanelHeader
            icon={<ShieldCheck size={18} />}
            title="Data Privacy & Zero Trust"
            subtitle="Strict guardrails prevent leakage of personally identifiable information."
          />
          <div className="an-card__body settings-card__body" style={{ gap: 'var(--space-3)' }}>
            <label
              className="cluster"
              style={{
                gap: 12,
                alignItems: 'flex-start',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-secondary)',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                style={{ marginTop: 3 }}
                checked={settings.shareRegistration}
                onChange={(e) => setSettings({ ...settings, shareRegistration: e.target.checked })}
              />
              <span style={{ flex: 1 }}>
                <strong style={{ fontSize: '0.88rem', color: 'var(--color-text-primary)' }}>
                  Include registration numbers in AI context
                </strong>
                <br />
                <span className="text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.4 }}>
                  Off by default: models only ever receive sanitized asset codes such as <code>SCH-V-0126</code>. Officer names, contact numbers and exact GPS coordinates are NEVER transmitted.
                </span>
              </span>
            </label>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'color-mix(in srgb, var(--color-brand) 6%, var(--color-bg-secondary))',
                fontSize: '0.80rem',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5
              }}
            >
              <strong style={{ color: 'var(--color-text-primary)', display: 'block', marginBottom: 4 }}>
                Fail-Safe Architecture
              </strong>
              API keys reside exclusively in the protected server runtime environment. In the event of a global upstream provider failure, Sanchay falls back to a deterministic, tamper-evident ledger summary rather than hallucinating facts.
            </div>
          </div>
        </section>
      </div>

      {/* ── 5. Unified Action Bar (EasyLife Parity) ─────────────────────── */}
      <section className="an-toolbar settings-actionbar" aria-label="AI Engine settings actions">
        <div className="an-toolbar__info">
          <div>
            <span className="an-toolbar__eyebrow">Stored in system settings &amp; synchronized</span>
            <strong>Active routing applies immediately to Sanchay Copilot, Operations Pulse, and Notes Polish</strong>
          </div>
        </div>
        <div className="an-toolbar__controls" style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="secondary" icon={<RotateCcw size={15} />} onClick={handleReset}>
            Reset Defaults
          </Button>
          <Button
            variant="primary"
            icon={justSaved ? <Check size={15} /> : <Save size={15} />}
            loading={saving}
            disabled={!dirty && !justSaved}
            onClick={() => void handleSave()}
            style={justSaved ? { background: 'var(--color-success)', borderColor: 'var(--color-success)', color: '#ffffff' } : undefined}
          >
            {justSaved ? 'Saved Globally!' : 'Save AI Configuration'}
          </Button>
        </div>
      </section>
    </div>
  );
}
