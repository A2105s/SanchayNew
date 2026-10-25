'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, Cpu, Loader2, RefreshCw, Save } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useToast } from '@/lib/client/useToast';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import { refreshAiStatus } from '@/hooks/useAiStatus';
import { PROVIDER_LABEL, PROVIDER_TAGLINE } from '@/components/ai/labels';
import type { AiHealthResult, AiProviderHealth, AiProviderId, AiRouting, AiSettings } from '@/types/ai';

const ORDER: AiProviderId[] = ['nvidia', 'gemini', 'openrouter', 'groq', 'mistral'];

const FEATURES: { key: keyof AiSettings['features']; label: string; help: string }[] = [
  { key: 'copilot', label: 'Ask AI assistant', help: 'Chat about eligibility, returns, approvals and compliance. Read-only.' },
  { key: 'pulse', label: 'Dashboard operations pulse', help: 'A short briefing built from each user\'s own scoped data.' },
  { key: 'draftRequest', label: 'Request drafting', help: 'Turns a sentence into a request draft. Never submits or approves.' },
  { key: 'polish', label: 'Improve my wording', help: 'Rewrites incident, maintenance, handover and return notes without adding facts.' },
  { key: 'extractDocument', label: 'Document scanning', help: 'Suggests registration form values from a photo of an RC or certificate. A person reviews before saving.' }
];

