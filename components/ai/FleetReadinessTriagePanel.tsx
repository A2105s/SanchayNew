'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Shield,
  Bot,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Fuel,
  Wrench,
  FileText,
  Send,
  LoaderCircle,
  ArrowRight,
  Filter,
  Check,
  User,
  ExternalLink
} from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { useAiStatus } from '@/hooks/useAiStatus';
import { PROVIDER_LABEL } from '@/components/ai/labels';
import { Button } from '@/components/ui/Button';
import type {
  FleetReadinessResponse,
  FleetTriageAction,
  AutoDispatchResponse
} from '@/types/ai';

export interface FleetReadinessTriagePanelProps {
  stationId?: string | null;
  stationName?: string | null;
  activeLaneFilter?: 'ready' | 'attention' | 'grounded' | null;
  onFilterLane?: (lane: 'ready' | 'attention' | 'grounded' | null, vehicleIds: string[] | null) => void;
  onActionCommitted?: () => void;
}

const SAMPLE_MISSIONS = [
  'Need 4-person patrol for Sarafa Bazaar festival duty',
  'Emergency VIP Escort to Gwalior Fort (Bolero)',
  'Maharaj Bada Traffic Division van for 6 officers'
];

export function FleetReadinessTriagePanel({
  stationId,
  stationName,
  activeLaneFilter,
  onFilterLane,
  onActionCommitted
}: FleetReadinessTriagePanelProps) {
  const { me, can, refresh } = useFleet();
  const { toast } = useToast();
  const status = useAiStatus();

  // Readiness triage state
  const [data, setData] = useState<FleetReadinessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Executing action card IDs
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [committedActionIds, setCommittedActionIds] = useState<Set<string>>(new Set());

  // Auto-dispatch state
  const [missionText, setMissionText] = useState('');
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchResult, setDispatchResult] = useState<AutoDispatchResponse | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployedSuccess, setDeployedSuccess] = useState<string | null>(null);

  // Load readiness triage
  const loadTriage = useCallback(
    async (refreshCache = false) => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams();
        if (stationId) queryParams.set('stationId', stationId);
        if (refreshCache) queryParams.set('refresh', '1');

        const queryStr = queryParams.toString();
        const res = await api.get<FleetReadinessResponse>(
          `/api/ai/vehicles/readiness-triage${queryStr ? `?${queryStr}` : ''}`
        );
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load readiness triage.');
      } finally {
        setLoading(false);
      }
    },
    [stationId]
  );

  useEffect(() => {
    setCommittedActionIds(new Set());
    setDispatchResult(null);
    setDeployedSuccess(null);
    void loadTriage();
  }, [loadTriage, stationId]);

  // Execute 1-Click Managerial Action
  async function handleExecuteAction(action: FleetTriageAction) {
    setExecutingActionId(action.id);
    try {
      if (action.type === 'COMPLIANCE_RENEWAL') {
        if (!can('vehicle.edit')) {
          toast('Your role does not have permission to edit vehicle compliance.', 'danger');
          return;
        }
        const doc = (action.actionPayload?.document as 'PUC' | 'INSURANCE' | 'FITNESS') || 'PUC';
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);

        await api.post(`/api/cloud/vehicles/${action.vehicleId}/actions`, {
          type: 'renewCompliance',
          document: doc,
          newExpiry: nextYear.toISOString(),
          reference: 'AI-FAST-SUPERVISORY-RENEWAL'
        });
        toast(`${doc} successfully renewed for 1 year`, 'success');
      } else if (action.type === 'FUEL_ROUTING') {
        if (!can('trip.write')) {
          toast('Your role does not have permission to record fuel logs.', 'danger');
          return;
        }
        await api.post(`/api/cloud/vehicles/${action.vehicleId}/actions`, {
          type: 'logFuel',
          liters: 40,
          costInr: 3800,
          stationName: (action.actionPayload?.targetStation as string) || 'IOCL Padav Fleet Depot'
        });
        toast(`IOCL refuel order committed (40L Diesel authorized)`, 'success');
      } else if (action.type === 'MAINTENANCE_SCHEDULE') {
        if (!can('maintenance.write')) {
          toast('Your role does not have permission to schedule maintenance.', 'danger');
          return;
        }
        await api.post(`/api/cloud/vehicles/${action.vehicleId}/actions`, {
          type: 'raiseMaintenance',
          title: 'Preventive Motor Transport Workshop Service',
          severity: 'MEDIUM',
          notes: 'Preemptively scheduled via 1-click executive supervisory triage.'
        });
        toast('Preventive maintenance bay booked at Police MT Workshop', 'success');
      } else {
        toast(`Action noted: ${action.title}`, 'info');
      }

      setCommittedActionIds((prev) => new Set(prev).add(action.id));
      await refresh();
      onActionCommitted?.();
      void loadTriage(true);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Action could not be completed.', 'danger');
    } finally {
      setExecutingActionId(null);
    }
  }

  // Run Mission Auto-Dispatch
  async function handleRunAutoDispatch(intentOverride?: string) {
    const textToRun = (intentOverride || missionText).trim();
    if (!textToRun || textToRun.length < 5) {
      toast('Please enter a mission description (at least 5 characters).', 'warning');
      return;
    }

    setDispatchLoading(true);
    setDispatchError(null);
    setDispatchResult(null);
    setDeployedSuccess(null);

    try {
      const res = await api.post<AutoDispatchResponse>('/api/ai/vehicles/auto-dispatch', {
        intent: textToRun,
        stationId: stationId || undefined
      });
      setDispatchResult(res);
    } catch (err) {
      setDispatchError(err instanceof ApiError ? err.message : 'Mission dispatch analysis failed.');
    } finally {
      setDispatchLoading(false);
    }
  }

  // 1-Click Deploy Mission
  async function handleDeployMission() {
    if (!dispatchResult?.suggestedAction) return;
    const action = dispatchResult.suggestedAction;
    const payload = action.dispatchPayload;

    setDeploying(true);
    try {
      if (!can('request.create')) {
        toast('Your role cannot create vehicle dispatch requests.', 'danger');
        return;
      }

      const res = await api.post<{ id?: string; requestCode?: string }>('/api/cloud/requests', {
        vehicleId: payload.vehicleId,
        requestedClass: dispatchResult.parsedRequirements.classNeeded,
        purpose: payload.purpose,
        destination: dispatchResult.parsedRequirements.destination || undefined,
        passengers: payload.passengers,
        startAt: payload.startAt,
        endAt: payload.endAt || new Date(Date.now() + 8 * 3600_000).toISOString(),
        accountableOfficer: me?.displayName || 'Station Duty Officer',
        submit: true
      });

      const code = res?.requestCode ? ` (${res.requestCode})` : '';
      setDeployedSuccess(`Mission successfully deployed${code}! Patrol allocation committed.`);
      toast(`Mission deployed${code}`, 'success');
      await refresh();
      onActionCommitted?.();
      void loadTriage(true);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to deploy mission.', 'danger');
    } finally {
      setDeploying(false);
    }
  }

  function toggleLane(lane: 'ready' | 'attention' | 'grounded') {
    if (!onFilterLane || !data) return;
    if (activeLaneFilter === lane) {
      onFilterLane(null, null);
    } else {
      const ids = data.lanes[lane]?.vehicleIds ?? [];
      onFilterLane(lane, ids);
    }
  }

  const uncommittedActions = data?.actions.filter((a) => !committedActionIds.has(a.id)) ?? [];

  return (
    <div className="ai-triage-panel" role="region" aria-label="AI Fleet Readiness and Dispatch Desk">
      {/* Header Banner */}
      <div className="ai-triage-header">
        <div className="ai-triage-title-group">
          <div className="ai-triage-icon-badge" aria-hidden="true">
            <Bot size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="ai-triage-title">AI Fleet Readiness & Autonomous Dispatch Desk</span>
              <span className="ai-triage-badge">
                <Shield size={11} aria-hidden="true" />
                Executive Supervisory Mode
              </span>
              {data?.provider && !data.degraded ? (
                <span className="ai-triage-badge" title={`Engine: ${PROVIDER_LABEL[data.provider]}`}>
                  <Sparkles size={11} aria-hidden="true" />
                  {PROVIDER_LABEL[data.provider]}
                </span>
              ) : data?.degraded ? (
                <span className="ai-triage-badge" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
                  <TriangleAlert size={11} aria-hidden="true" />
                  Deterministic Engine
                </span>
              ) : null}
            </div>
            <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
              {stationName ? `Station command: ${stationName}` : 'District-wide fleet command (37 Police Stations)'}
              {data ? ` · ${data.totalVehicles} assets monitored` : ''}
            </div>
          </div>
        </div>

        <div className="cluster" style={{ gap: '0.5rem' }}>
          {activeLaneFilter ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Filter size={13} />}
              onClick={() => onFilterLane?.(null, null)}
            >
              Clear lane filter ({activeLaneFilter})
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={13} className={loading ? 'spin' : ''} />}
            onClick={() => void loadTriage(true)}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* AI Operations Summary */}
      {error ? (
        <p className="text-danger" style={{ fontSize: '0.85rem' }}>{error}</p>
      ) : data?.summary ? (
        <div className="ai-triage-summary">
          <strong>Mission Digest:</strong> {data.summary}
        </div>
      ) : null}

      {/* 3 Visual Mission Lanes */}
      <div className="ai-lanes-grid">
        {/* Ready Lane */}
        <div
          className={`ai-lane-card ai-lane-card--ready ${activeLaneFilter === 'ready' ? 'ai-lane-card--active' : ''}`}
        >
          <div>
            <div className="ai-lane-header">
              <span className="ai-lane-name" style={{ color: 'var(--color-success, #10b981)' }}>
                <CheckCircle2 size={15} /> Mission Ready
              </span>
              <span className="ai-lane-count">{data?.lanes.ready.count ?? 0}</span>
            </div>
            <p className="ai-lane-desc">
              {data?.lanes.ready.description || '100% compliant, fully fueled, and immediately dispatchable.'}
            </p>
          </div>
          <Button
            variant={activeLaneFilter === 'ready' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => toggleLane('ready')}
          >
            {activeLaneFilter === 'ready' ? 'Viewing Ready' : 'Filter Ready'}
          </Button>
        </div>

        {/* Attention Lane */}
        <div
          className={`ai-lane-card ai-lane-card--attention ${activeLaneFilter === 'attention' ? 'ai-lane-card--active' : ''}`}
        >
          <div>
            <div className="ai-lane-header">
              <span className="ai-lane-name" style={{ color: 'var(--color-warning, #f59e0b)' }}>
                <AlertTriangle size={15} /> Attention Required
              </span>
              <span className="ai-lane-count">{data?.lanes.attention.count ?? 0}</span>
            </div>
            <p className="ai-lane-desc">
              {data?.lanes.attention.description || 'Expiring certificates, low fuel, or upcoming routine maintenance.'}
            </p>
          </div>
          <Button
            variant={activeLaneFilter === 'attention' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => toggleLane('attention')}
          >
            {activeLaneFilter === 'attention' ? 'Viewing Attention' : 'Filter Attention'}
          </Button>
        </div>

        {/* Grounded Lane */}
        <div
          className={`ai-lane-card ai-lane-card--grounded ${activeLaneFilter === 'grounded' ? 'ai-lane-card--active' : ''}`}
        >
          <div>
            <div className="ai-lane-header">
              <span className="ai-lane-name" style={{ color: 'var(--color-danger, #ef4444)' }}>
                <XCircle size={15} /> Grounded / Standdown
              </span>
              <span className="ai-lane-count">{data?.lanes.grounded.count ?? 0}</span>
            </div>
            <p className="ai-lane-desc">
              {data?.lanes.grounded.description || 'Expired compliance, open critical tickets, or restrictions.'}
            </p>
          </div>
          <Button
            variant={activeLaneFilter === 'grounded' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => toggleLane('grounded')}
          >
            {activeLaneFilter === 'grounded' ? 'Viewing Grounded' : 'Filter Grounded'}
          </Button>
        </div>
      </div>

      {/* 1-Click Managerial Action Cards Queue */}
      <div className="ai-actions-section">
        <div className="ai-actions-heading">
          <span>1-Click Supervisory Action Queue</span>
          <span className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 500 }}>
            {uncommittedActions.length} prescreened actions ready for managerial commitment
          </span>
        </div>

        {uncommittedActions.length === 0 ? (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
            No urgent compliance or maintenance actions pending. Fleet operating parameters are within compliant thresholds.
          </div>
        ) : (
          <div className="ai-action-cards-grid">
            {uncommittedActions.map((action) => {
              const isExecuting = executingActionId === action.id;
              const isComp = action.type === 'COMPLIANCE_RENEWAL';
              const isFuel = action.type === 'FUEL_ROUTING';
              const isMaint = action.type === 'MAINTENANCE_SCHEDULE';

              return (
                <div key={action.id} className="ai-action-card">
                  <div>
                    <div className="ai-action-card__top">
                      <div className="cluster" style={{ gap: '0.4rem' }}>
                        {isComp ? (
                          <FileText size={15} style={{ color: 'var(--color-warning)' }} />
                        ) : isFuel ? (
                          <Fuel size={15} style={{ color: 'var(--color-brand)' }} />
                        ) : (
                          <Wrench size={15} style={{ color: 'var(--color-danger)' }} />
                        )}
                        <span className="mono" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                          {action.assetCode}
                        </span>
                      </div>
                      <span
                        className="badge"
                        style={{
                          fontSize: '0.68rem',
                          background:
                            action.priority === 'high'
                              ? 'var(--color-danger-bg, #fee2e2)'
                              : 'var(--color-warning-bg, #fef3c7)',
                          color:
                            action.priority === 'high'
                              ? 'var(--color-danger, #b91c1c)'
                              : 'var(--color-warning, #b45309)'
                        }}
                      >
                        {action.priority.toUpperCase()}
                      </span>
                    </div>

                    <div className="ai-action-card__title" style={{ marginTop: '0.35rem' }}>
                      {action.title}
                    </div>
                    <p className="ai-action-card__desc" style={{ marginTop: '0.25rem' }}>
                      {action.description}
                    </p>
                  </div>

                  <div>
                    <span className="ai-action-card__impact">
                      Impact: {action.impact}
                    </span>

                    <div className="ai-action-card__bottom">
                      <span className="text-muted" style={{ fontSize: '0.72rem' }}>
                        {action.stationName || 'Police Fleet'}
                      </span>
                      <div className="cluster" style={{ gap: '0.4rem' }}>
                        {action.actionUrl ? (
                          <Link
                            href={action.actionUrl}
                            className="button button--ghost button--sm"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.45rem' }}
                            title="Inspect details"
                          >
                            <ExternalLink size={12} />
                          </Link>
                        ) : null}
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={isExecuting}
                          onClick={() => void handleExecuteAction(action)}
                          icon={
                            isExecuting ? (
                              <LoaderCircle size={12} className="spin" />
                            ) : (
                              <Check size={12} />
                            )
                          }
                        >
                          {isComp ? '1-Click Renew' : isFuel ? '1-Click Refuel' : '1-Click Book MT'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Mission Auto-Dispatch Assistant */}
      <div className="ai-dispatch-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
          <div>
            <strong style={{ fontSize: '0.86rem', color: 'var(--color-text-primary)' }}>
              Mission Auto-Dispatch Desk (Zero-Clerk Deployment)
            </strong>
            <p className="text-muted" style={{ fontSize: '0.76rem', margin: 0 }}>
              AI analyzes passenger requirement, fuel range, and officer roster to recommend the optimal patrol vehicle.
            </p>
          </div>
          {status.features.draftRequest ? null : (
            <span className="badge" style={{ fontSize: '0.7rem' }}>AI Draft Feature Disabled</span>
          )}
        </div>

        {/* Input Bar */}
        <div className="ai-dispatch-bar">
          <input
            type="text"
            className="input ai-dispatch-input"
            placeholder="e.g. Need 4-person patrol for Sarafa Bazaar festival duty"
            value={missionText}
            onChange={(e) => setMissionText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !dispatchLoading) {
                e.preventDefault();
                void handleRunAutoDispatch();
              }
            }}
            disabled={dispatchLoading}
            aria-label="Mission intent description"
          />
          <Button
            variant="primary"
            icon={dispatchLoading ? <LoaderCircle size={14} className="spin" /> : <Send size={14} />}
            disabled={dispatchLoading || !missionText.trim()}
            onClick={() => void handleRunAutoDispatch()}
          >
            Analyze & Dispatch
          </Button>
        </div>

        {/* Sample Pills */}
        <div className="ai-sample-pills">
          <span className="text-muted" style={{ fontSize: '0.72rem', marginRight: '0.2rem' }}>Quick presets:</span>
          {SAMPLE_MISSIONS.map((sample) => (
            <button
              key={sample}
              type="button"
              className="ai-sample-pill"
              onClick={() => {
                setMissionText(sample);
                void handleRunAutoDispatch(sample);
              }}
            >
              {sample}
            </button>
          ))}
        </div>

        {/* Dispatch Results Box */}
        {dispatchError ? (
          <p className="text-danger" style={{ fontSize: '0.82rem' }}>{dispatchError}</p>
        ) : null}

        {deployedSuccess ? (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--color-success-bg, #ecfdf5)', color: 'var(--color-success, #065f46)', borderRadius: 'var(--radius-md)', fontSize: '0.84rem', fontWeight: 600 }}>
            {deployedSuccess}
          </div>
        ) : null}

        {dispatchResult ? (
          <div className="ai-dispatch-result-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div className="cluster" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                <span className="badge" style={{ fontSize: '0.72rem' }}>
                  Target: {dispatchResult.parsedRequirements.classNeeded}
                </span>
                <span className="badge" style={{ fontSize: '0.72rem' }}>
                  Officers: {dispatchResult.parsedRequirements.passengerCount} Pax
                </span>
                <span className="badge" style={{ fontSize: '0.72rem' }}>
                  Priority: {dispatchResult.parsedRequirements.urgency}
                </span>
                {dispatchResult.parsedRequirements.destination ? (
                  <span className="badge" style={{ fontSize: '0.72rem' }}>
                    Point: {dispatchResult.parsedRequirements.destination}
                  </span>
                ) : null}
              </div>

              {dispatchResult.provider && !dispatchResult.degraded ? (
                <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                  Evaluated via {PROVIDER_LABEL[dispatchResult.provider]}
                </span>
              ) : null}
            </div>

            {dispatchResult.warnings.length > 0 ? (
              <div style={{ fontSize: '0.78rem', color: 'var(--color-warning)' }}>
                {dispatchResult.warnings.map((w, idx) => (
                  <div key={idx}>⚠️ {w}</div>
                ))}
              </div>
            ) : null}

            {dispatchResult.recommendations.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                  Top Ranked Candidate:
                </div>
                {dispatchResult.recommendations.slice(0, 2).map((cand, idx) => (
                  <div key={cand.vehicleId} className="ai-candidate-card">
                    <div>
                      <div className="cluster" style={{ gap: '0.45rem' }}>
                        <strong>{cand.registrationNumber}</strong>
                        <span className="mono text-muted" style={{ fontSize: '0.78rem' }}>({cand.assetCode})</span>
                        <span className="badge" style={{ fontSize: '0.7rem' }}>{cand.vehicleClass}</span>
                        {idx === 0 ? (
                          <span className="badge" style={{ fontSize: '0.7rem', background: 'var(--color-brand-subtle)', color: 'var(--color-brand)' }}>
                            Top Recommendation
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '0.2rem' }}>
                        {cand.suitabilityReason}
                      </div>
                      {cand.assignedDriver ? (
                        <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                          <User size={12} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Driver: {cand.assignedDriver.name}
                        </div>
                      ) : null}
                    </div>

                    <div className="cluster" style={{ gap: '0.65rem' }}>
                      <span className="ai-score-badge">
                        {cand.suitabilityScore}% Match
                      </span>
                      {idx === 0 && dispatchResult.suggestedAction ? (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={deploying ? <LoaderCircle size={13} className="spin" /> : <ArrowRight size={13} />}
                          disabled={deploying}
                          onClick={() => void handleDeployMission()}
                        >
                          1-Click Deploy Mission
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: '0.82rem' }}>
                No active government fleet patrol vehicles available in this scope.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
