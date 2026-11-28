'use client';

import React from 'react';
import { HeaderLogo } from './HeaderLogo';
import { AppLogo } from './AppLogo';
import { LayoutDashboard, ShieldCheck, Building2, Printer, History, LogOut, Settings } from 'lucide-react';
import { OFFICES, isSubdivisionUser } from '@/core/domain/offices';
import { useAuth } from '@/auth/AuthProvider';

export type ActivePortal = 'dashboard' | 'police' | 'deployment' | 'admin' | 'print' | 'administration';

interface NavbarProps {
  activePortal: ActivePortal;
  onPortalChange: (portal: ActivePortal) => void;
  onOpenAuditLogs: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activePortal,
  onPortalChange,
  onOpenAuditLogs,
}) => {
  const { user, signOut } = useAuth();
  const isSubdiv = isSubdivisionUser(user);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, visible: user.role === 'ADMIN' && !isSubdiv },
    { id: 'police', label: 'Police Force', Icon: ShieldCheck, visible: user.role === 'POLICE_PRINT' || (user.role === 'ADMIN' && !isSubdiv) },
    { id: 'deployment', label: 'Police Force', Icon: ShieldCheck, visible: user.role === 'BANDOBAST_OFFICER' },
    { id: 'admin', label: 'Campus & Agencies', Icon: Building2, visible: user.role === 'ADMIN' },
    // Print queues now live inside Police Force and Campus & Agencies; the print team keeps its own page.
    { id: 'print', label: 'ID Print Team', Icon: Printer, visible: user.role === 'PRINT_TEAM' },
    { id: 'administration', label: 'Administration', Icon: Settings, visible: user.role === 'ADMIN' },
  ].filter((item) => item.visible);

  return (
    <header className="no-print relative z-40 bg-[#0B2545] text-white shadow-sm lg:sticky lg:top-0">
      <div className="workspace-width flex items-center justify-between gap-4 py-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <HeaderLogo type="police" size={48} />
          <div className="min-w-0">
            <p className="mb-0.5 text-base font-extrabold uppercase leading-tight tracking-[0.08em] text-white sm:text-[22px]">
              Tirupati District Police
            </p>
            <h1 className="text-sm font-semibold tracking-tight sm:text-lg">
              61st All India DGPs / IGPs Conference <span className="text-slate-300">2026</span><span className="text-slate-300"> · IISER Tirupati</span>
            </h1>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-3 md:flex">
          <AppLogo size={40} />
          <div className="text-right text-[11px] leading-relaxed text-slate-300">
            Conference Pass<br />
            <span className="font-medium text-white">Duty access management</span>
          </div>
          <HeaderLogo type="tirupati-police" size={48} className="rounded-lg p-0.5" />
        </div>
      </div>
      <div className="border-b-2 border-t border-b-[#8B1A1A] border-t-white/10 bg-[#061527]">
        <div className="workspace-width flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
          <nav aria-label="Workspace" className="flex min-w-0 flex-wrap items-center gap-1 sm:flex-1">
            {navItems.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={activePortal === id ? 'page' : undefined}
                onClick={() => onPortalChange(id as ActivePortal)}
                className={`inline-flex min-h-9 items-center gap-1.5 operations-action px-2.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-3 ${
                  activePortal === id
                    ? 'bg-[#8B1A1A] text-white shadow-sm'
                    : 'text-slate-200 hover:bg-[#8B1A1A]/75 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1 self-end">
            <span className="mr-1 hidden max-w-44 truncate text-xs text-slate-300 2xl:block">
              {user.name} · {OFFICES.find(office => office.id === user.officeId)?.name ?? (user.role === 'ADMIN' ? 'Administrator' : user.role === 'POLICE_PRINT' ? 'Police print operator' : user.role === 'BANDOBAST_OFFICER' ? 'Zone / sector officer' : 'Print team')}
            </span>
            {user.role === 'ADMIN' && (
              <button
                type="button"
                onClick={onOpenAuditLogs}
                className="flex min-h-9 items-center gap-1.5 operations-action px-2.5 text-xs font-medium text-slate-300 hover:bg-[#8B1A1A]/75 hover:text-white"
                aria-label="Open audit logs"
              >
                <History className="h-4 w-4" aria-hidden="true" />
                <span>Audit logs</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                signOut();
              }}
              className="flex min-h-9 items-center gap-1.5 operations-action px-2.5 text-xs text-slate-300 hover:bg-[#8B1A1A]/75 hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
