import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import { Providers } from '@/components/providers/Providers';
import { THEME_INIT_SCRIPT } from '@/lib/theme/theme';
// Same stylesheet order as EasyLife: base -> controls -> cloud-status -> module styles -> theme (dark) last.
// Fonts (Inter + JetBrains Mono) come from the Google Fonts @import at the top of globals.css, exactly as in EasyLife.
import './globals.css';
import './analytics.css';
import './controls.css';
import './imports.css';
import './settings.css';
import './register.css';
import './cloud-status.css';
import './sanchay-ui.css';
import './vehicles.css';
import './ops.css';
import './theme.css';

export const metadata: Metadata = {
  title: 'Sanchay - Public Asset Intelligence',
  description: 'Fleet-first operations platform for public assets in Gwalior.'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the pre-paint script sets data-theme / color-scheme on <html>.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
