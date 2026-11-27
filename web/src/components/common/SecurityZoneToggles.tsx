'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { SECURITY_ZONES, SecurityZoneField, getDefaultGate } from '@/core/domain/zones';

interface SecurityZoneTogglesProps {
  zoneA: boolean;
  zoneB: boolean;
  zoneC: boolean;
  onToggle: (field: SecurityZoneField) => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  title?: string;
  institution?: string | null;
  embedded?: boolean;
  compact?: boolean;
}

export const SecurityZoneToggles: React.FC<SecurityZoneTogglesProps> = ({
  zoneA,
  zoneB,
  zoneC,
  onToggle,
  disabled = false,
  loading = false,
  className = '',
  title,
  institution,
  embedded = false,
  compact = false,
}) => {
  const activeMap: Record<SecurityZoneField, boolean> = { zone_a: zoneA, zone_b: zoneB, zone_c: zoneC };

  return (
    <div className={`${embedded ? '' : compact ? 'rounded-xl border border-slate-200 bg-slate-50 p-3' : 'operations-panel p-4'} space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-700">{title || 'Security access zones'}</h4>
        {loading && <span role="status" className="text-xs text-slate-600">Saving zones…</span>}
      </div>

      <div role="group" aria-label={title || 'Security access zones'} className={compact ? 'grid grid-cols-1 gap-2 sm:grid-cols-3' : 'space-y-1.5'}>
        {SECURITY_ZONES.map((zone) => {
          const isActive = activeMap[zone.field];
          const gate = institution ? getDefaultGate(institution, zone.key) : zone.subtitle;
          return (
            <button
              key={zone.field}
              type="button"
              disabled={disabled}
              aria-pressed={isActive}
              onClick={() => onToggle(zone.field)}
              className={`flex min-h-10 w-full items-center justify-between gap-2 border px-2.5 py-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-police-crimson disabled:opacity-60 ${compact ? 'rounded-xl sm:min-h-14 sm:items-start' : 'rounded-2xl'} ${isActive
                ? 'border-police-crimson/20 bg-rose-50/70'
                : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <span className={`flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 ${compact ? 'sm:flex-col sm:items-start' : ''}`}>
                <span className={`shrink-0 text-xs font-semibold text-police-navy ${compact ? '' : 'rounded-full bg-white px-1.5 py-0.5'}`}>{zone.label}</span>
                <span className="min-w-0 break-words text-xs text-slate-600">{gate}</span>
              </span>
              <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full border ${isActive ? 'border-police-crimson bg-police-crimson text-white' : 'border-slate-300 bg-white'}`}>
                {isActive && <Check className="size-3.5" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
