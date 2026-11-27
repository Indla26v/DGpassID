'use client';

import React from 'react';
import { Check } from 'lucide-react';

interface VenueInstitutionTogglesProps {
  value?: string | null;
  onChange: (venue: 'IISER' | 'IIT' | 'ICI') => void;
  disabled?: boolean;
  className?: string;
  embedded?: boolean;
}

const VENUES = [
  { id: 'IISER', label: 'IISER', subtitle: 'IISER Tirupati' },
  { id: 'IIT', label: 'IIT', subtitle: 'IIT Tirupati' },
  { id: 'ICI', label: 'ICI', subtitle: 'Indian Culinary' },
] as const;

export const VenueInstitutionToggles: React.FC<VenueInstitutionTogglesProps> = ({
  value,
  onChange,
  disabled = false,
  className = '',
  embedded = false,
}) => {
  return (
    <div className={`${embedded ? '' : 'operations-panel p-4'} space-y-2 ${className}`}>
      <h4 className="text-xs font-semibold text-slate-700">Campus institution</h4>
      <div role="group" aria-label="Campus institution" className="grid grid-cols-3 gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
        {VENUES.map((venue) => {
          const isSelected = value === venue.id || (venue.id === 'ICI' && value === 'ICU');
          return (
            <button
              key={venue.id}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              title={venue.subtitle}
              onClick={() => onChange(venue.id)}
              className={`operations-action inline-flex min-h-9 items-center justify-center gap-1 px-1.5 text-xs font-semibold disabled:opacity-60 ${isSelected
                ? 'bg-police-crimson text-white shadow-sm'
                : 'text-slate-700 hover:bg-white hover:text-police-navy'
              }`}
            >
              {isSelected && <Check aria-hidden="true" className="size-3.5 shrink-0" />}
              {venue.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
