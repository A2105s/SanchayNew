/**
 * Theme (light / dark) helpers for Sanchay.
 *
 * - The active theme lives on <html data-theme="light|dark"> so CSS tokens can switch.
 * - The user's explicit choice is persisted in localStorage (device-local preference).
 * - Before the user chooses, the OS `prefers-color-scheme` setting is followed.
 * - THEME_INIT_SCRIPT runs before first paint (see app/layout.tsx) to prevent a flash.
 *
 * This module is intentionally NOT a client module so the server layout can import
 * THEME_INIT_SCRIPT. Every browser API access below is guarded.
 */

export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'sanchay:theme:v1';
const THEME_CHANGE_EVENT = 'sanchay:theme-change';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function readStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : null;
  } catch {
    return null;
  }
}

export function getSystemTheme(): ThemeMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Theme currently applied to the document (what the user actually sees). */
export function getActiveTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** Apply and persist an explicit user choice. */
export function setTheme(theme: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Persistence is best-effort; the theme still applies for this session.
  }
  applyTheme(theme);
}

export function subscribeTheme(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY && isThemeMode(event.newValue)) applyTheme(event.newValue);
  };
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const onSystemChange = () => {
    if (!readStoredTheme()) applyTheme(getSystemTheme());
  };

  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  media?.addEventListener('change', onSystemChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
    media?.removeEventListener('change', onSystemChange);
  };
}

/**
 * Inline, dependency-free script executed before first paint.
 * Static string (no user input) — safe to inject with dangerouslySetInnerHTML.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=null;try{t=localStorage.getItem('${THEME_STORAGE_KEY}');}catch(e){}if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var d=document.documentElement;d.setAttribute('data-theme',t);d.style.colorScheme=t;}catch(e){}})();`;
