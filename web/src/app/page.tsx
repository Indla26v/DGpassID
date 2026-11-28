'use client';

import React, { useState } from 'react';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { ToastProvider } from '@/components/common/Toast';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Navbar, ActivePortal } from '@/components/common/Navbar';
import { DashboardPortal } from '@/components/dashboard/DashboardPortal';
import { CampusAgenciesPortal } from '@/components/admin/CampusAgenciesPortal';
import { AdministrationPortal } from '@/components/admin/AdministrationPortal';
import { PoliceForcePortal } from '@/components/police/PoliceForcePortal';
import { PrintTeamPortal } from '@/components/print/PrintTeamPortal';
import { ZoneOfficerPortal } from '@/components/deployment/ZoneOfficerPortal';
import { isSubdivisionUser } from '@/core/domain/offices';
import { ConnectionStatus } from '@/components/common/ConnectionStatus';
import { AuditLogDrawer } from '@/components/admin/AuditLogDrawer';

function MainWorkspace() {
  const { user } = useAuth();
  const isSubdiv = isSubdivisionUser(user);
  const [activePortal, setActivePortal] = useState<ActivePortal>(
    user.role === 'POLICE_PRINT' ? 'police' : user.role === 'BANDOBAST_OFFICER' ? 'deployment'
      : user.role === 'ADMIN' ? (isSubdiv ? 'admin' : 'dashboard') : 'print'
  );
  const [isAuditOpen, setIsAuditOpen] = useState(false);

  // Guard against unauthorized portal access for sub-divisions (only dashboard and police are excluded)
  const effectivePortal: ActivePortal =
    user.role === 'POLICE_PRINT' ? 'police' : user.role === 'BANDOBAST_OFFICER' ? 'deployment'
      : isSubdiv && (activePortal === 'dashboard' || activePortal === 'police' || activePortal === 'deployment')
      ? 'admin'
      : activePortal;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <Navbar
        activePortal={effectivePortal}
        onPortalChange={setActivePortal}
        onOpenAuditLogs={() => setIsAuditOpen(true)}
      />

      <div className="flex min-w-0 flex-1">
      {((effectivePortal === 'police' && !isSubdiv) || (effectivePortal === 'deployment' && user.role === 'BANDOBAST_OFFICER') || (user.role === 'ADMIN' && (effectivePortal === 'admin' || effectivePortal === 'administration'))) && (
        <aside id="section-sidebar" aria-label="Section menu" className="no-print hidden shrink-0 border-r border-[#071a33] bg-police-navy lg:block" />
      )}
      <main id="workspace" className="no-print workspace-width min-w-0 flex-1 py-4 sm:py-5">
        {effectivePortal === 'dashboard' && !isSubdiv && (
          <DashboardPortal onNavigatePortal={setActivePortal} />
        )}
        {effectivePortal === 'admin' && user.role === 'ADMIN' && <CampusAgenciesPortal />}
        {effectivePortal === 'police' && !isSubdiv && <PoliceForcePortal />}
        {effectivePortal === 'deployment' && user.role === 'BANDOBAST_OFFICER' && <ZoneOfficerPortal />}
        {effectivePortal === 'print' && <PrintTeamPortal passType="CAMPUS" />}
        {effectivePortal === 'administration' && user.role === 'ADMIN' && <AdministrationPortal />}
      </main>
      </div>

      {user.role === 'ADMIN' && (
        <div className="no-print">
          <AuditLogDrawer
            isOpen={isAuditOpen}
            onClose={() => setIsAuditOpen(false)}
          />
        </div>
      )}

      <footer className="no-print bg-[#061527] text-slate-400 border-t border-slate-800 py-4 px-6 text-center text-xs mt-auto">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <ConnectionStatus />
          <div>61st All India DGPs / IGPs Conference · 2026</div>
          <div className="text-slate-400">Official Andhra Pradesh Police Pass Protocol</div>
        </div>
      </footer>
    </div>
  );
}

export default function HomePage() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <MainWorkspace />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
