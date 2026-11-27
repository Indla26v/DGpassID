'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, FileDown, LayoutGrid, MapPinned, ScanLine } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { OperationsHeader } from '../common/OperationsHeader';
import { SectionSidebar, type SidebarSection } from '../common/SectionSidebar';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { ZoneBoard } from './ZoneBoard';
import { PointAssignmentPortal } from './PointAssignmentPortal';
import { PoliceExportPanel } from '../police/PoliceExportPanel';
import { InstructionsBoard } from './InstructionsBoard';
import { ScanIssuePanel } from '../police/ScanIssuePanel';

type ZoneSection = 'board' | 'instructions' | 'points' | 'scan' | 'export';

const baseSections: SidebarSection<ZoneSection>[] = [
  { id: 'board', label: 'Zone Board', hint: 'Sectors, sub-sectors, allotted', Icon: LayoutGrid },
  { id: 'instructions', label: 'Instructions', hint: 'Duty instructions and passports', Icon: ClipboardList },
  { id: 'points', label: 'Duty Points', hint: 'Place officers on points', Icon: MapPinned },
  { id: 'scan', label: 'Scan & Issue', hint: 'Scan ID cards to issue them', Icon: ScanLine },
  { id: 'export', label: 'Export', hint: 'Download your officer list', Icon: FileDown },
];

/** Police Force area for a zone / sector officer, limited to the zones and sectors assigned to them. */
export function ZoneOfficerPortal() {
  const { user } = useAuth();
  const scope = useMemo(() => user.policePrintScope ?? [], [user.policePrintScope]);
  const [active, setActive] = useState<ZoneSection>('board');
  // Number of instructions sent to this area, shown in the menu.
  const [instructionCount, setInstructionCount] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/deployment/instructions', { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data) setInstructionCount(data.instructions.length); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const onInstructionCount = useCallback((count: number) => setInstructionCount(count), []);
  const sections = baseSections.map(section => section.id === 'instructions' && instructionCount
    ? { ...section, hint: `${instructionCount} for your area` }
    : section);
  const area = scope.map(item => {
    const zone = POLICE_BANDOBUSHT_ZONES.find(candidate => candidate.name === item.zone);
    return `Zone ${zone?.number ?? ''} ${item.zone}${item.sector ? ` · ${item.sector}` : ' (whole zone)'}${item.subSector ? ` · ${item.subSector}` : ''}`;
  }).join(', ');

  return (
    <div className="min-w-0 space-y-4">
      <OperationsHeader title="Police Force" description={area ? `Your area: ${area}` : 'No zone or sector is assigned to your account yet.'} />
      <SectionSidebar title="Police Force" storageKey="section-menu" sections={sections} active={active} onChange={setActive} />
      {active === 'board' && <ZoneBoard />}
      {active === 'instructions' && <InstructionsBoard onCount={onInstructionCount} scope={scope} userEmail={user.email} />}
      {active === 'points' && <PointAssignmentPortal embedded />}
      {active === 'scan' && <ScanIssuePanel />}
      {active === 'export' && <PoliceExportPanel knownDistricts={[]} scope={scope} />}
    </div>
  );
}
