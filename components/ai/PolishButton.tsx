'use client';

import { useState } from 'react';
import { Check, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { useAiStatus } from '@/hooks/useAiStatus';
import { PROVIDER_LABEL } from '@/components/ai/labels';
import type { PolishKind, PolishResponse } from '@/types/ai';

/**
 * "Improve wording" for a free-text field. Shows the original next to the suggestion and only replaces the text when
 * the user accepts. The text is never changed automatically, and it hides itself when AI is off.
 */
export function PolishButton({ kind, value, onApply, disabled }: { kind: PolishKind; value: string; onApply: (text: string) => void; disabled?: boolean }) {
  const status = useAiStatus();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PolishResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!status.ready || !status.enabled || !status.anyConfigured || !status.features.polish) return null;

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.post<PolishResponse>('/api/ai/polish', { kind, text: value }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not improve this text right now.');
    } finally {
      setLoading(false);
    }
  }

  const tooShort = value.trim().length < 5;

  return (
    <div style={{ marginTop: 6 }}>
      {!result ? (
        <button type="button" className="ai-polish-chip" onClick={() => void run()} disabled={disabled || loading || tooShort} title={tooShort ? 'Write a few words first' : 'Rewrite for clarity without adding facts'}>
          {loading ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
          <span>{loading ? 'Improving...' : 'Improve wording with AI'}</span>
        </button>
      ) : (
        <div className="ai-polish-hud ai-polish-hud--success" role="region" aria-label="AI suggestion">
          <div className="ai-polish-hud__header">
            <span className="ai-polish-hud__title">
              <Sparkles size={13} /> Suggested wording
              {result.provider ? <span className="ai-polish-badge">{PROVIDER_LABEL[result.provider]}</span> : null}
            </span>
            <button type="button" className="ai-polish-hud__close" aria-label="Dismiss suggestion" onClick={() => setResult(null)}>
              <X size={14} />
            </button>
          </div>
          <div className="ai-polish-diff">
            <div className="ai-polish-diff__col">
              <span className="ai-polish-diff__label">Your text</span>
              <div className="ai-polish-diff__content">{result.original}</div>
            </div>
            <div className="ai-polish-diff__col ai-polish-diff__col--polished">
              <span className="ai-polish-diff__label">Suggestion</span>
              <div className="ai-polish-diff__content">{result.polished}</div>
            </div>
          </div>
          {result.changes.length ? (
            <ul className="ai-polish-diff-list">
              {result.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-muted" style={{ fontSize: '0.74rem', margin: '6px 0 0' }}>Check the suggestion for accuracy before using it. AI can misread detail.</p>
          <div className="ai-polish-hud__actions">
            <button type="button" className="ai-polish-hud__btn" onClick={() => { onApply(result.polished); setResult(null); }}>
              <Check size={13} /> Use suggestion
            </button>
            <button type="button" className="ai-polish-hud__btn ai-polish-hud__btn--revert" onClick={() => setResult(null)}>
              <RotateCcw size={13} /> Keep mine
            </button>
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--color-danger)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
