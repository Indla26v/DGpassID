'use client';

import React, { useId } from 'react';
import { stationsOfDistrict, type MasterStation } from '@/core/domain/police-stations';

/**
 * Police station text box with the master list of the officer's district as suggestions. Any name can still be
 * typed (e.g. a unit not in the list); suggestions come from the whole state when the district is not known.
 */
export function StationInput({ value, onChange, district, stations, className, ariaLabel, disabled }: {
  value: string;
  onChange: (value: string) => void;
  district?: string | null;
  stations: MasterStation[];
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const options = stationsOfDistrict(stations, district);
  const shown = options.length ? options : stationsOfDistrict(stations);
  return (
    <>
      <input value={value} onChange={event => onChange(event.target.value)} list={listId} disabled={disabled} maxLength={255}
        aria-label={ariaLabel} autoComplete="off"
        placeholder={options.length ? `Choose or type (${options.length} in ${district})` : 'Choose or type a police station'}
        className={className} />
      <datalist id={listId}>
        {shown.map(item => <option key={`${item.district}|${item.name}`} value={item.name}>{options.length ? '' : item.district}</option>)}
      </datalist>
    </>
  );
}
