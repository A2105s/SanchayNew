'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Database, RefreshCw, X } from 'lucide-react';
import type { CloudSyncStatus } from '@/lib/client/sync-status';
import { fmtDateTime } from '@/lib/fleet/format';

export interface CloudHealthInfo {
  /** Epoch ms of the last completed health check, or null before the first one finishes. */
  checkedAt: number | null;
  latencyMs: number | null;
  httpStatus: number | null;
  /** Human-readable reason when the last check failed. */
  error: string | null;
}

export interface CloudBadgeView {
  tone: string;
  label: string;
  shortLabel: string;
  title: string;
}

export interface ServerJobCounts {
  pending: number;
  processing: number;
  failed: number;
  completed: number;
}

interface CloudStatusPopoverProps {
  badge: CloudBadgeView;
  dbStatus: 'online' | 'checking' | 'offline';
  health: CloudHealthInfo;
  syncStatus: CloudSyncStatus;
  serverJobs: ServerJobCounts;
  offlineQueued: number;
  onRecheck: () => void;
}

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

const SYNC_STATE_LABEL: Record<CloudSyncStatus['state'], string> = {
  idle: 'Idle',
  syncing: 'Syncing',
  queued: 'Queued for retry',
  synced: 'Up to date',
  failed: 'Failed'
};

/** Cloud status chip: health pill + sync queue + offline queue. */
export function CloudStatusPopover({
  badge,
  dbStatus,
  health,
  syncStatus,
  serverJobs,
  offlineQueued,
  onRecheck
}: CloudStatusPopoverProps) {
  const [open, setOpen] = useState(false);
  const [recheckRequestedAt, setRecheckRequestedAt] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const browserOnline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const rechecking = recheckRequestedAt != null && (health.checkedAt ?? 0) < recheckRequestedAt;
  const hasProblem = dbStatus === 'offline' || badge.tone === 'failed';
  const explanation = describeProblem(dbStatus, browserOnline, health, serverJobs, offlineQueued);
  const dbLabel = dbStatus === 'online' ? 'Online' : dbStatus === 'offline' ? 'Offline' : 'Checking';

  return (
    <div className="cloud-status" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`db-health db-health--button is-${badge.tone}`}
        title={badge.title}
        aria-label={`${badge.label}. ${badge.title} Open connection details.`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`db-health__dot is-${badge.tone}`} aria-hidden="true" />
        <Database size={13} aria-hidden="true" />
        <span className="db-health__label-full">{badge.label}</span>
        <span className="db-health__label-short">{badge.shortLabel}</span>
      </button>

      {open ? (
        <div className="cloud-status__panel" id={panelId} role="dialog" aria-label="Cloud connection details">
          <header className="cloud-status__head">
            <span className={`db-health__dot is-${badge.tone}`} aria-hidden="true" />
            <div className="cloud-status__heading">
              <strong>{badge.label}</strong>
              <small>{badge.title}</small>
            </div>
            <button
              type="button"
              className="icon-button cloud-status__close"
              aria-label="Close connection details"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>

          {hasProblem ? (
            <div className="cloud-status__issue" role="alert">
              <strong>What happened</strong>
              <p>{health.error ?? 'The Sanchay cloud could not be reached.'}</p>
              <p className="cloud-status__hint">{explanation}</p>
            </div>
          ) : null}

          <dl className="cloud-status__meta">
            <div>
              <dt>Cloud database</dt>
              <dd className={`is-${dbStatus}`}>{dbLabel}</dd>
            </div>
            <div>
              <dt>Internet connection</dt>
              <dd className={browserOnline ? 'is-online' : 'is-offline'}>
                {browserOnline ? 'Connected' : 'No connection'}
              </dd>
            </div>
            <div>
              <dt>Last check</dt>
              <dd>{health.checkedAt ? fmtDateTime(health.checkedAt) : 'Not completed yet'}</dd>
            </div>
            <div>
              <dt>Response</dt>
              <dd>
                {health.latencyMs != null ? `${health.latencyMs} ms` : 'No response'}
                {health.httpStatus != null ? ` · HTTP ${health.httpStatus}` : ''}
              </dd>
            </div>
            <div>
              <dt>Sync queue</dt>
              <dd>
                {SYNC_STATE_LABEL[syncStatus.state]}
                {syncStatus.pending ? ` · ${syncStatus.pending} in progress` : ''}
              </dd>
            </div>
            <div>
              <dt>Server retry jobs</dt>
              <dd>
                {serverJobs.pending + serverJobs.processing + serverJobs.failed === 0
                  ? 'None waiting'
                  : `${serverJobs.pending} pending · ${serverJobs.processing} running · ${serverJobs.failed} failed`}
              </dd>
            </div>
            <div>
              <dt>Offline queue</dt>
              <dd className={offlineQueued > 0 ? 'is-checking' : undefined}>
                {offlineQueued > 0 ? `${offlineQueued} action${offlineQueued === 1 ? '' : 's'} waiting` : 'Empty'}
              </dd>
            </div>
          </dl>

          {syncStatus.message ? <p className="cloud-status__note">{syncStatus.message}</p> : null}

          <footer className="cloud-status__actions">
            <button
              type="button"
              className="button button--secondary"
              disabled={rechecking}
              onClick={() => {
                setRecheckRequestedAt(Date.now());
                onRecheck();
              }}
            >
              <RefreshCw size={14} className={rechecking ? 'spin' : undefined} aria-hidden="true" />
              <span>{rechecking ? 'Checking…' : 'Check again'}</span>
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function describeProblem(
  dbStatus: 'online' | 'checking' | 'offline',
  browserOnline: boolean,
  health: CloudHealthInfo,
  serverJobs: ServerJobCounts,
  offlineQueued: number
): string {
  if (!browserOnline) {
    return 'This device has no internet connection. Field actions are queued locally and sync automatically when the connection returns.';
  }
  if (dbStatus === 'offline' && health.httpStatus == null) {
    return 'The Sanchay server could not be reached. Check that the app server is running and your network allows access to it.';
  }
  if (dbStatus === 'offline') {
    return 'The server responded but could not reach the cloud database. Check the database status and connection settings.';
  }
  if (serverJobs.failed > 0) {
    return 'Some server retry jobs stopped after repeated failures. Open the Audit screen to review the error.';
  }
  if (offlineQueued > 0) {
    return `${offlineQueued} offline action${offlineQueued === 1 ? '' : 's'} will retry automatically.`;
  }
  return 'All systems operating normally.';
}
