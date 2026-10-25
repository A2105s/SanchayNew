'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Lock, User } from 'lucide-react';
import Grainient from '@/components/ui/Grainient';

/** Only allow relative, single-slash paths (blocks //evil.com and absolute URLs). */
function safeNext(next: string | null): string {
  if (!next) return '/dashboard';
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/dashboard';
  return next;
}

const DEMO_ACCOUNTS: { user: string; role: string }[] = [
  { user: 'admin', role: 'Platform administrator' },
  { user: 'org.police', role: 'Police organization admin' },
  { user: 'dept.officer', role: 'Police department officer (approver)' },
  { user: 'org.health', role: 'Health organization admin' },
  { user: 'dept.health', role: 'Health department officer (approver)' },
  { user: 'station.kotwali', role: 'Station officer' },
  { user: 'driver.demo', role: 'Field staff' },
  { user: 'auditor.demo', role: 'Auditor (read-only)' }
];

function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
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
          <p>Public Asset Intelligence</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error ? (
            <div className="login-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="login-field">
            <label htmlFor="username">Username</label>
            <div className="login-field__input-wrap">
              <User className="login-field__icon" size={18} aria-hidden="true" />
              <input
                id="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter username"
                disabled={loading}
                autoComplete="username"
              />
            </div>
          </div>

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
            {loading ? 'Authenticating…' : 'Sign in'}
          </button>
        </form>

        <details className="login-demo">
          <summary>Demo accounts</summary>
          <div className="login-demo__list">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.user} type="button" className="login-demo__user" title={a.role} onClick={() => setUsername(a.user)}>
                {a.user}
              </button>
            ))}
            <small className="text-muted" style={{ flexBasis: '100%', marginTop: 4 }}>Click a name to fill it in. The demo password is printed by the seed command (npm run db:seed).</small>
          </div>
        </details>

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
