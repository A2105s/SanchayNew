'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getActiveTheme, setTheme, subscribeTheme, type ThemeMode } from '@/lib/theme/theme';

// Server and first client render both use 'light'; React then re-syncs to the real
// theme (already applied to <html> by the pre-paint script), so there is no hydration mismatch.
const getServerSnapshot = (): ThemeMode => 'light';

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getActiveTheme, getServerSnapshot);
  const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${next} theme`;

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      suppressHydrationWarning
    >
      {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
