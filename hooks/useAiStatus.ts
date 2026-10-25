'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import type { AiHealthResult } from '@/types/ai';

/**
 * Light status check (no provider pings) shared by every AI entry point, so helpers can hide themselves when an
 * administrator turned AI off or no engine is configured. Cached for the page session.
 */
export interface AiStatus {
  ready: boolean; // status has loaded
  enabled: boolean;
  anyConfigured: boolean;
  features: AiHealthResult['features'];
}

const OFF: AiStatus = {
  ready: false,
  enabled: false,
  anyConfigured: false,
  features: { copilot: false, draftRequest: false, polish: false, extractDocument: false, pulse: false }
};

let cached: AiStatus | null = null;
let inflight: Promise<AiStatus> | null = null;
const listeners = new Set<(s: AiStatus) => void>();

function load(force = false): Promise<AiStatus> {
  if (cached && !force) return Promise.resolve(cached);
  if (inflight && !force) return inflight;
  inflight = api
    .get<AiHealthResult>('/api/ai/health?ping=0')
    .then((h) => {
      cached = { ready: true, enabled: h.enabled, anyConfigured: h.anyConfigured, features: h.features };
      listeners.forEach((l) => l(cached as AiStatus));
      return cached;
    })
    .catch(() => {
      cached = { ...OFF, ready: true };
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Call after saving AI settings so open pages react immediately. */
export function refreshAiStatus(): Promise<AiStatus> {
  return load(true);
}

export function useAiStatus(): AiStatus {
  const [status, setStatus] = useState<AiStatus>(cached ?? OFF);
  useEffect(() => {
    listeners.add(setStatus);
    let alive = true;
    void load().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
      listeners.delete(setStatus);
    };
  }, []);
  return status;
}
