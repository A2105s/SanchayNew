'use client';

import { useEffect, useState } from 'react';
import { Bot, Sparkles, ShieldCheck, Users, ShieldAlert, CheckCircle2, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { useAiStatus } from '@/hooks/useAiStatus';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PROVIDER_LABEL } from '@/components/ai/labels';
import type { SpaceTriageResponse } from '@/types/ai';

interface Props {
  bookingId: string;
  onApply: (decision: 'approve' | 'reject', suggestedNote: string) => void;
}

export function AiSpaceTriagePanel({ bookingId, onApply }: Props) {
  const status = useAiStatus();
  const [triage, setTriage] = useState<SpaceTriageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runTriage() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<SpaceTriageResponse>('/api/ai/spaces/triage', { bookingId });
      setTriage(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not perform AI triage for this booking.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status.ready && status.enabled && status.anyConfigured) {
      void runTriage();
    }
  }, [bookingId, status.ready, status.enabled, status.anyConfigured]);

  if (!status.ready || !status.enabled || !status.anyConfigured) return null;

  return (
    <div className="ai-pulse-card-wrap" style={{ marginTop: 8 }}>
      <div className="ai-pulse-card-inner" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={16} color="var(--color-brand)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>AI Approver Safety & Policy Triage</span>
          {triage?.provider && !triage.degraded ? (
            <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Bot size={10} />
              {PROVIDER_LABEL[triage.provider]}
            </span>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void runTriage()} loading={loading} icon={<RefreshCw size={11} />}>
          Re-audit
        </Button>
      </div>

      {loading && !triage ? (
        <div aria-busy="true" style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          <div className="skeleton" style={{ height: 14, width: '85%' }} />
          <div className="skeleton" style={{ height: 12, width: '60%' }} />
        </div>
      ) : error ? (
        <p role="alert" style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--color-danger)' }}>{error}</p>
      ) : triage ? (
        <div style={{ marginTop: 10 }} className="stack">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Triage recommendation:</span>
            <Badge tone={triage.recommendation === 'APPROVE' ? 'success' : triage.recommendation === 'NEEDS_REVIEW' ? 'warning' : 'danger'}>
              {triage.recommendation.replaceAll('_', ' ')}
            </Badge>
            <Badge tone="info">{triage.confidence}% Confidence</Badge>
            {triage.safetyAnalysis.sqFtPerAttendee ? (
              <Badge tone={triage.safetyAnalysis.status === 'CRITICAL' ? 'danger' : triage.safetyAnalysis.status === 'WARNING' ? 'warning' : 'neutral'}>
                {triage.safetyAnalysis.sqFtPerAttendee} sq ft / attendee
              </Badge>
            ) : null}
          </div>

          <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
            {triage.summary}
          </p>

          {triage.safetyAnalysis.status === 'CRITICAL' ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontSize: '0.78rem' }}>
              <ShieldAlert size={14} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <strong>Overcrowding Safety Hazard:</strong> {triage.safetyAnalysis.note}
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <Button
              variant={triage.recommendation === 'APPROVE' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onApply(triage.recommendation === 'APPROVE' ? 'approve' : 'reject', triage.suggestedNote)}
            >
              1-Click Apply {triage.recommendation === 'APPROVE' ? 'Approval' : 'Rejection'} Note
            </Button>
            <span className="text-muted" style={{ fontSize: '0.74rem' }}>
              Pre-populates confirmation modal with safety and compliance rationale.
            </span>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
