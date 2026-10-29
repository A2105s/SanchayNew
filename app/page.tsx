import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Car, Building2, ArrowRight, ShieldCheck, MapPinned, CalendarCheck, Recycle } from 'lucide-react';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * Public landing page: pick a section first. Vehicles uses police-station logins;
 * Spaces uses department logins. Authenticated users go straight to the dashboard.
 */
export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (await verifySessionToken(token)) redirect('/dashboard');

  return (
    <main className="landing">
      <header className="landing__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Sanchay logo" className="landing__logo" />
        <h1>
          <strong>San</strong><span>chay</span>
        </h1>
        <p>Public Asset Intelligence — Gwalior</p>
      </header>

      <p className="landing__tagline">
        Government assets already exist. Sanchay connects the ones lying idle with the departments that need them —
        discover, request, approve, allocate, return. Every step authorized, every action audited.
      </p>

      <section className="landing__cards" aria-label="Choose a section">
        <Link href="/login?mode=vehicles" className="landing-card landing-card--vehicles">
          <div className="landing-card__icon"><Car size={26} aria-hidden="true" /></div>
          <h2>Vehicles</h2>
          <p className="landing-card__desc">
            The police-station fleet: patrol cars, ambulances, seized and idle vehicles. Stations discover and request
            vehicles from each other for a specific period; officers approve; the DM oversees.
          </p>
          <ul className="landing-card__points">
            <li><MapPinned size={13} aria-hidden="true" /> Live map &amp; telemetry</li>
            <li><ShieldCheck size={13} aria-hidden="true" /> Seized-vehicle custody &amp; court cases</li>
            <li><Recycle size={13} aria-hidden="true" /> Idle reuse &amp; GeM disposal</li>
          </ul>
          <span className="landing-card__cta">Station sign-in <ArrowRight size={15} aria-hidden="true" /></span>
        </Link>

        <Link href="/login?mode=spaces" className="landing-card landing-card--spaces">
          <div className="landing-card__icon"><Building2 size={26} aria-hidden="true" /></div>
          <h2>Civic Spaces</h2>
          <p className="landing-card__desc">
            Government rooms, halls and facilities lying vacant while other departments rent. Register spaces, check
            availability, book for a specific period — with approval workflows and full audit.
          </p>
          <ul className="landing-card__points">
            <li><CalendarCheck size={13} aria-hidden="true" /> Availability &amp; booking calendar</li>
            <li><ShieldCheck size={13} aria-hidden="true" /> Request center with approvals</li>
            <li><Recycle size={13} aria-hidden="true" /> Idle-space activation</li>
          </ul>
          <span className="landing-card__cta">Department sign-in <ArrowRight size={15} aria-hidden="true" /></span>
        </Link>
      </section>

      <footer className="landing__foot">
        <p>Authorized personnel only · Pilot: Gwalior, Madhya Pradesh · Team PARAKRAM</p>
      </footer>
    </main>
  );
}
