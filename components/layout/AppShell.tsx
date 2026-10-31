'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Clock3, Command, LoaderCircle, Menu, TriangleAlert, X } from 'lucide-react';
import { useGlobalScrollEdgeSpring } from '@/hooks/useScrollEdgeSpring';
import { Sidebar } from '@/components/layout/Sidebar';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { AiCopilotModal } from '@/components/ai/AiCopilotModal';
import { useFleet } from '@/components/providers/FleetProvider';
import { useActiveModule, setModuleCookie } from '@/lib/client/useModule';
import {
  CloudStatusPopover,
  type CloudBadgeView,
  type CloudHealthInfo,
  type ServerJobCounts
} from '@/components/layout/CloudStatusPopover';
import {
  getCloudSyncStatus,
  subscribeCloudSyncStatus,
  type CloudSyncStatus
} from '@/lib/client/sync-status';
import { pendingCount as offlinePendingCount, subscribe as subscribeOffline } from '@/lib/client/offline-queue';

const EMPTY_HEALTH: CloudHealthInfo = { checkedAt: null, latencyMs: null, httpStatus: null, error: null };
const EMPTY_JOBS: ServerJobCounts = { pending: 0, processing: 0, failed: 0, completed: 0 };
const HEALTH_INTERVAL = 30_000;

interface HealthResponse {
  resetEpoch?: number | null;
  dataVersion?: string;
  syncJobs?: ServerJobCounts;
}

