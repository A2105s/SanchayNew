'use client';

export type UiModule = 'vehicles' | 'spaces';

export const MODULE_COOKIE = 'sanchay_module';

/**
 * The module the operator logged into (chosen on the landing page). Stored as a
 * UI-preference cookie at login; purely navigational — authorization still comes
 * from the session role. Falls back to the current path.
 *
 * The cookie is written before the login redirect, so the first client render
 * already sees the right module — no effect or state needed.
 */
export function useActiveModule(pathname?: string): UiModule {
  if (typeof document === 'undefined') {
    return pathname?.startsWith('/spaces') ? 'spaces' : 'vehicles';
  }
  const match = document.cookie.match(/(?:^|;\s*)sanchay_module=(vehicles|spaces)/);
  return (match?.[1] as UiModule | undefined) ?? (pathname?.startsWith('/spaces') ? 'spaces' : 'vehicles');
}
