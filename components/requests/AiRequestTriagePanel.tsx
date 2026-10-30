'use client';

import { useEffect, useState } from 'react';
import { Bot, Sparkles, ShieldCheck, Users, Wrench, CheckCircle2, AlertTriangle, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { useAiStatus } from '@/hooks/useAiStatus';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PROVIDER_LABEL } from '@/components/ai/labels';
import type { RequestTriageResponse } from '@/types/ai';

interface Props {
  requestId: string;
  onApplyDecision: (type: 'approve' | 'requestChanges' | 'reject', suggestedComment: string) => void;
}

export function AiRequestTriagePanel({ requestId, onApplyDecision }: Props) {
  const status = useAiStatus();
  const [triage, setTriage] = useState<RequestTriageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runTriage() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<RequestTriageResponse>(`/api/ai/requests/${requestId}/triage`, {});
      setTriage(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not perform AI triage right now.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status.ready && status.enabled && status.anyConfigured) {
      void runTriage();
    }
  }, [requestId, status.ready, status.enabled, status.anyConfigured]);

  if (!status.ready || !status.enabled || !status.anyConfigured) return null;

  return (
    <div className="ai-pulse-card-wrap" style={{ marginBottom: '1rem' }}>
      <div className="ai-pulse-card-inner">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 'var(--radius-md)', background: 'var(--color-brand-subtle)', color: 'var(--color-brand)' }}>
              <Sparkles size={16} />
            </div>
            <div>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                AI Approver Copilot & Policy Triage
              </span>
              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>
                Autonomous pre-screening of capacity, trip compliance & maintenance risk
              </div>
            </div>
            {triage?.provider && !triage.degraded ? (
              <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Bot size={10} />
                {PROVIDER_LABEL[triage.provider]}
              </span>
            ) : null}
          </div>
          <Button variant="secondary" size="sm" onClick={() => void runTriage()} loading={loading} icon={<RefreshCw size={12} />}>
            Re-screen
          </Button>
        </div>

        {loading && !triage ? (
          <div aria-busy="true" style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <div className="skeleton" style={{ height: 16, width: '85%' }} />
            <div className="skeleton" style={{ height: 14, width: '65%' }} />
          </div>
        ) : error ? (
          <p role="alert" style={{ margin: '12px 0 0', fontSize: '0.85rem', color: 'var(--color-danger)' }}>{error}</p>
        ) : triage ? (
          <div style={{ marginTop: 12 }} className="stack">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Recommendation:</span>
              <Badge tone={triage.recommendation === 'APPROVE' ? 'success' : triage.recommendation === 'REQUEST_CHANGES' ? 'warning' : 'danger'}>
                {triage.recommendation.replaceAll('_', ' ')}
              </Badge>
              <Badge tone="info">{triage.confidence}% Confidence</Badge>
            </div>

            <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
              {triage.summary}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 4 }}>
              <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 2 }}>
                  <ShieldCheck size={13} color={triage.complianceCheck.valid ? 'var(--color-success)' : 'var(--color-danger)'} />
                  Compliance validity
                </div>
                <div className="text-muted">{triage.complianceCheck.note}</div>
              </div>

              <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 2 }}>
                  <Users size={13} color={triage.capacityFit.fits ? 'var(--color-success)' : 'var(--color-warning)'} />
                  Seating & Class Fit
                </div>
                <div className="text-muted">{triage.capacityFit.note}</div>
              </div>

              <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 2 }}>
                  <Wrench size={13} color={triage.maintenanceCheck.ticketsCount === 0 ? 'var(--color-success)' : 'var(--color-warning)'} />
                  Maintenance Health
                </div>
                <div className="text-muted">{triage.maintenanceCheck.note}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <Button
                variant={triage.recommendation === 'APPROVE' ? 'primary' : 'secondary'}
                size="sm"
                icon={<Sparkles size={13} />}
                onClick={() => {
                  const actionType = triage.recommendation === 'APPROVE'
                    ? 'approve'
                    : triage.recommendation === 'REQUEST_CHANGES'
                      ? 'requestChanges'
                      : 'reject';
                  onApplyDecision(actionType, triage.suggestedComment);
                }}
              >
                1-Click Apply {triage.recommendation === 'APPROVE' ? 'Approval' : triage.recommendation === 'REQUEST_CHANGES' ? 'Change Request' : 'Rejection'}
              </Button>
              <span className="text-muted" style={{ fontSize: '0.76rem' }}>
                Pre-fills decision modal with AI note for supervisory review.
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