function describeHealthError(httpStatus: number | null): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'This device is offline.';
  if (httpStatus != null) return `The Sanchay server responded with HTTP ${httpStatus}.`;
  return 'Could not reach the Sanchay server (network error or server not running).';
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const bare = pathname === '/login' || pathname === '/';

  const [collapsed, setCollapsed] = useState(true); // Industry-standard compact icon rail; smooth auto-expand on hover
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [dbStatus, setDbStatus] = useState<'online' | 'checking' | 'offline'>('checking');
  const [health, setHealth] = useState<CloudHealthInfo>(EMPTY_HEALTH);
  const [serverJobs, setServerJobs] = useState<ServerJobCounts>(EMPTY_JOBS);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(() => getCloudSyncStatus());
  const [offlineQueued, setOfflineQueued] = useState(0);

  const recheckRef = useRef<() => void>(() => undefined);
  const pendingHref = navigatingTo !== pathname ? navigatingTo : null;

  const { me } = useFleet();
  const activeModule = useActiveModule(pathname);

  const headerBrand = useMemo(() => {
    // Platform Administrator has overarching cross-module governance
    if (me?.role === 'ADMIN') {
      return { title: 'Sanchay', strong: 'San', rest: 'chay', href: '/dashboard' };
    }
    // Police station login / police roles focus strictly on vehicle fleet operations
    if (me?.role === 'STATION_OFFICER' || me?.stationId || me?.role === 'FIELD_STAFF') {
      return { title: 'Vehicles', strong: 'Vehi', rest: 'cles', href: '/dashboard' };
    }
    // Spaces login or viewing civic spaces pages
    if (activeModule === 'spaces' || pathname.startsWith('/spaces')) {
      return { title: 'Spaces', strong: 'Spa', rest: 'ces', href: '/spaces' };
    }
    // Default fallback
    return { title: 'Sanchay', strong: 'San', rest: 'chay', href: '/dashboard' };
  }, [me?.role, me?.stationId, activeModule, pathname]);

  // EasyLife's PaperFlow spring edge physics across the app
  useGlobalScrollEdgeSpring();

  // Clear the pending nav marker once the route changes (or after a timeout).
  useEffect(() => {
    setNavigatingTo(null);
  }, [pathname]);
  useEffect(() => {
    if (!navigatingTo) return;
    const id = window.setTimeout(() => setNavigatingTo(null), 12_000);
    return () => window.clearTimeout(id);
  }, [navigatingTo]);

  // Subscribe to sync-status + offline queue stores.
  useEffect(() => subscribeCloudSyncStatus(setSyncStatus), []);
  useEffect(() => subscribeOffline(setOfflineQueued), []);
  useEffect(() => setOfflineQueued(offlinePendingCount()), []);

  // Health polling (drives the cloud status chip; FleetProvider owns data reloads).
  useEffect(() => {
    if (bare) return;
    let cancelled = false;

    async function checkHealth() {
      const startedAt = performance.now();
      let httpStatus: number | null = null;
      let latencyMs: number | null = null;
      try {
        const response = await fetch('/api/cloud/health', { cache: 'no-store' });
        httpStatus = response.status;
        latencyMs = Math.round(performance.now() - startedAt);
        if (!response.ok) {
          if (response.status === 401 && typeof window !== 'undefined') {
            window.location.href = '/login';
            return;
          }
          throw new Error(`HTTP ${response.status}`);
        }
        const body = (await response.json()) as { data?: HealthResponse } | HealthResponse;
        const data = (body as { data?: HealthResponse }).data ?? (body as HealthResponse);
        if (cancelled) return;
        setDbStatus('online');
        setServerJobs(data.syncJobs ?? EMPTY_JOBS);
        setHealth({ checkedAt: Date.now(), latencyMs, httpStatus, error: null });
      } catch {
        if (cancelled) return;
        setDbStatus('offline');
        setServerJobs(EMPTY_JOBS);
        setHealth({ checkedAt: Date.now(), latencyMs, httpStatus, error: describeHealthError(httpStatus) });
      }
    }

    recheckRef.current = () => void checkHealth();
    void checkHealth();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void checkHealth();
    }, HEALTH_INTERVAL);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkHealth();
    };
    const onOnline = () => void checkHealth();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [bare]);

  // Command palette shortcut (Ctrl/Cmd+K).
  useEffect(() => {
    if (bare) return;
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bare]);

  // Mobile drawer: lock scroll + Esc to close.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  const handleToggle = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 820) {
      setMobileOpen((v) => !v);
    } else {
      setCollapsed((v) => !v);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore — navigate to login regardless
    }
    window.location.href = '/login';
  }, []);

  const badge = useMemo<CloudBadgeView>(() => {
    if (serverJobs.failed > 0) {
      return { tone: 'failed', label: `${serverJobs.failed} sync failed`, shortLabel: 'ERR', title: 'A server retry job needs attention.' };
    }
    if (syncStatus.state === 'syncing') {
      return { tone: 'syncing', label: 'Syncing…', shortLabel: 'DB', title: syncStatus.message ?? 'Cloud sync in progress.' };
    }
    if (syncStatus.state === 'queued' || serverJobs.pending > 0 || serverJobs.processing > 0 || offlineQueued > 0) {
      const pending = serverJobs.pending + serverJobs.processing + offlineQueued;
      return {
        tone: 'queued',
        label: pending ? `${pending} queued` : 'Retry queued',
        shortLabel: 'WAIT',
        title: syncStatus.message ?? 'Changes are queued and will retry automatically.'
      };
    }
    if (syncStatus.state === 'failed') {
      return { tone: 'failed', label: 'Sync failed', shortLabel: 'DB', title: syncStatus.message ?? 'Cloud sync failed.' };
    }
    if (dbStatus === 'offline') {
      return { tone: 'offline', label: 'Cloud offline', shortLabel: 'DB', title: 'Cloud database is offline. Changes are kept locally.' };
    }
    if (dbStatus === 'checking') {
      return { tone: 'checking', label: 'Connecting…', shortLabel: 'DB', title: 'Checking cloud connection.' };
    }
    return {
      tone: syncStatus.state === 'synced' ? 'synced' : 'online',
      label: syncStatus.state === 'synced' ? 'Synced' : 'Cloud online',
      shortLabel: 'DB',
      title: syncStatus.state === 'synced' ? 'Cloud sync complete.' : 'Cloud database online.'
    };
  }, [dbStatus, serverJobs, syncStatus, offlineQueued]);

  const syncActivity = useMemo(() => {
    if (serverJobs.failed > 0) {
      return { tone: 'failed', icon: TriangleAlert, title: 'A cloud operation needs attention', detail: `${serverJobs.failed} server retry job${serverJobs.failed === 1 ? '' : 's'} stopped after repeated or non-retryable failures.` };
    }
    if (syncStatus.state === 'syncing' || serverJobs.processing > 0) {
      return { tone: 'syncing', icon: LoaderCircle, title: 'Saving shared data', detail: syncStatus.message ?? 'The server is committing changes.' };
    }
    if (syncStatus.state === 'queued' || serverJobs.pending > 0 || offlineQueued > 0) {
      const waiting = serverJobs.pending + offlineQueued;
      return { tone: 'queued', icon: Clock3, title: 'Cloud retry scheduled', detail: syncStatus.message ?? `${waiting} operation${waiting === 1 ? '' : 's'} will retry automatically.` };
    }
    return null;
  }, [serverJobs, syncStatus, offlineQueued]);
  const SyncActivityIcon = syncActivity?.icon;
  // Bare chrome for login / root redirect pages.
  if (bare) {
    return <main>{children}</main>;
  }

  return (
    <div className={`app-shell ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-open' : ''}`.trim()}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {mobileOpen ? <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setMobileOpen(false)} /> : null}

      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        pendingHref={pendingHref}
        onNavigate={setNavigatingTo}
        onLogout={handleLogout}
      />

      <div className="app-shell__content">
        <header className="top-nav">
          {pendingHref ? (
            <div className="route-progress" role="status">
              <span className="sr-only">Loading page</span>
            </div>
          ) : null}
          <div className="top-nav__left">
            <button
              className="icon-button top-nav__menu"
              type="button"
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen || !collapsed}
              aria-controls="primary-navigation"
              onClick={handleToggle}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="top-nav__title">
              <Link href={headerBrand.href} className="top-nav__brand-link" title={`${headerBrand.title} Home`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt={`${headerBrand.title} logo`} className="top-nav__logo" />
                <div className="top-nav__brand-text">
                  <strong>{headerBrand.strong}</strong><span>{headerBrand.rest}</span>
                </div>
              </Link>
            </div>
            <div className="module-toggle-pill" role="tablist" aria-label="Active module">
              <button
                type="button"
                role="tab"
                aria-selected={activeModule === 'vehicles'}
                className={`module-pill-btn ${activeModule === 'vehicles' ? 'is-active' : ''}`}
                onClick={() => {
                  setModuleCookie('vehicles');
                  router.push('/dashboard');
                }}
              >
                Fleet
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeModule === 'spaces'}
                className={`module-pill-btn ${activeModule === 'spaces' ? 'is-active' : ''}`}
                onClick={() => {
                  setModuleCookie('spaces');
                  router.push('/spaces');
                }}
              >
                Spaces
              </button>
            </div>
          </div>
          <div className="top-nav__actions">
            <AiCopilotModal />
            <button
              type="button"
              className="icon-button top-nav__cmd"
              aria-label="Open command palette (Ctrl or Cmd + K)"
              title="Command palette (Ctrl/Cmd + K)"
              onClick={() => setPaletteOpen(true)}
            >
              <Command size={16} aria-hidden="true" />
            </button>
            <NotificationBell />
            <ThemeToggle />
            <CloudStatusPopover
              badge={badge}
              dbStatus={dbStatus}
              health={health}
              syncStatus={syncStatus}
              serverJobs={serverJobs}
              offlineQueued={offlineQueued}
              onRecheck={() => recheckRef.current()}
            />
          </div>
        </header>
        {syncActivity && SyncActivityIcon ? (
          <div className={`sync-activity sync-activity--${syncActivity.tone}`} role="status" aria-live="polite">
            <SyncActivityIcon size={17} aria-hidden="true" />
            <span>
              <strong>{syncActivity.title}</strong>
              <small>{syncActivity.detail}</small>
            </span>
            <Link href="/settings" className="sync-activity__action">View activity</Link>
          </div>
        ) : null}

        <main id="main-content">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
