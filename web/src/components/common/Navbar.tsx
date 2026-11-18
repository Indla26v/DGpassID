'use client';

import React from 'react';
import { HeaderLogo } from './HeaderLogo';
import { AppLogo } from './AppLogo';
import { Shield, Printer, History, ArrowUpRight, LogOut, Users } from 'lucide-react';
import { canViewTeam, OFFICES } from '@/core/domain/offices';
import { useAuth } from '@/auth/AuthProvider';

export type ActivePortal = 'admin' | 'print' | 'users';

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

  return (
    <header className="no-print sticky top-0 z-40 bg-[#0B2545] text-white shadow-sm">
      <div className="workspace-width flex items-center justify-between gap-4 py-5">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <HeaderLogo type="police" size={48} />
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
              Andhra Pradesh Police · IISER Tirupati
            </p>
            <h1 className="text-sm font-semibold tracking-tight sm:text-lg">
              61st All India DGsP / IGPs Conference <span className="text-slate-300">2026</span>
            </h1>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-3 md:flex">
          <AppLogo size={40} />
          <div className="text-right text-[11px] leading-relaxed text-slate-300">
            Conference Pass<br />
            <span className="font-medium text-white">Duty access management</span>
          </div>
          <HeaderLogo type="iiser" size={48} />
        </div>
      </div>
      <div className="border-t border-white/10 bg-[#061527] border-b-2 border-b-[#8B1A1A]">
        <div className="workspace-width flex items-center justify-between gap-2 py-2">
          <nav aria-label="Workspace" className="flex items-center gap-1 rounded-xl">
            {[
              { id: 'admin', label: 'Admin Portal', Icon: Shield },
              { id: 'print', label: user.role === 'ADMIN' ? 'Print Queue' : 'ID Print Team', Icon: Printer },
              { id: 'users', label: 'Team', Icon: Users },
            ]
              .filter((f) => f.id === 'print' || (f.id === 'users' ? canViewTeam(user) : user.role === 'ADMIN'))
              .map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-current={activePortal === id ? 'page' : undefined}
                  onClick={() => onPortalChange(id as ActivePortal)}
                  className={`flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold transition-all sm:px-5 ${
                    activePortal === id
                      ? id === 'admin'
                        ? 'bg-white text-[#0B2545] shadow-sm'
                        : 'bg-[#8B1A1A] text-white shadow-sm'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-slate-300 lg:block">
              {user.name} · {OFFICES.find(office => office.id === user.officeId)?.name ?? (user.role === 'ADMIN' ? 'Administrator' : 'Print team')}
            </span>
            {user.role === 'ADMIN' && (
              <button
                type="button"
                onClick={onOpenAuditLogs}
                className="flex min-h-10 items-center gap-2 rounded-full px-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white sm:px-3"
                aria-label="Open audit logs"
              >
                <History className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Audit logs</span>
                <ArrowUpRight className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                signOut();
              }}
              className="flex min-h-10 items-center gap-2 rounded-full px-3 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
