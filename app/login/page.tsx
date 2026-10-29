'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Lock, ArrowLeft, Building2, Car, ShieldCheck } from 'lucide-react';
import Grainient from '@/components/ui/Grainient';
import { StationPicker, type StationOption } from '@/components/login/StationPicker';

/** Only allow relative, single-slash paths (blocks //evil.com and absolute URLs). */
function safeNext(next: string | null, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

export type LoginRole = 'admin' | 'police' | 'spaces';

interface DemoAccount {
  user: string;
  role: string;
  category: 'admin' | 'spaces';
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { user: 'dm.gwalior', role: 'District Magistrate (IAS) — platform admin & approving authority', category: 'admin' },
  { user: 'admin', role: 'Platform administrator', category: 'admin' },
  { user: 'org.police', role: 'Police organization admin', category: 'admin' },
  { user: 'dept.officer', role: 'Police department officer (approver)', category: 'spaces' },
  { user: 'org.health', role: 'Health organization admin', category: 'spaces' },
  { user: 'dept.health', role: 'Health department officer (approver)', category: 'spaces' },
  { user: 'driver.demo', role: 'Field staff', category: 'spaces' },
  { user: 'auditor.demo', role: 'Auditor (read-only)', category: 'spaces' }
];

interface RoleConfig {
  id: LoginRole;
  label: string;
  icon: typeof ShieldCheck;
  title: string;
  sub: string;
  fallbackNext: string;
}

const ROLES: RoleConfig[] = [
  {
    id: 'admin',
    label: 'Admin',
    icon: ShieldCheck,
    title: 'Admin sign-in',
    sub: 'Platform administration and DM governance.',
    fallbackNext: '/dashboard'
  },
  {
    id: 'police',
    label: 'Police station',
    icon: Car,
    title: 'Station sign-in',
    sub: 'Police stations request and share vehicles between each other.',
    fallbackNext: '/dashboard'
  },
  {
    id: 'spaces',
    label: 'Spaces',
    icon: Building2,
    title: 'Spaces sign-in',
    sub: 'Civic spaces and department facility bookings.',
    fallbackNext: '/spaces'
  }
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolve initial role from search query param (e.g. ?mode=vehicles, ?mode=spaces, ?mode=admin)
  const initialMode = searchParams.get('mode');
  const initialRole: LoginRole =
    initialMode === 'admin'
      ? 'admin'
      : initialMode === 'spaces'
        ? 'spaces'
        : 'police'; // default to Police station

  const [role, setRole] = useState<LoginRole>(initialRole);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [station, setStation] = useState<StationOption | null>(null);
  const [stations, setStations] = useState<StationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sync state if user navigates with back/forward buttons
  useEffect(() => {
    const m = searchParams.get('mode');
    if (m === 'admin') setRole('admin');
    else if (m === 'spaces') setRole('spaces');
    else if (m === 'vehicles') setRole('police');
  }, [searchParams]);

  // Load police stations directory for the station picker dropdown
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/stations')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.data) setStations(j.data as StationOption[]);
      })
      .catch(() => {
        /* username entry still works without the directory */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeRoleConfig = useMemo(
    () => ROLES.find((r) => r.id === role) ?? ROLES[1],
    [role]
  );

  const next = safeNext(searchParams.get('next'), activeRoleConfig.fallbackNext);
  const effectiveUsername = role === 'police' ? station?.username ?? '' : username;

  function handleRoleChange(newRole: LoginRole) {
    if (newRole === role) return;
    setRole(newRole);
    setError('');
    setUsername('');
    setStation(null);

    // Sync URL mode parameter without page reload
    const params = new URLSearchParams(searchParams.toString());
    const modeParam = newRole === 'police' ? 'vehicles' : newRole;
    params.set('mode', modeParam);
    router.replace(`/login?${params.toString()}`, { scroll: false });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!effectiveUsername.trim() || !password.trim()) {
      if (role === 'police') {
        setError('Choose your police station and enter the password.');
      } else if (role === 'spaces') {
        setError('Please enter your department username and password.');
      } else {
        setError('Please enter your admin username and password.');
      }
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
        const targetModule = role === 'spaces' ? 'spaces' : 'vehicles';
        document.cookie = `sanchay_module=${targetModule}; path=/; max-age=2592000; SameSite=Lax`;
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

          {/* Small pill switch button: Admin, Police station, Spaces (just icons) */}
          <div className="login-role-pill" role="tablist" aria-label="Select role">
            {ROLES.map((r) => {
              const Icon = r.icon;
              const isActive = role === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`login-role-pill__btn ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleRoleChange(r.id)}
                  title={r.label}
                  aria-label={r.label}
                  data-tooltip={r.label}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="sr-only">{r.label}</span>
                </button>
              );
            })}
          </div>

          <p>{activeRoleConfig.title} — {activeRoleConfig.sub}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error ? (
            <div className="login-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {role === 'police' ? (
            <div className="login-field">
              <label>Police station</label>
              <StationPicker stations={stations} value={station?.username ?? null} onSelect={setStation} />
            </div>
          ) : role === 'spaces' ? (
            <div className="login-field">
              <label htmlFor="username">Department username</label>
              <div className="login-field__input-wrap">
                <Building2 className="login-field__icon" size={18} aria-hidden="true" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="e.g. dept.health or org.health"
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
            </div>
          ) : (
            <div className="login-field">
              <label htmlFor="username">Admin username</label>
              <div className="login-field__input-wrap">
                <ShieldCheck className="login-field__icon" size={18} aria-hidden="true" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="e.g. admin or dm.gwalior"
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
            {loading
              ? 'Authenticating…'
              : role === 'police'
                ? 'Sign in to station'
                : role === 'spaces'
                  ? 'Sign in to spaces'
                  : 'Sign in as Admin'}
          </button>
        </form>

        {role === 'police' ? (
          <details className="login-demo">
            <summary>Demo stations</summary>
            <div className="login-demo__list">
              {stations.slice(0, 8).map((s) => (
                <button
                  key={s.username}
                  type="button"
                  className="login-demo__user"
                  title={s.station}
                  onClick={() => {
                    setStation(s);
                    setPassword('Sanchay@Demo1');
                  }}
                >
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
            <summary>{role === 'admin' ? 'Demo admin accounts' : 'Demo spaces accounts'}</summary>
            <div className="login-demo__list">
              {DEMO_ACCOUNTS.filter((a) => a.category === (role === 'admin' ? 'admin' : 'spaces')).map((a) => (
                <button
                  key={a.user}
                  type="button"
                  className="login-demo__user"
                  title={a.role}
                  onClick={() => {
                    setUsername(a.user);
                    setStation(null);
                    setPassword('Sanchay@Demo1');
                  }}
                >
                  {a.user}
                </button>
              ))}
              <small className="text-muted" style={{ flexBasis: '100%', marginTop: 4 }}>
                {role === 'admin'
                  ? 'Click a name to fill it in — demo password Sanchay@Demo1 (auto-fills). The DM (IAS) oversees as platform admin.'
                  : 'Click a name to fill it in — demo password Sanchay@Demo1 (auto-fills). Department officers manage civic spaces.'}
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
