'use client';

import { OperationsHeader } from '../common/OperationsHeader';

import React, { useState, useEffect } from 'react';
import { isOfficeId, OFFICES, type OfficeId } from '@/core/domain/offices';
import { OfficePicker } from './OfficePicker';
import { CustomSelect } from '../common/CustomSelect';
import { PillButton } from '../common/PillButton';
import { useAuth } from '@/auth/AuthProvider';
import type { UserRole } from '@/core/domain/entities/user.entity';
import type { PolicePrintScope } from '@/core/domain/police-print-scope';
import { PolicePrintScopePicker } from './PolicePrintScopePicker';
import { Check, Copy, Pencil, RefreshCw } from 'lucide-react';

/** 12-character password with upper, lower, digit and symbol; ambiguous characters (0/O, 1/l/I) left out. */
const PASSWORD_SETS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '@#$%&*?!'];
function randomIndex(max: number) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % max;
}
function generatePassword(length = 12) {
  const all = PASSWORD_SETS.join('');
  const chars = PASSWORD_SETS.map(set => set[randomIndex(set.length)]);
  while (chars.length < length) chars.push(all[randomIndex(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  policePrintScope?: PolicePrintScope[];
  is_active: boolean;
  officeId: OfficeId | null;
}

function PoliceAssignments({ scope }: { scope: PolicePrintScope[] }) {
  if (!scope.length) return <span className="text-slate-500">Unassigned</span>;

  const byZone = new Map<string, string[]>();
  for (const { zone, sector } of scope) {
    const sectors = byZone.get(zone) ?? [];
    sectors.push(sector ?? 'All sectors');
    byZone.set(zone, sectors);
  }

  return (
    <ul className="divide-y divide-slate-100">
      {[...byZone].map(([zone, sectors]) => (
        <li key={zone} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 first:pt-0 last:pb-0">
          <span className="text-sm font-medium text-slate-800">{zone}</span>
          <div className="flex flex-wrap gap-1">
            {sectors.map(sector => (
              <span key={sector} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{sector}</span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
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
  const [copied, setCopied] = useState<'form' | 'created' | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  // Fill the initial password with a generated one (client-side, after mount).
  useEffect(() => { setPassword(generatePassword()); }, []);
  const copyText = async (text: string, which: 'form' | 'created') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(current => (current === which ? null : current)), 1500);
    } catch { /* clipboard unavailable: the password stays visible to copy by hand */ }
  };
  const [role, setRole] = useState<UserRole>('PRINT_TEAM');
  const [policePrintScope, setPolicePrintScope] = useState<PolicePrintScope[]>([]);
  const [editingScope, setEditingScope] = useState<{ id: string; name: string; scope: PolicePrintScope[] } | null>(null);

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
    setCreated(null);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, officeId: role === 'ADMIN' ? officeId || null : null, policePrintScope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      setCreated({ email, password });
      setName('');
      setEmail('');
      setPassword(generatePassword());
      setPolicePrintScope([]);
      setSuccess('Account created. Share the credentials with the operator securely.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  };

  const saveScope = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingScope) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingScope.id, policePrintScope: editingScope.scope }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not save assignments.');
      setEditingScope(null);
      setSuccess('Police print assignments updated.');
      await loadUsers();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save assignments.');
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
    <section className="min-w-0 space-y-4">
      <OperationsHeader
        title="Team & permissions"
        description="Manage approval and print accounts. Disabling an account immediately revokes its active sessions."
      />

      <div className="operations-enter grid gap-3 sm:grid-cols-2">
        <div className="operations-panel p-4">
          <h3 className="font-semibold text-[#0B2545]">Administrator</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Manage passes, approve or revoke access, configure departments and signatures, manage accounts and view audit logs.
          </p>
        </div>
        <div className="operations-panel p-4">
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
        <div role="status" className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p>{success}</p>
          {created && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{created.email}</span>
              <code className="rounded-full bg-white px-3 py-1 font-mono text-sm tracking-wide text-slate-900 ring-1 ring-emerald-200">{created.password}</code>
              <PillButton type="button" variant="outline" size="sm"
                icon={copied === 'created' ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
                onClick={() => void copyText(`${created.email}\n${created.password}`, 'created')}>
                {copied === 'created' ? 'Copied' : 'Copy login'}
              </PillButton>
              <span className="text-xs text-emerald-700">Shown once; it is not stored in readable form.</span>
            </div>
          )}
        </div>
      )}

      <form className="operations-panel space-y-3 p-4 sm:p-5" onSubmit={handleCreateUser}>
        <h3 className="font-semibold text-[#0B2545]">Add a team member</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-slate-600">
            Full name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="operations-input mt-1.5 px-3.5"
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
              className="operations-input mt-1.5 px-3.5"
            />
          </label>
          <div className="text-xs font-medium text-slate-600">
            <label htmlFor="initial-password">Initial password</label>
            <div className="relative mt-1.5">
              <input
                id="initial-password"
                required
                type="text"
                spellCheck={false}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="operations-input pl-3.5 pr-[4.5rem] font-mono tracking-wide"
              />
              <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5">
                <button type="button" title="Generate a new password" aria-label="Generate a new password"
                  onClick={() => setPassword(generatePassword())}
                  className="grid size-7 place-items-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-police-navy">
                  <RefreshCw aria-hidden="true" className="size-3.5" />
                </button>
                <button type="button" title="Copy password" aria-label="Copy password" disabled={!password}
                  onClick={() => void copyText(password, 'form')}
                  className="grid size-7 place-items-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-police-navy disabled:opacity-40">
                  {copied === 'form' ? <Check aria-hidden="true" className="size-3.5 text-emerald-600" /> : <Copy aria-hidden="true" className="size-3.5" />}
                </button>
              </span>
            </div>
            <span className="mt-1 block text-[11px] text-slate-400">Generated automatically (12 characters). You can change it.</span>
          </div>
          <div className="min-w-0">
            <span aria-hidden="true" className="block text-xs font-medium text-slate-600">Permission role</span>
            <CustomSelect
              ariaLabel="Permission role"
              value={role}
              onChange={(value) => setRole(value as UserRole)}
              options={[{ value: 'PRINT_TEAM', label: 'Print team' }, { value: 'POLICE_PRINT', label: 'Police print operator' }, { value: 'BANDOBAST_OFFICER', label: 'Zone / sector officer (duty points)' }, { value: 'ADMIN', label: 'Administrator' }]}
              className="mt-1.5"
            />
          </div>
          {role === 'ADMIN' && (
            <OfficePicker label="Office" value={officeId} onChange={value => setOfficeId(isOfficeId(value) ? value : '')}
              emptyLabel={user.officeId ? undefined : 'System administrator'} />
          )}
        </div>
        {(role === 'POLICE_PRINT' || role === 'BANDOBAST_OFFICER') && <PolicePrintScopePicker value={policePrintScope} onChange={setPolicePrintScope} />}
        <PillButton type="submit" variant="crimson" disabled={loading || ((role === 'POLICE_PRINT' || role === 'BANDOBAST_OFFICER') && !policePrintScope.length)}>
          {loading ? 'Creating account…' : 'Create account'}
        </PillButton>
      </form>

      {editingScope && (
        <form className="operations-panel space-y-3 p-4" onSubmit={saveScope}>
          <h3 className="font-semibold text-police-navy">Zone / sector assignments for {editingScope.name}</h3>
          <PolicePrintScopePicker value={editingScope.scope}
            onChange={scope => setEditingScope(current => current && { ...current, scope })} />
          <div className="flex flex-wrap gap-2">
            <PillButton type="submit" variant="crimson" disabled={loading || !editingScope.scope.length}>Save assignments</PillButton>
            <PillButton type="button" variant="outline" disabled={loading} onClick={() => setEditingScope(null)}>Cancel</PillButton>
          </div>
        </form>
      )}
      <div role="region" aria-label="Team accounts" tabIndex={0} className="operations-panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-4">Team member</th>
              <th className="p-4">Role</th>
              <th className="p-4">Office / assigned zones</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
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
                  {u.role === 'ADMIN' ? 'Administrator' : u.role === 'POLICE_PRINT' ? 'Police print operator' : u.role === 'BANDOBAST_OFFICER' ? 'Zone / sector officer' : 'Print team'}
                </td>
                <td className="p-4">{u.role === 'POLICE_PRINT' || u.role === 'BANDOBAST_OFFICER'
                  ? <PoliceAssignments scope={u.policePrintScope ?? []} />
                  : OFFICES.find(office => office.id === u.officeId)?.name ?? (u.role === 'ADMIN' ? 'System-wide' : 'Unassigned')}</td>
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
                <td className="p-4 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {(u.role === 'POLICE_PRINT' || u.role === 'BANDOBAST_OFFICER') && (
                      <PillButton type="button" variant="outline" size="sm" disabled={loading} className="whitespace-nowrap"
                        icon={<Pencil aria-hidden="true" className="size-3.5" />}
                        onClick={() => setEditingScope({ id: u.id, name: u.name, scope: u.policePrintScope || [] })}>
                        Edit assignments
                      </PillButton>
                    )}
                  {u.id === user.id || (user.officeId === "district" && u.role === "ADMIN" && !u.officeId) ? (
                    <span className="text-xs text-slate-400">{u.id === user.id ? "Your account" : "System administrator"}</span>
                  ) : (
                    <button
                      type="button"
                      disabled={loading}
                      className="operations-action whitespace-nowrap border border-police-crimson/30 px-3 py-1 text-xs font-semibold text-police-crimson hover:bg-rose-50 disabled:opacity-40"
                      onClick={() => handleToggleActive(u)}
                    >
                      {u.is_active ? 'Disable account' : 'Enable account'}
                    </button>
                  )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
