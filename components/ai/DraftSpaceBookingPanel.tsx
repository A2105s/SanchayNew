'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Check, TriangleAlert, Building2, Calendar, Users, MapPin } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { useAiStatus } from '@/hooks/useAiStatus';
import { PROVIDER_LABEL } from '@/components/ai/labels';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { DraftSpaceBookingFields, DraftSpaceBookingResponse, DraftSpaceCandidate } from '@/types/ai';

interface Props {
  onSelectCandidate: (candidate: DraftSpaceCandidate, draft: DraftSpaceBookingFields) => void;
  className?: string;
}

export function DraftSpaceBookingPanel({ onSelectCandidate, className = '' }: Props) {
  const status = useAiStatus();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DraftSpaceBookingResponse | null>(null);

  if (!status.ready || !status.enabled || !status.anyConfigured || !status.features.draftRequest) return null;

  async function run() {
    if (text.trim().length < 8) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<DraftSpaceBookingResponse>('/api/ai/spaces/draft-booking', { text: text.trim() });
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not match spaces for this query right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`ai-polish-hud ${className}`} style={{ marginBottom: 16 }}>
      <div className="ai-polish-hud__header">
        <span className="ai-polish-hud__title">
          <Sparkles size={13} /> Natural language space booking assistant
          {result?.provider ? <span className="ai-polish-badge">{PROVIDER_LABEL[result.provider]}</span> : null}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 0 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Need an auditorium with AC and projector for 80 officers next Wednesday 10:00 to 14:00"
          aria-label="Describe the civic space you need"
          maxLength={800}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim().length >= 8 && !loading) {
              e.preventDefault();
              void run();
            }
          }}
        />
        <Button variant="secondary" onClick={() => void run()} disabled={loading || text.trim().length < 8} loading={loading}>
          Match venues
        </Button>
      </div>

      <p className="text-muted" style={{ fontSize: '0.74rem', margin: '6px 0 0' }}>
        Translates natural language to IST slot windows and finds compliant available venues across departments.
      </p>

      {error ? (
        <p role="alert" style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--color-danger)' }}>
          {error}
        </p>
      ) : null}

      {result ? (
        <div style={{ marginTop: 12 }} className="stack">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Extracted parameters:</span>
            <Badge tone="info">{result.draft.category.replaceAll('_', ' ')}</Badge>
            <Badge tone="neutral">{result.draft.attendees} attendees</Badge>
            {result.draft.startAt && result.draft.endAt ? (
              <Badge tone="neutral">
                {new Date(result.draft.startAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' })}{' '}
                {new Date(result.draft.startAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} →{' '}
                {new Date(result.draft.endAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST
              </Badge>
            ) : null}
            {result.draft.amenities.map((a) => (
              <Badge key={a} tone="neutral">{a}</Badge>
            ))}
          </div>

          {result.warnings.map((w, i) => (
            <p key={i} style={{ margin: '4px 0 0', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-warning)' }}>
              <TriangleAlert size={13} /> {w}
            </p>
          ))}

          {result.candidates.length ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6 }}>
                Matched candidate venues ({result.candidates.length}):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
                {result.candidates.map((cand) => (
                  <div
                    key={cand.spaceId}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <strong style={{ fontSize: '0.88rem' }}>{cand.name}</strong>
                        <div className="text-muted mono" style={{ fontSize: '0.72rem' }}>{cand.assetCode}</div>
                      </div>
                      <Badge tone="success">{cand.score}% match</Badge>
                    </div>

                    <div className="text-muted" style={{ fontSize: '0.78rem', display: 'grid', gap: 2 }}>
                      <span><Users size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Capacity: {cand.capacity} {cand.areaSqft ? `· ${cand.areaSqft} sq ft` : ''}</span>
                      <span><MapPin size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> {[cand.buildingOrCampus, cand.district].filter(Boolean).join(', ') || 'Gwalior'}</span>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onSelectCandidate(cand, result.draft)}
                      style={{ marginTop: 4, width: '100%' }}
                    >
                      Book this venue
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

