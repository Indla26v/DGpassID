'use client';

import React, { useMemo, useState } from 'react';
import { FileDown, LayoutGrid, MapPinned } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { OperationsHeader } from '../common/OperationsHeader';
import { SectionSidebar, type SidebarSection } from '../common/SectionSidebar';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { ZoneBoard } from './ZoneBoard';
import { PointAssignmentPortal } from './PointAssignmentPortal';
import { PoliceExportPanel } from '../police/PoliceExportPanel';

type ZoneSection = 'board' | 'points' | 'export';

const sections: SidebarSection<ZoneSection>[] = [
  { id: 'board', label: 'Zone Board', hint: 'Sectors, sub-sectors, allotted', Icon: LayoutGrid },
  { id: 'points', label: 'Duty Points', hint: 'Place officers on points', Icon: MapPinned },
  { id: 'export', label: 'Export', hint: 'Download your roster', Icon: FileDown },
];

/** Police Force area for a zone / sector officer, limited to the zones and sectors assigned to them. */
export function ZoneOfficerPortal() {
  const { user } = useAuth();
  const scope = useMemo(() => user.policePrintScope ?? [], [user.policePrintScope]);
  const [active, setActive] = useState<ZoneSection>('board');
  const area = scope.map(item => {
    const zone = POLICE_BANDOBUSHT_ZONES.find(candidate => candidate.name === item.zone);
    return `Zone ${zone?.number ?? ''} ${item.zone}${item.sector ? ` · ${item.sector}` : ' (whole zone)'}`;
  }).join(', ');

  return (
    <div className="min-w-0 space-y-4">
      <OperationsHeader title="Police Force" description={area ? `Your area: ${area}` : 'No zone or sector is assigned to your account yet.'} />
      <SectionSidebar title="Police Force" storageKey="section-menu" sections={sections} active={active} onChange={setActive} />
      {active === 'board' && <ZoneBoard />}
      {active === 'points' && <PointAssignmentPortal embedded />}
      {active === 'export' && <PoliceExportPanel knownDistricts={[]} scope={scope} />}
    </div>
  );
}
