'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Bot, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useAiStatus } from '@/hooks/useAiStatus';
import { useFleet } from '@/lib/client/useFleet';
import { PROVIDER_LABEL } from '@/components/ai/labels';
import type { PulseResponse } from '@/types/ai';

/** Dashboard briefing. Built from the caller's own scoped data; hides itself when AI is off. */
export function AiPulseSlot() {
  const status = useAiStatus();
  const { me } = useFleet();
  const [pulse, setPulse] = useState<PulseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setPulse(await api.get<PulseResponse>(`/api/ai/pulse${refresh ? '?refresh=1' : ''}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the briefing.');
    } finally {
      setLoading(false);
    }
  }, []);

  const active = Boolean(me && status.ready && status.enabled && status.anyConfigured && status.features.pulse);
  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  if (!active) return null;

  return (
    <div className="ai-pulse-card-wrap">
      <div className="ai-pulse-card-inner">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 'var(--radius-md)', background: 'var(--color-brand-subtle)', border: '1px solid var(--brand-border)', color: 'var(--color-brand)' }}>
              <Bot size={16} />
            </div>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>Sanchay AI operations pulse</span>
            {pulse?.provider && !pulse.degraded ? (
              <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--color-brand-subtle)', border: '1px solid var(--brand-border)', color: 'var(--color-brand)', display: 'inline-flex', alignItems: 'center', gap: 4 }} title={`Generated with ${PROVIDER_LABEL[pulse.provider]} (${pulse.model})`}>
                <Sparkles size={10} />
                {PROVIDER_LABEL[pulse.provider]}
              </span>
            ) : null}
            {pulse?.degraded ? (
              <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <TriangleAlert size={10} />
                Plain summary (AI unavailable)
              </span>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {pulse ? <span style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>{new Date(pulse.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span> : null}
            <button type="button" onClick={() => void load(true)} disabled={loading} className="button button--secondary button--sm" title="Refresh briefing">
              <RefreshCw size={12} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {loading && !pulse ? (
          <div aria-busy="true" style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <div className="skeleton" style={{ height: 14, width: '92%' }} />
            <div className="skeleton" style={{ height: 14, width: '78%' }} />
            <div className="skeleton" style={{ height: 14, width: '60%' }} />
          </div>
        ) : error ? (
          <p role="alert" style={{ margin: '12px 0 0', fontSize: '0.85rem', color: 'var(--color-danger)' }}>{error}</p>
        ) : pulse ? (
          <>
            <p style={{ margin: '12px 0 0', fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--color-text-primary)' }}>{pulse.summary}</p>
            {pulse.highlights.length ? (
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: '0.84rem', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
                {pulse.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            ) : null}
            {pulse.recommendedActions.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {pulse.recommendedActions.map((a) => (
                  <Link key={a.href + a.label} href={a.href} className={`button button--sm ${a.priority === 'high' ? 'button--primary' : 'button--secondary'}`}>
                    <span>{a.label}</span>
                    <ArrowRight size={13} />
                  </Link>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
