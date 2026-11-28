'use client';

import React, { useState, useEffect, useId } from 'react';
import {
  POLICE_BANDOBUSHT_ZONES,
  SECURITY_COMPONENTS_LIST,
} from '@/core/domain/police-zones';
import { Pencil, ShieldCheck } from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { PillButton } from './PillButton';

interface PoliceBandobusthSelectorProps {
  zone?: string | null;
  sectorNumber?: string | null;
  sectorName?: string | null;
  customSector?: string | null;
  securityComponent?: string | null;
  onChange: (updates: {
    police_zone: string;
    police_sector_number: string;
    police_sector_name: string;
    police_custom_sector?: string;
    security_component?: string;
  }) => void;
  loading?: boolean;
  collapsible?: boolean;
  saveCustomLocationOnBlur?: boolean;
}

export const PoliceBandobusthSelector: React.FC<PoliceBandobusthSelectorProps> = ({
  zone,
  sectorNumber,
  sectorName,
  customSector,
  securityComponent,
  onChange,
  loading = false,
  collapsible = false,
  saveCustomLocationOnBlur = false,
}) => {
  const headingId = useId();
  const locationId = useId();
  const fieldsId = useId();
  const [editing, setEditing] = useState(false);
  const showFields = !collapsible || editing;
  const [selectedZoneId, setSelectedZoneId] = useState<string>(() => {
    const found = POLICE_BANDOBUSHT_ZONES.find(
      (z) => z.name.toLowerCase() === (zone || '').toLowerCase() || z.id === zone
    );
    // An officer with no zone shows "Not yet allotted" (it used to pre-fill Zone 6, which a later change could save).
    return found ? found.id : '';
  });

  const [selectedSectorNumber, setSelectedSectorNumber] = useState<string>(sectorNumber || '');
  const [selectedSectorName, setSelectedSectorName] = useState<string>(sectorName || '');
  const [customInput, setCustomInput] = useState<string>(customSector || '');
  const [selectedSecurityComponent, setSelectedSecurityComponent] = useState<string>(
    securityComponent || 'None'
  );
  const currentZone = POLICE_BANDOBUSHT_ZONES.find((z) => z.id === selectedZoneId);

  // Sync internal state with external props when they change
  useEffect(() => {
    if (zone) {
      const found = POLICE_BANDOBUSHT_ZONES.find(
        (z) => z.name.toLowerCase() === zone.toLowerCase() || z.id === zone
      );
      if (found) setSelectedZoneId(found.id);
    }
    if (sectorNumber) setSelectedSectorNumber(sectorNumber);
    if (sectorName) setSelectedSectorName(sectorName);
    if (customSector !== undefined) setCustomInput(customSector || '');
    if (securityComponent) setSelectedSecurityComponent(securityComponent);
  }, [zone, sectorNumber, sectorName, customSector, securityComponent]);

  const handleZoneChange = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    const z = POLICE_BANDOBUSHT_ZONES.find((item) => item.id === zoneId);
    if (!z) {
      // "Not yet allotted": clear the posting.
      setSelectedSectorNumber('');
      setSelectedSectorName('');
      onChange({ police_zone: '', police_sector_number: '', police_sector_name: '', police_custom_sector: undefined, security_component: undefined });
      return;
    }
    if (z.sectors.length === 0) return;

    const firstSector = z.sectors[0];
    const newSectorNum = firstSector.number;
    const newSectorName = firstSector.name;

    setSelectedSectorNumber(newSectorNum);
    setSelectedSectorName(newSectorName);

    onChange({
      police_zone: z.name,
      police_sector_number: newSectorNum,
      police_sector_name: newSectorName,
      police_custom_sector: undefined,
      security_component: selectedSecurityComponent !== 'None' ? selectedSecurityComponent : undefined,
    });
  };

  const handleSectorChange = (sNum: string) => {
    if (!currentZone) return;
    const s = currentZone.sectors.find((item) => item.number === sNum);
    if (!s) return;

    setSelectedSectorNumber(s.number);
    setSelectedSectorName(s.name);

    onChange({
      police_zone: currentZone.name,
      police_sector_number: s.number,
      police_sector_name: s.name,
      police_custom_sector: undefined,
      security_component: selectedSecurityComponent !== 'None' ? selectedSecurityComponent : undefined,
    });
  };

  const handleSubSectorChange = (subName: string) => {
    if (!currentZone) return;
    setSelectedSectorName(subName);

    onChange({
      police_zone: currentZone.name,
      police_sector_number: selectedSectorNumber,
      police_sector_name: subName,
      police_custom_sector: subName === 'OTHERS' ? customInput.toUpperCase() : undefined,
      security_component: selectedSecurityComponent !== 'None' ? selectedSecurityComponent : undefined,
    });
  };

  const handleCustomInputChange = (text: string) => {
    const upper = text.toUpperCase();
    setCustomInput(upper);
    if (!currentZone) return;

    onChange({
      police_zone: currentZone.name,
      police_sector_number: selectedSectorNumber,
      police_sector_name: selectedSectorName,
      police_custom_sector: upper,
      security_component: selectedSecurityComponent !== 'None' ? selectedSecurityComponent : undefined,
    });
  };

  const handleSecurityComponentChange = (comp: string) => {
    setSelectedSecurityComponent(comp);
    if (!currentZone) return;

    onChange({
      police_zone: currentZone.name,
      police_sector_number: selectedSectorNumber,
      police_sector_name: selectedSectorName,
      police_custom_sector: customInput || undefined,
      security_component: comp !== 'None' ? comp : undefined,
    });
  };

  const currentSectorObj = currentZone?.sectors.find((s) => s.number === selectedSectorNumber);
  const subSectors = currentSectorObj?.subSectors ?? [];
  const fields = [
    {
      label: 'Bandobusth zone',
      value: selectedZoneId,
      onChange: handleZoneChange,
      options: [{ value: '', label: 'Not yet allotted' }, ...POLICE_BANDOBUSHT_ZONES.map((item) => ({ value: item.id, label: `Zone ${item.number}: ${item.name}` }))],
      fullWidth: true,
    },
    // The sector box appears once a zone is chosen.
    ...(currentZone ? [{
      label: 'Assigned sector',
      value: selectedSectorNumber,
      onChange: handleSectorChange,
      options: currentZone.sectors.map((item) => ({ value: item.number, label: `${item.number}: ${item.name}` })),
      fullWidth: true,
    }] : []),
    ...(subSectors.length ? [{
      label: 'Sub-sector / location',
      placeholder: 'Choose a sub-sector',
      value: selectedSectorName,
      onChange: handleSubSectorChange,
      options: subSectors.map((item) => ({ value: item, label: item })),
      searchable: subSectors.length > 8,
      fullWidth: true,
      showCustomLocation: selectedSectorName === 'OTHERS',
    }] : []),
    {
      label: 'Security component',
      value: selectedSecurityComponent,
      onChange: handleSecurityComponentChange,
      fullWidth: true,
      options: [
        { value: 'None', label: 'None (standard duty)' },
        ...SECURITY_COMPONENTS_LIST.map((item) => ({ value: item, label: item })),
      ],
    },
  ];

  return (
    <section aria-labelledby={headingId} className="operations-panel space-y-3 px-3 py-3.5 sm:px-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-rose-50 text-police-crimson">
            <ShieldCheck aria-hidden="true" className="size-4" />
          </span>
          <h3 id={headingId} className="text-sm font-semibold text-police-navy">Bandobusth duty assignment</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {loading && <span role="status" className="text-xs font-medium text-slate-700">Saving…</span>}
          {collapsible && (
            <PillButton
              variant="outline"
              size="sm"
              aria-label={editing ? 'Hide duty assignment editor' : 'Edit duty assignment'}
              aria-expanded={editing}
              aria-controls={fieldsId}
              onClick={() => setEditing(!editing)}
              icon={editing ? undefined : <Pencil aria-hidden="true" className="size-3.5" />}
            >
              {editing ? 'Hide' : 'Edit'}
            </PillButton>
          )}
        </div>
      </div>

      {collapsible && !editing && (
        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p className="font-semibold text-police-navy">{zone || 'Zone unassigned'}</p>
          {(sectorNumber || sectorName) && (
            <p className="mt-0.5 line-clamp-2">{[sectorNumber, sectorName === 'OTHERS' && customSector ? customSector : sectorName].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      )}

      <div id={fieldsId} hidden={!showFields} className={showFields ? 'grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2' : undefined}>
        {fields.map(({ label, value, onChange: change, options, placeholder, searchable, fullWidth, showCustomLocation }) => (
          <div key={label} className={`min-w-0 space-y-1 ${fullWidth ? 'sm:col-span-2' : ''}`}>
            <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">{label}</span>
            <CustomSelect
              ariaLabel={label}
              value={value}
              onChange={change}
              options={options}
              placeholder={placeholder}
              searchable={searchable}
              disabled={loading || options.length === 0}
              wrapValue
            />
            {showCustomLocation && (
              <div className="pt-2">
                <label htmlFor={locationId} className="mb-1 block text-xs font-semibold text-slate-700">Custom location</label>
                <input
                  id={locationId}
                  type="text"
                  value={customInput}
                  disabled={loading}
                  onChange={(event) => {
                    if (saveCustomLocationOnBlur) setCustomInput(event.target.value.toUpperCase());
                    else handleCustomInputChange(event.target.value);
                  }}
                  onBlur={() => {
                    if (saveCustomLocationOnBlur && customInput !== (customSector || '')) {
                      handleCustomInputChange(customInput);
                    }
                  }}
                  placeholder="Enter the location name"
                  className="operations-input px-3.5 uppercase placeholder:normal-case"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
