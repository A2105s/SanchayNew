'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Lock, User, ArrowLeft } from 'lucide-react';
import Grainient from '@/components/ui/Grainient';
import { StationPicker, type StationOption } from '@/components/login/StationPicker';

/** Only allow relative, single-slash paths (blocks //evil.com and absolute URLs). */
function safeNext(next: string | null, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/dashboard';
  return next;
}

const DEMO_ACCOUNTS: { user: string; role: string }[] = [
  { user: 'dm.gwalior', role: 'District Magistrate (IAS) — platform admin & approving authority' },
  { user: 'admin', role: 'Platform administrator' },
  { user: 'org.police', role: 'Police organization admin' },
  { user: 'dept.officer', role: 'Police department officer (approver)' },
  { user: 'org.health', role: 'Health organization admin' },
  { user: 'dept.health', role: 'Health department officer (approver)' },
  { user: 'station.kotwali', role: 'Station officer' },
  { user: 'driver.demo', role: 'Field staff' },
  { user: 'auditor.demo', role: 'Auditor (read-only)' }
];

type LoginMode = 'vehicles' | 'spaces' | 'all';

function LoginForm() {
  const searchParams = useSearchParams();
  const mode: LoginMode = searchParams.get('mode') === 'vehicles' ? 'vehicles' : searchParams.get('mode') === 'spaces' ? 'spaces' : 'all';
  const next = safeNext(searchParams.get('next'), mode === 'spaces' ? '/spaces' : '/dashboard');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [station, setStation] = useState<StationOption | null>(null);
  const [stations, setStations] = useState<StationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const stationLogin = mode === 'vehicles';
  const departmentLogin = mode === 'spaces';

  // The landing page chooses the section; a bare /login goes back to the chooser
  // so the vehicles (station) and spaces (department) logins stay separate.
  const router = useRouter();
  useEffect(() => {
    if (mode === 'all') router.replace('/');
  }, [mode, router]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/stations')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.data) setStations(j.data as StationOption[]); })
      .catch(() => { /* username entry still works without the directory */ });
    return () => { cancelled = true; };
  }, []);

  const effectiveUsername = stationLogin ? station?.username ?? '' : username;

  const heading = useMemo(() => {
    if (stationLogin) return { title: 'Station sign-in', sub: 'Police stations request and share vehicles between each other.' };
    if (departmentLogin) return { title: 'Department sign-in', sub: 'Civic spaces and platform administration.' };
    return { title: 'Sign in', sub: 'Public Asset Intelligence' };
  }, [stationLogin, departmentLogin]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!effectiveUsername.trim() || !password.trim()) {
      setError(stationLogin ? 'Choose your police station and enter the password.' : 'Please enter your username and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: effectiveUsername, password })
      });
      if (res.ok) {
        // Remember which module this login belongs to (drives the shell navigation)
        document.cookie = `sanchay_module=${mode === 'spaces' ? 'spaces' : 'vehicles'}; path=/; max-age=2592000; SameSite=Lax`;
        window.location.href = next;
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Authentication failed. Check your credentials and try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
        <Grainient
          color1="#dff4f6"
          color2="#0a7f8c"
          color3="#ffffff"
          timeSpeed={0.12}
          colorBalance={-0.1}
          warpStrength={2.0}
          warpFrequency={4.5}
          warpSpeed={0.8}
          warpAmplitude={35.0}
          blendAngle={45.0}
          blendSoftness={0.06}
          rotationAmount={200.0}
          noiseScale={1.2}
          grainAmount={0.05}
          grainScale={1.8}
          grainAnimated
          contrast={1.15}
          gamma={0.85}
          saturation={1.05}
          centerX={0.0}
          centerY={0.0}
          zoom={0.95}
        />
      </div>

      <div className="login-card">
        <div className="login-card__header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Sanchay logo" className="login-card__logo" />
          <h1>
            <strong>San</strong>
            <span>chay</span>
          </h1>
          <p>{heading.title} — {heading.sub}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error ? (
            <div className="login-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {mode === 'all' ? (
            <div className="login-back">
              <Link href="/"><ArrowLeft size={13} aria-hidden="true" /> Choose a section instead</Link>
            </div>
          ) : null}

          {stationLogin ? (
            <div className="login-field">
              <label>Police station</label>
              <StationPicker stations={stations} value={station?.username ?? null} onSelect={setStation} />
            </div>
          ) : (
            <div className="login-field">
              <label htmlFor="username">{departmentLogin ? 'Department username' : 'Username'}</label>
              <div className="login-field__input-wrap">
                <User className="login-field__icon" size={18} aria-hidden="true" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={departmentLogin ? 'e.g. dept.health' : 'Enter username'}
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
            </div>
          )}

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <div className="login-field__input-wrap">
              <Lock className="login-field__icon" size={18} aria-hidden="true" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                disabled={loading}
                autoComplete="current-password"
                className="login-field__password-input"
              />
              <button
                type="button"
                className="login-field__password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                disabled={loading}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? 'Authenticating…' : stationLogin ? 'Sign in to station' : 'Sign in'}
          </button>
        </form>

        {stationLogin ? (
          <details className="login-demo">
            <summary>Demo stations</summary>
            <div className="login-demo__list">
              {stations.slice(0, 8).map((s) => (
                <button key={s.username} type="button" className="login-demo__user" title={s.station} onClick={() => { setStation(s); setPassword('Sanchay@Demo1'); }}>
                  {s.station.replace(' Police Station', '')}
                </button>
              ))}
              <small className="text-muted" style={{ flexBasis: '100%', marginTop: 4 }}>
                Every station shares the demo password Sanchay@Demo1. Station officers see only their own fleet.
              </small>
            </div>
          </details>
        ) : (
          <details className="login-demo">
            <summary>Demo accounts</summary>
            <div className="login-demo__list">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.user} type="button" className="login-demo__user" title={a.role} onClick={() => { setUsername(a.user); setStation(null); setPassword('Sanchay@Demo1'); }}>
                  {a.user}
                </button>
              ))}
              <small className="text-muted" style={{ flexBasis: '100%', marginTop: 4 }}>
                Click a name to fill it in — demo password Sanchay@Demo1 (auto-fills). The DM (IAS) oversees as admin and court authority.
              </small>
            </div>
          </details>
        )}

        <div className="login-footer">
          <p className="login-footer__disclaimer">Authorized personnel only.</p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-screen" aria-busy="true" />}>
      <LoginForm />
    </Suspense>
  );
}
