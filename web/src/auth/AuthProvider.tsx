'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { SessionUser } from '@/core/domain/entities/user.entity';
import { SESSION_IDLE_MINUTES, SESSION_IDLE_MS } from '@/core/domain/session-lifetime';
import { Login } from './Login';

export interface AuthUser extends SessionUser {
  is_active: boolean;
}

interface AuthContextType {
  user: AuthUser;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const ACTIVITY_KEY = 'dgp-session-activity';
const RENEW_INTERVAL_MS = 30_000;
const IDLE_MESSAGE = `Signed out after ${SESSION_IDLE_MINUTES} minutes of inactivity. Sign in to continue.`;
const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const;

function rememberActivity(time: number | null) {
  try {
    if (time === null) window.localStorage.removeItem(ACTIVITY_KEY);
    else window.localStorage.setItem(ACTIVITY_KEY, String(time));
  } catch {
    // This tab can still enforce its own idle deadline.
  }
}

function lastBrowserActivity() {
  try {
    return Number(window.localStorage.getItem(ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('Authentication context is missing.');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionMessage, setSessionMessage] = useState('');
  const signedIn = Boolean(user);

  useEffect(() => {
    const controller = new AbortController();
    async function checkSession() {
      try {
        const lastActivity = lastBrowserActivity();
        if (lastActivity && Date.now() - lastActivity >= SESSION_IDLE_MS) {
          setSessionMessage(IDLE_MESSAGE);
          return;
        }
        const res = await fetch('/api/auth/session', { cache: 'no-store', signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (controller.signal.aborted) return;
          if (!lastActivity) rememberActivity(Date.now());
          setUser(data.user);
        }
      } catch {
        // Offline or network error
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void checkSession();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!signedIn) return;

    const controller = new AbortController();
    let lastActivity = lastBrowserActivity() || Date.now();
    let lastRenewal = 0;
    let idleTimer: number;
    let signingOut = false;

    function endSession(message: string) {
      signingOut = true;
      setSessionMessage(message);
      setUser(null);
    }

    function checkIdle() {
      window.clearTimeout(idleTimer);
      lastActivity = Math.max(lastActivity, lastBrowserActivity());
      const remaining = SESSION_IDLE_MS - (Date.now() - lastActivity);
      if (remaining <= 0) {
        endSession(IDLE_MESSAGE);
        return true;
      }
      idleTimer = window.setTimeout(checkIdle, remaining);
      return false;
    }

    async function renew() {
      lastRenewal = Date.now();
      try {
        const response = await fetch('/api/auth/session', { method: 'POST', signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          if (!controller.signal.aborted && !signingOut) setUser(data.user);
        } else if (response.status === 401 && !controller.signal.aborted) {
          endSession('Your session ended. Sign in to continue.');
        }
      } catch {
        // The next interaction can retry after connectivity returns.
      }
    }

    function onActivity(event: Event) {
      if (!event.isTrusted || signingOut) return;
      const now = Date.now();
      if (now - lastActivity < 1000 || checkIdle()) return;
      lastActivity = now;
      rememberActivity(now);
      checkIdle();

      if (now - lastRenewal >= RENEW_INTERVAL_MS) void renew();
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== ACTIVITY_KEY) return;
      if (event.newValue === null) endSession('');
      else checkIdle();
    }

    checkIdle();
    for (const event of activityEvents) window.addEventListener(event, onActivity, { passive: true });
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', checkIdle);
    return () => {
      controller.abort();
      window.clearTimeout(idleTimer);
      for (const event of activityEvents) window.removeEventListener(event, onActivity);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', checkIdle);
    };
  }, [signedIn]);

  const signOut = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error();
      rememberActivity(null);
      setUser(null);
      setSessionMessage('');
      setError('');
    } catch {
      setError('Sign out failed. Check your connection and retry.');
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-500">
        Checking your session…
      </div>
    );
  }

  if (!user) {
    return <Login sessionMessage={sessionMessage} onSignedIn={(signedInUser) => {
      rememberActivity(Date.now());
      setSessionMessage('');
      setUser(signedInUser);
    }} />;
  }

  return (
    <AuthContext.Provider value={{ user, signOut }}>
      {error && (
        <div role="alert" className="bg-rose-100 p-3 text-center text-sm text-rose-800">
          {error}
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