function Engines({ preferred, onPick, health, testing, onTest, pinging }: {
  preferred: AiRouting;
  onPick: (v: AiRouting) => void;
  health: AiProviderHealth[];
  testing: boolean;
  onTest: () => void;
  pinging: string | null;
}) {
  const [open, setOpen] = useState(false);
  const current = preferred === 'auto' ? 'Auto fallback (fastest first)' : PROVIDER_LABEL[preferred];
  const byId = new Map(health.map((h) => [h.id, h]));
  return (
    <div className="ocr-engine-bar">
      <div className="ocr-engine-bar__top">
        <div className="ocr-engine-bar__title">
          <Cpu size={16} />
          <span>AI engine routing</span>
        </div>
        <div className="ocr-engine-bar__actions">
          <div className={`ocr-routing-control ${open ? 'is-open' : ''}`}>
            <span className="ocr-routing-label">Mode</span>
            <button type="button" className="ocr-routing-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label="AI routing mode" onClick={() => setOpen((v) => !v)}>
              <span className="ocr-routing-trigger__label ocr-routing-trigger__label--full">{current}</span>
              <span className="ocr-routing-trigger__label ocr-routing-trigger__label--short">{current}</span>
              <ChevronDown size={13} className={`ocr-routing-trigger__chevron ${open ? 'is-open' : ''}`} aria-hidden="true" />
            </button>
            {open ? (
              <div className="ocr-routing-dropdown" role="listbox" aria-label="Routing modes">
                {(['auto', ...ORDER] as AiRouting[]).map((id) => (
                  <button key={id} type="button" role="option" aria-selected={preferred === id} className={`ocr-routing-option ${preferred === id ? 'is-selected' : ''}`} onClick={() => { onPick(id); setOpen(false); }}>
                    <div className="ocr-routing-option__main">
                      <div className="ocr-routing-option__title-row">
                        <span className="ocr-routing-option__name">{id === 'auto' ? 'Auto fallback' : PROVIDER_LABEL[id as AiProviderId]}</span>
                      </div>
                      <span className="ocr-routing-option__desc">{id === 'auto' ? 'Try engines in order and fall back automatically' : PROVIDER_TAGLINE[id as AiProviderId]}</span>
                    </div>
                    {preferred === id ? <Check size={14} className="ocr-routing-option__check" aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <Button variant="secondary" className="ocr-engine-bar__check-btn" icon={testing ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} disabled={testing} onClick={onTest}>
            <span className="ocr-check-btn-text--full">{testing ? 'Checking...' : 'Check status'}</span>
            <span className="ocr-check-btn-text--short">{testing ? 'Checking...' : 'Check'}</span>
          </Button>
        </div>
      </div>
      <div className="ocr-engine-bar__providers">
        {ORDER.map((id) => {
          const p = byId.get(id);
          const configured = p?.configured ?? false;
          const dot = !configured || !p || p.status === 0 ? '' : p.ok ? 'ocr-provider-pill__status-dot--ok' : p.status === 429 ? 'ocr-provider-pill__status-dot--warn' : 'ocr-provider-pill__status-dot--err';
          return (
            <div key={id} className={`ocr-provider-pill ${preferred === id ? 'is-active' : ''}`} onClick={() => onPick(preferred === id ? 'auto' : id)} title={configured ? 'Click to route directly through this engine' : 'No API key configured on the server'}>
              <div className="ocr-provider-pill__header">
                <span className="ocr-provider-pill__name">
                  <span className={`ocr-provider-pill__status-dot ${dot}`} />
                  {PROVIDER_LABEL[id]}
                </span>
                {preferred === id ? <span className="ocr-provider-pill__badge">Active</span> : null}
              </div>
              <div className="ocr-provider-pill__meta">
                <span className="ocr-provider-pill__model">{p?.model ?? '-'}</span>
                {pinging === id ? (
                  <span className="ocr-provider-pill__stat">Pinging...</span>
                ) : !configured ? (
                  <span className="ocr-provider-pill__stat">No key</span>
                ) : p && p.ok ? (
                  <span className="ocr-provider-pill__stat ocr-provider-pill__stat--ok">{p.latencyMs}ms · OK</span>
                ) : p && p.status === 429 ? (
                  <span className="ocr-provider-pill__stat ocr-provider-pill__stat--warn">Rate limited</span>
                ) : p && p.status > 0 ? (
                  <span className="ocr-provider-pill__stat ocr-provider-pill__stat--err" title={p.message}>{p.status === 408 ? 'Timeout' : `${p.status} Failed`}</span>
                ) : (
                  <span className="ocr-provider-pill__stat">Standby</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AiSettingsSection() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [saved, setSaved] = useState<AiSettings | null>(null);
  const [health, setHealth] = useState<AiProviderHealth[]>([]);
  const [testing, setTesting] = useState(false);
  const [pinging, setPinging] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async (live: boolean) => {
    setTesting(live);
    try {
      const h = await api.get<AiHealthResult>(`/api/ai/health${live ? '' : '?ping=0'}`);
      setHealth(h.providers);
    } catch {
      /* status is informational */
    } finally {
      setTesting(false);
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
      if (alive) void check(false);
    })();
    return () => {
      alive = false;
    };
  }, [check]);

  const dirty = settings && saved ? JSON.stringify(settings) !== JSON.stringify(saved) : false;

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const next = await api.put<AiSettings>('/api/ai/settings', settings);
      setSettings(next);
      setSaved(next);
      await refreshAiStatus();
      toast('AI settings saved', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save AI settings.', 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function pick(v: AiRouting) {
    setSettings((s) => (s ? { ...s, preferredProvider: v } : s));
    if (v !== 'auto') {
      setPinging(v);
      try {
        const h = await api.get<AiHealthResult>('/api/ai/health');
        setHealth(h.providers);
      } catch {
        /* ignore */
      } finally {
        setPinging(null);
      }
    }
  }

  if (error) return <Panel title="AI assistance"><p role="alert" className="text-muted">{error}</p></Panel>;
  if (!settings) return <Panel title="AI assistance"><Skeleton height={120} /></Panel>;

  return (
    <div className="stack">
      <Panel title="AI assistance" subtitle="Applies to every user. Models only ever receive aggregates and asset codes from the asking user's own scope." action={
        <label className="cluster" style={{ gap: 8 }}>
          <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
          <span>{settings.enabled ? 'On' : 'Off'}</span>
        </label>
      }>
        <Engines preferred={settings.preferredProvider} onPick={(v) => void pick(v)} health={health} testing={testing} onTest={() => void check(true)} pinging={pinging} />
        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
          API keys are set in the server environment (never in the browser). An engine without a key shows &quot;No key&quot; and is skipped automatically. If every engine fails, users get a clearly labelled plain data summary instead of a made-up answer.
        </p>
      </Panel>

      <Panel title="Features" subtitle="Turn individual helpers on or off.">
        <div className="stack" style={{ gap: 12 }}>
          {FEATURES.map((f) => (
            <label key={f.key} className="cluster" style={{ gap: 10, alignItems: 'flex-start' }}>
              <input type="checkbox" style={{ marginTop: 3 }} checked={settings.features[f.key]} disabled={!settings.enabled} onChange={(e) => setSettings({ ...settings, features: { ...settings.features, [f.key]: e.target.checked } })} />
              <span>
                <strong style={{ fontSize: '0.9rem' }}>{f.label}</strong>
                <br />
                <small className="text-muted">{f.help}</small>
              </span>
            </label>
          ))}
        </div>
      </Panel>

      <Panel title="Privacy" subtitle="What leaves Sanchay when an AI engine is used.">
        <label className="cluster" style={{ gap: 10, alignItems: 'flex-start' }}>
          <input type="checkbox" style={{ marginTop: 3 }} checked={settings.shareRegistration} onChange={(e) => setSettings({ ...settings, shareRegistration: e.target.checked })} />
          <span>
            <strong style={{ fontSize: '0.9rem' }}>Include registration numbers in AI context</strong>
            <br />
            <small className="text-muted">Off by default: models see asset codes such as SCH-V-0126 instead. Driver names, phone numbers and exact locations are never sent in either case.</small>
          </span>
        </label>
      </Panel>

      <div className="cluster">
        <Button variant="primary" icon={<Save size={15} />} loading={saving} disabled={!dirty} onClick={() => void save()}>
          Save AI settings
        </Button>
        {dirty ? <Button variant="ghost" onClick={() => setSettings(saved)}>Discard</Button> : null}
      </div>
    </div>
  );
}
