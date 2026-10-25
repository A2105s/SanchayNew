'use client';

import { useState } from 'react';
import { Check, Loader2, Sparkles, TriangleAlert } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { useAiStatus } from '@/hooks/useAiStatus';
import { PROVIDER_LABEL } from '@/components/ai/labels';
import type { DraftCandidate, DraftRequestFields, DraftRequestResponse } from '@/types/ai';

/**
 * "Describe what you need" for the request wizard. The AI only pre-fills the form fields and lists eligible vehicles
 * from the normal search. Nothing is submitted or approved, and the user reviews every field before submitting.
 */
export function DraftRequestPanel({ onApply, onPickVehicle }: { onApply: (draft: DraftRequestFields) => void; onPickVehicle: (c: DraftCandidate, draft: DraftRequestFields) => void }) {
  const status = useAiStatus();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DraftRequestResponse | null>(null);
  const [applied, setApplied] = useState(false);

  if (!status.ready || !status.enabled || !status.anyConfigured || !status.features.draftRequest) return null;

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    setApplied(false);
    try {
      const res = await api.post<DraftRequestResponse>('/api/ai/draft-request', { text });
      setResult(res);
      onApply(res.draft);
      setApplied(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not draft this request right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ai-polish-hud" style={{ marginBottom: 14 }}>
      <div className="ai-polish-hud__header">
        <span className="ai-polish-hud__title">
          <Sparkles size={13} /> Describe what you need
          {result?.provider ? <span className="ai-polish-badge">{PROVIDER_LABEL[result.provider]}</span> : null}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 0 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. A van tomorrow 9am to 5pm for a medical camp at Morar, 6 people"
          aria-label="Describe the vehicle you need"
          maxLength={800}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim().length >= 8 && !loading) {
              e.preventDefault();
              void run();
            }
          }}
        />
        <button type="button" className="button button--secondary" onClick={() => void run()} disabled={loading || text.trim().length < 8}>
          {loading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
          <span>{loading ? 'Drafting...' : 'Fill form'}</span>
        </button>
      </div>
      <p className="text-muted" style={{ fontSize: '0.74rem', margin: '6px 0 0' }}>AI fills the fields below. It never submits the request. Check every field.</p>

      {error ? (
        <p role="alert" style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--color-danger)' }}>
          {error}
        </p>
      ) : null}

      {applied && result ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-success)' }}>
            <Check size={14} /> Form filled. Review the fields below.
          </p>
          {result.warnings.map((w, i) => (
            <p key={i} style={{ margin: '4px 0 0', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-warning)' }}>
              <TriangleAlert size={13} /> {w}
            </p>
          ))}
          {result.candidates.length ? (
            <div style={{ marginTop: 8 }}>
              <span className="text-muted" style={{ fontSize: '0.74rem' }}>Eligible vehicles available for that window (pick one, or leave it to the approver):</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {result.candidates.map((c) => (
                  <button key={c.vehicleId} type="button" className="button button--secondary button--sm" onClick={() => onPickVehicle(c, result.draft)} title={c.reason}>
                    <span className="mono">{c.assetCode}</span>
                    <span className="text-muted">{c.organizationName}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
