'use client';

import React, { useState, useEffect } from 'react';
import { isOfficeId, OFFICES, type OfficeId } from '@/core/domain/offices';
import { OfficePicker } from './OfficePicker';
import { useAuth } from '@/auth/AuthProvider';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'PRINT_TEAM';
  is_active: boolean;
  officeId: OfficeId | null;
}

export const UserManagement: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'PRINT_TEAM'>('PRINT_TEAM');

  const [officeId, setOfficeId] = useState<OfficeId | ''>(user.officeId === 'district' ? 'district' : '');

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load accounts.');
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, officeId: role === 'ADMIN' ? officeId || null : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      setName('');
      setEmail('');
      setPassword('');
      setSuccess('Account created. Share the credentials with the operator securely.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (targetUser: UserRecord) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetUser.id, is_active: !targetUser.is_active }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update user');
      }
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change access.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[#8B1A1A]">Administration</p>
        <h2 className="mt-2 text-3xl font-semibold text-[#0B2545]">Team & permissions</h2>
        <p className="mt-2 text-sm text-slate-500">
          Create separate accounts for approval and print production. Disable an account to revoke its active sessions immediately.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-[#0B2545]">Administrator</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Manage passes, approve or revoke access, configure departments and signatures, manage accounts and view audit logs.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-[#0B2545]">Print team</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Submit and edit pending passes, view the print queue, print approved cards and record reprints.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800 border border-rose-200">
          {error}
        </p>
      )}

      {success && (
        <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-200">
          {success}
        </p>
      )}

      <form className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-sm" onSubmit={handleCreateUser}>
        <h3 className="font-semibold text-[#0B2545]">Add a team member</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-slate-600">
            Full name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Email
            <input
              required
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Initial password
            <input
              required
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
            />
            <span className="mt-1 block text-slate-400 text-[11px]">At least 12 characters</span>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Permission role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'ADMIN' | 'PRINT_TEAM')}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
            >
              <option value="PRINT_TEAM">Print team</option>
              <option value="ADMIN">Administrator</option>
            </select>
          </label>
          {role === 'ADMIN' && (
            <OfficePicker label="Office" value={officeId} onChange={value => setOfficeId(isOfficeId(value) ? value : '')}
              emptyLabel={user.officeId ? undefined : 'System administrator'} />
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-[#0B2545] px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#123863] transition-all disabled:opacity-50"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-4">Team member</th>
              <th className="p-4">Role</th>
              <th className="p-4">Office</th>
              <th className="p-4">Status</th>
              <th className="p-4">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="p-4">
                  <p className="font-medium text-slate-800">{u.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{u.email}</p>
                </td>
                <td className="p-4 text-slate-700">
                  {u.role === 'ADMIN' ? 'Administrator' : 'Print team'}
                </td>
                <td className="p-4">{OFFICES.find(office => office.id === u.officeId)?.name ?? (u.role === "ADMIN" ? "System-wide" : "Unassigned")}</td>
                <td className="p-4">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      u.is_active
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {u.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="p-4">
                  {u.id === user.id || (user.officeId === "district" && u.role === "ADMIN" && !u.officeId) ? (
                    <span className="text-xs text-slate-400">{u.id === user.id ? "Your account" : "System administrator"}</span>
                  ) : (
                    <button
                      type="button"
                      disabled={loading}
                      className="rounded-full px-3 py-1 text-xs font-semibold text-[#8B1A1A] hover:bg-rose-50 border border-[#8B1A1A]/30 transition disabled:opacity-40"
                      onClick={() => handleToggleActive(u)}
                    >
                      {u.is_active ? 'Disable account' : 'Enable account'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default UserManagement;

