'use client';

import React, { useState } from 'react';
import { Shield, Printer } from 'lucide-react';
import { HeaderLogo } from '@/components/common/HeaderLogo';
import { AppLogo } from '@/components/common/AppLogo';
import { AuthUser } from './AuthProvider';

interface LoginProps {
  onSignedIn: (user: AuthUser) => void;
}

export const Login: React.FC<LoginProps> = ({ onSignedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to sign in.');
      }
      setPassword('');
      onSignedIn(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen bg-[#061527] p-6 items-center justify-center">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl md:grid-cols-2">
        <section className="bg-[#0B2545] p-10 text-white flex flex-col justify-between gap-12">
          <div>
            <HeaderLogo type="police" size={64} />
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
              Andhra Pradesh Police
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight">
              Duty access.<br />
              Under your control.
            </h1>
            <p className="mt-5 text-sm leading-6 text-slate-300">
              61st All India DGsP / IGPs Conference · 2026<br />
              IISER Tirupati
            </p>
          </div>
          <div className="space-y-4 text-sm">
            <p className="flex gap-3 items-center">
              <Shield className="h-5 w-5 text-amber-300" />
              Admin review & access control
            </p>
            <p className="flex gap-3 items-center">
              <Printer className="h-5 w-5 text-amber-300" />
              Authorized badge production
            </p>
          </div>
        </section>

        <section className="p-8 sm:p-10 flex flex-col justify-center">
          <div className="flex items-center gap-3">
            <AppLogo size={48} />
            <div>
              <p className="text-sm font-bold tracking-wide text-[#0B2545]">CONFERENCE PASS</p>
              <p className="mt-1 text-xs text-slate-500">Duty access management</p>
            </div>
          </div>
          <h2 className="mt-5 text-2xl font-semibold text-[#0B2545]">Sign in to your workspace</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Use your administrator or print team account. Your account determines the tools you can access.
          </p>

          <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              Username or email
              <input
                autoFocus
                required
                type="text"
                autoComplete="username"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
              />
            </label>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">Password</label>
              <div className="relative mt-2">
                <input
                  id="login-password"
                  required
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-3 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
                />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword} aria-controls="login-password"
                  onClick={() => setShowPassword(value => !value)}
                  className="absolute inset-y-1 right-1 rounded-lg px-3 text-xs font-semibold text-[#0B2545] hover:bg-slate-100 focus-visible:outline focus-visible:outline-2">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#8B1A1A] py-3 text-sm font-semibold text-white shadow-md hover:bg-[#731515] transition-all disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-xs leading-5 text-slate-400">
            Contact your administrator for account assistance.
          </p>
        </section>
      </div>
    </main>
  );
};

export default Login;

