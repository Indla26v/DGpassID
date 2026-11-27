'use client';

import React, { useState } from 'react';
import { Building2, FileSpreadsheet, Printer } from 'lucide-react';
import { SectionSidebar, type SidebarSection } from '../common/SectionSidebar';
import { AdminPortal } from './AdminPortal';
import { PrintTeamPortal } from '../print/PrintTeamPortal';
import { ExportPortal } from '../export/ExportPortal';

type CampusSection = 'passes' | 'print' | 'export';

const sections: SidebarSection<CampusSection>[] = [
  { id: 'passes', label: 'Passes', hint: 'Campus & agency ID cards', Icon: Building2 },
  { id: 'print', label: 'Print Queue', hint: 'Approve, print, reprint', Icon: Printer },
  { id: 'export', label: 'Export', hint: 'CSV / PDF lists', Icon: FileSpreadsheet },
];

/** Campus & Agencies area: passes, its own print queue and exports. */
export function CampusAgenciesPortal() {
  const [active, setActive] = useState<CampusSection>('passes');
  return (
    <div className="min-w-0 space-y-4">
      <SectionSidebar title="Campus & Agencies" storageKey="section-menu" sections={sections} active={active} onChange={setActive} />
      {active === 'passes' && <AdminPortal />}
      {active === 'print' && <PrintTeamPortal passType="CAMPUS" />}
      {active === 'export' && <ExportPortal />}
    </div>
  );
}
