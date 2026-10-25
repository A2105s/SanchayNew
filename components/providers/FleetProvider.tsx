'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { usePathname } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { can as clientCan, type Permission } from '@/lib/client/permissions';
import { ensureOfflineFlushWiring } from '@/lib/client/offline-queue';
import { loadRoads, simulateTick, resetSimulator } from '@/lib/client/telemetry-sim';
import type {
  FleetSnapshot,
  LiveDelta,
  OrganizationView,
  SessionUser,
  StationView,
  VehicleView
} from '@/types';

// Poll cadences (ms).
const HEALTH_INTERVAL = 30_000;
const TELEMETRY_INTERVAL = 5_000;
const SIM_INTERVAL = 5_000;

interface CloudHealth {
  resetEpoch?: number | null;
  dataVersion?: string;
  syncJobs?: { pending: number; processing: number; failed: number; completed: number };
}

export interface FleetContextValue {
  snapshot: FleetSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  vehicleById: (id: string) => VehicleView | undefined;
  stationById: (id: string) => StationView | undefined;
  orgById: (id: string | null | undefined) => OrganizationView | undefined;
  /** Live deltas keyed by vehicle id (real overrides simulated). */
  live: Record<string, LiveDelta>;
  /** Snapshot vehicles with live deltas merged over them. */
  liveVehicles: VehicleView[];
  can: (permission: Permission) => boolean;
  me: SessionUser | null;
  /** Count of unread notifications (authoritative from snapshot, refreshed on reload). */
  unreadNotifications: number;
}

const FleetContext = createContext<FleetContextValue | null>(null);

export function useFleet(): FleetContextValue {
  const ctx = useContext(FleetContext);
  if (!ctx) {
    throw new Error('useFleet() must be used within a FleetProvider.');
  }
  return ctx;
}

function mergeLive(vehicle: VehicleView, delta: LiveDelta | undefined): VehicleView {
  if (!delta) return vehicle;
  return {
    ...vehicle,
    lat: delta.lat,
    lng: delta.lng,
    speedKmph: delta.speedKmph,
    heading: delta.heading,
    ignition: delta.ignition,
    status: delta.status,
    fuelPercent: delta.fuelPercent ?? vehicle.fuelPercent,
    lastSeenAt: delta.lastSeenAt
  };
}

export function FleetProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login' || pathname === '/';

  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [loading, setLoading] = useState(!isLogin);
  const [error, setError] = useState<string | null>(null);
  const [realLive, setRealLive] = useState<Record<string, LiveDelta>>({});
  const [simLive, setSimLive] = useState<Record<string, LiveDelta>>({});

  const dataVersionRef = useRef<string | null>(null);
  const snapshotRef = useRef<FleetSnapshot | null>(null);
  snapshotRef.current = snapshot;

  const loadSnapshot = useCallback(async () => {
    try {
      const next = await api.get<FleetSnapshot>('/api/cloud/snapshot');
      setSnapshot(next);
      dataVersionRef.current = next.dataVersion;
      resetSimulator();
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && (err.status === 503 || err.status === 500)) {
        setError('Sanchay cannot reach its database, or the database has no tables yet. If you are running locally, start the database, then run "npm run db:push" and "npm run db:seed" and refresh. On a hosted setup, check DATABASE_URL.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load fleet data.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await loadSnapshot();
  }, [loadSnapshot]);

  // ---- Initial load + offline-queue wiring ----
  useEffect(() => {
    if (isLogin) {
      setLoading(false);
      return;
    }
    ensureOfflineFlushWiring();
    void loadSnapshot();
    void loadRoads();
  }, [isLogin, loadSnapshot]);

  // ---- Health polling (reset epoch, dataVersion change, 401) ----
  useEffect(() => {
    if (isLogin) return;
    let cancelled = false;

    async function checkHealth() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const health = await api.get<CloudHealth>('/api/cloud/health');
        if (cancelled) return;
        const version = health.dataVersion ?? null;
        if (version && dataVersionRef.current && version !== dataVersionRef.current) {
          void loadSnapshot();
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return;
      }
    }

    void checkHealth();
    const id = setInterval(checkHealth, HEALTH_INTERVAL);

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
  }, [isLogin, loadSnapshot]);

  // ---- Real telemetry polling (5s) ----
  useEffect(() => {
    if (isLogin) return;
    let cancelled = false;

    async function pollTelemetry() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const deltas = await api.get<LiveDelta[]>('/api/cloud/telemetry');
        if (cancelled || !Array.isArray(deltas)) return;
        setRealLive((prev) => {
          const next = { ...prev };
          for (const d of deltas) next[d.vehicleId] = { ...d, simulated: false };
          return next;
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return;
      }
    }

    void pollTelemetry();
    const id = setInterval(pollTelemetry, TELEMETRY_INTERVAL);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pollTelemetry();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isLogin]);

  // ---- Simulated telemetry tick (5s) for SIMULATED devices ----
  useEffect(() => {
    if (isLogin) return;
    let cancelled = false;

    async function tick() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const snap = snapshotRef.current;
      if (!snap) return;
      const roads = await loadRoads();
      if (cancelled) return;
      const deltas = simulateTick(snap.vehicles, snap.devices, roads);
      if (!deltas.length) return;
      setSimLive((prev) => {
        const next = { ...prev };
        for (const d of deltas) next[d.vehicleId] = d;
        return next;
      });
    }

    const id = setInterval(tick, SIM_INTERVAL);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isLogin]);

  // ---- Merge: real overrides simulated ----
  const live = useMemo<Record<string, LiveDelta>>(() => {
    return { ...simLive, ...realLive };
  }, [simLive, realLive]);

  const liveVehicles = useMemo<VehicleView[]>(() => {
    if (!snapshot) return [];
    return snapshot.vehicles.map((v) => mergeLive(v, live[v.id]));
  }, [snapshot, live]);

  const vehicleIndex = useMemo(() => {
    const map = new Map<string, VehicleView>();
    for (const v of liveVehicles) map.set(v.id, v);
    return map;
  }, [liveVehicles]);

  const stationIndex = useMemo(() => {
    const map = new Map<string, StationView>();
    if (snapshot) for (const s of snapshot.stations) map.set(s.id, s);
    return map;
  }, [snapshot]);

  const orgIndex = useMemo(() => {
    const map = new Map<string, OrganizationView>();
    if (snapshot) for (const o of snapshot.organizations) map.set(o.id, o);
    return map;
  }, [snapshot]);

  const me = snapshot?.me ?? null;

  const can = useCallback(
    (permission: Permission) => clientCan(me?.role ?? null, permission),
    [me]
  );

  const value = useMemo<FleetContextValue>(
    () => ({
      snapshot,
      loading,
      error,
      refresh,
      vehicleById: (id: string) => vehicleIndex.get(id),
      stationById: (id: string) => stationIndex.get(id),
      orgById: (id: string | null | undefined) => (id ? orgIndex.get(id) : undefined),
      live,
      liveVehicles,
      can,
      me,
      unreadNotifications: snapshot?.unreadNotifications ?? 0
    }),
    [snapshot, loading, error, refresh, vehicleIndex, stationIndex, orgIndex, live, liveVehicles, can, me]
  );

  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>;
}
