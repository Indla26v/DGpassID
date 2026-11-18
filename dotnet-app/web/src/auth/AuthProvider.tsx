import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { OfficeId } from '@/core/domain/offices';
import { Login } from './Login';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'PRINT_TEAM';
  officeId: OfficeId | null;
  is_active: boolean;
}

interface AuthContextType {
  user: AuthUser;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

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

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else if (res.status === 401) {
        setUser(null);
      }
    } catch {
      // Offline or network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
    const interval = window.setInterval(checkSession, 30000);
    window.addEventListener('focus', checkSession);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkSession);
    };
  }, [checkSession]);

  const signOut = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error();
      setUser(null);
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
    return <Login onSignedIn={setUser} />;
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

