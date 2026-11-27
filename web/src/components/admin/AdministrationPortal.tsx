'use client';

import React, { useState } from 'react';
import { PenTool, Users } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { canViewTeam } from '@/core/domain/offices';
import { SectionSidebar, type SidebarSection } from '../common/SectionSidebar';
import { UserManagement } from './UserManagement';
import { AuthoritySignaturePortal } from './AuthoritySignaturePortal';

type AdministrationSection = 'team' | 'signature';

/** Administration area: team accounts and the issuing authority signature. */
export function AdministrationPortal() {
  const { user } = useAuth();
  const sections: SidebarSection<AdministrationSection>[] = [
    ...(canViewTeam(user) ? [{ id: 'team' as const, label: 'Team', hint: 'Accounts and roles', Icon: Users }] : []),
    { id: 'signature', label: 'Authority Signature', hint: 'Signature on ID cards', Icon: PenTool },
  ];
  const [active, setActive] = useState<AdministrationSection>(sections[0].id);
  return (
    <div className="min-w-0 space-y-4">
      <SectionSidebar title="Administration" storageKey="section-menu" sections={sections} active={active} onChange={setActive} />
      {active === 'team' && canViewTeam(user) && <UserManagement />}
      {active === 'signature' && <AuthoritySignaturePortal />}
    </div>
  );
}
