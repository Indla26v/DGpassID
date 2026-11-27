'use client';

import { useState } from 'react';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { describeScopeArea, type PolicePrintScope } from '@/core/domain/police-print-scope';
import { CustomSelect } from '../common/CustomSelect';
import { PillButton } from '../common/PillButton';

export function PolicePrintScopePicker({ value, onChange }: {
  value: PolicePrintScope[];
  onChange: (scope: PolicePrintScope[]) => void;
}) {
  const [zone, setZone] = useState('');
  const [sector, setSector] = useState('');
  const [subSector, setSubSector] = useState('');
  const currentZone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === zone);
  const currentSector = currentZone?.sectors.find(item => item.number === sector);
  // Already covered by the whole zone, the whole sector, or the same sub-sector.
  const alreadyIncluded = value.some(item => item.zone === zone && (item.sector === null
    || (item.sector === sector && (!item.subSector || item.subSector === subSector))));

  function addAssignment() {
    if (!currentZone || alreadyIncluded) return;
    // A wider assignment replaces the narrower ones inside it (whole zone > whole sector > sub-sector).
    const inside = (item: PolicePrintScope) => item.zone === zone && (!sector || (!subSector && item.sector === sector));
    const added: PolicePrintScope = subSector ? { zone, sector, subSector } : { zone, sector: sector || null };
    onChange([...value.filter(item => !inside(item)), added]);
  }

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold text-police-navy">Allowed police zones, sectors and sub-sectors</legend>
      <div className={`grid items-start gap-2 ${currentSector?.subSectors?.length ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]' : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'}`}>
        <CustomSelect ariaLabel="Assignment zone" value={zone} onChange={next => { setZone(next); setSector(''); setSubSector(''); }}
          options={[{ value: '', label: 'Choose a zone' }, ...POLICE_BANDOBUSHT_ZONES.map(item => ({ value: item.name, label: `Zone ${item.number} · ${item.name}` }))]} />
        <CustomSelect ariaLabel="Assignment sector" value={sector} onChange={next => { setSector(next); setSubSector(''); }} disabled={!currentZone}
          options={[{ value: '', label: 'All sectors in this zone' }, ...(currentZone?.sectors.map(item => ({ value: item.number, label: `${item.number} · ${item.name}` })) ?? [])]} />
        {currentSector?.subSectors?.length ? (
          <CustomSelect ariaLabel="Assignment sub-sector" value={subSector} onChange={setSubSector} wrapValue
            options={[{ value: '', label: 'Whole sector' }, ...currentSector.subSectors.map(item => ({ value: item, label: item }))]} />
        ) : null}
        <PillButton type="button" variant="outline" disabled={!currentZone || alreadyIncluded} onClick={addAssignment}>Add assignment</PillButton>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map(item => (
            <li key={JSON.stringify(item)}>
              <PillButton type="button" variant="secondary" size="sm"
                aria-label={`Remove ${describeScopeArea(item)}`}
                onClick={() => onChange(value.filter(assignment => assignment !== item))}>
                {describeScopeArea(item)} <span aria-hidden="true">×</span>
              </PillButton>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
