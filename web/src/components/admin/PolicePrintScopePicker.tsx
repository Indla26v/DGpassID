'use client';

import { useState } from 'react';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import type { PolicePrintScope } from '@/core/domain/police-print-scope';
import { CustomSelect } from '../common/CustomSelect';
import { PillButton } from '../common/PillButton';

export function PolicePrintScopePicker({ value, onChange }: {
  value: PolicePrintScope[];
  onChange: (scope: PolicePrintScope[]) => void;
}) {
  const [zone, setZone] = useState('');
  const [sector, setSector] = useState('');
  const currentZone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === zone);
  const alreadyIncluded = value.some(item => item.zone === zone && (item.sector === null || item.sector === sector));

  function addAssignment() {
    if (!currentZone || alreadyIncluded) return;
    const existing = sector ? value : value.filter(item => item.zone !== zone);
    onChange([...existing, { zone, sector: sector || null }]);
  }

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold text-police-navy">Allowed police zones and sectors</legend>
      <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <CustomSelect ariaLabel="Assignment zone" value={zone} onChange={next => { setZone(next); setSector(''); }}
          options={[{ value: '', label: 'Choose a zone' }, ...POLICE_BANDOBUSHT_ZONES.map(item => ({ value: item.name, label: `Zone ${item.number} · ${item.name}` }))]} />
        <CustomSelect ariaLabel="Assignment sector" value={sector} onChange={setSector} disabled={!currentZone}
          options={[{ value: '', label: 'All sectors in this zone' }, ...(currentZone?.sectors.map(item => ({ value: item.number, label: `${item.number} · ${item.name}` })) ?? [])]} />
        <PillButton type="button" variant="outline" disabled={!currentZone || alreadyIncluded} onClick={addAssignment}>Add assignment</PillButton>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map(item => (
            <li key={JSON.stringify(item)}>
              <PillButton type="button" variant="secondary" size="sm"
                aria-label={`Remove ${item.zone} · ${item.sector ?? 'All sectors'}`}
                onClick={() => onChange(value.filter(assignment => assignment !== item))}>
                {item.zone} · {item.sector ?? 'All sectors'} <span aria-hidden="true">×</span>
              </PillButton>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
