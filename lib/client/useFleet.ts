'use client';

/**
 * Stable client import path for the fleet data hook. The implementation lives in
 * components/providers/FleetProvider so that pages can import a short, side-effect-free
 * path (`@/lib/client/useFleet`) without reaching into the provider module directly.
 */
export { useFleet, type FleetContextValue } from '@/components/providers/FleetProvider';
