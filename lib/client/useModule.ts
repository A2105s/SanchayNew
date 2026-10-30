'use client';

import { useEffect, useState } from 'react';

export type UiModule = 'vehicles' | 'spaces';

export const MODULE_COOKIE = 'sanchay_module';

export function setModuleCookie(module: UiModule) {
  if (typeof document !== 'undefined') {
    document.cookie = `${MODULE_COOKIE}=${module}; path=/; max-age=2592000; SameSite=Lax`;
    window.dispatchEvent(new Event('module-change'));
  }
}

function getStoredModule(): UiModule {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)sanchay_module=(vehicles|spaces)/);
    if (match?.[1] === 'spaces' || match?.[1] === 'vehicles') {
      return match[1];
    }
  }
  return 'vehicles';
}

/**
 * Resolves the currently active module:
 * - If the URL path is explicitly within /spaces/*, returns 'spaces'.
 * - If the URL path is explicitly within fleet/vehicle operations, returns 'vehicles'.
 * - For shared or root pages (e.g. /audit, /settings), follows the saved user preference cookie.
 */
export function useActiveModule(pathname?: string): UiModule {
  const [cookieModule, setCookieModule] = useState<UiModule>(getStoredModule);

  useEffect(() => {
    const handler = () => {
      setCookieModule(getStoredModule());
    };
    window.addEventListener('module-change', handler);
    return () => window.removeEventListener('module-change', handler);
  }, []);

  if (pathname) {
    if (pathname === '/spaces' || pathname.startsWith('/spaces/')) {
      return 'spaces';
    }
    if (
      pathname === '/dashboard' ||
      pathname.startsWith('/vehicles') ||
      pathname.startsWith('/requests') ||
      pathname.startsWith('/allocations') ||
      pathname.startsWith('/operations') ||
      pathname.startsWith('/stations') ||
      pathname.startsWith('/station') ||
      pathname.startsWith('/transfers') ||
      pathname.startsWith('/compliance') ||
      pathname.startsWith('/maintenance') ||
      pathname.startsWith('/idle') ||
      pathname.startsWith('/incidents') ||
      pathname.startsWith('/iot') ||
      pathname.startsWith('/reports')
    ) {
      return 'vehicles';
    }
  }

  return cookieModule;
}
