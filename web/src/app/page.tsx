'use client';

import React, { useState } from 'react';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { ToastProvider } from '@/components/common/Toast';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Navbar, ActivePortal } from '@/components/common/Navbar';
import { AdminPortal } from '@/components/admin/AdminPortal';
import { PrintTeamPortal } from '@/components/print/PrintTeamPortal';
import { canViewTeam } from '@/core/domain/offices';
import { UserManagement } from '@/components/admin/UserManagement';
import { ConnectionStatus } from '@/components/common/ConnectionStatus';
import { AuditLogDrawer } from '@/components/admin/AuditLogDrawer';

function MainWorkspace() {
  const { user } = useAuth();
  const [activePortal, setActivePortal] = useState<ActivePortal>(
    user.role === 'ADMIN' ? 'admin' : 'print'
  );
  const [isAuditOpen, setIsAuditOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <Navbar
        activePortal={activePortal}
        onPortalChange={setActivePortal}
        onOpenAuditLogs={() => setIsAuditOpen(true)}
      />

      <main id="workspace" className="no-print workspace-width flex-1 py-7 sm:py-9">
        {activePortal === 'admin' && user.role === 'ADMIN' && <AdminPortal />}
        {activePortal === 'print' && <PrintTeamPortal />}
        {activePortal === 'users' && canViewTeam(user) && <UserManagement />}
      </main>

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
          <div>61st All India DGsP / IGPs Conference · 2026</div>
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
