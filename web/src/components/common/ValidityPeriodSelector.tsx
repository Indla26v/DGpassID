'use client';

import React from 'react';
import { Calendar } from 'lucide-react';

export function toIsoDate(d?: string | null, fallback = '2026-11-27'): string {
  if (!d) return fallback;
  if (d.includes('/')) {
    const parts = d.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${year.padStart(4, '20')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  return d;
}

interface ValidityPeriodSelectorProps {
  validFrom: string;
  validTo: string;
  onChangeValidFrom: (date: string) => void;
  onChangeValidTo: (date: string) => void;
  className?: string;
}

export const ValidityPeriodSelector: React.FC<ValidityPeriodSelectorProps> = ({
  validFrom,
  validTo,
  onChangeValidFrom,
  onChangeValidTo,
  className = '',
}) => {
  const normalizedFrom = toIsoDate(validFrom, '2026-11-27');
  const normalizedTo = toIsoDate(validTo, '2026-11-30');

  return (
    <div className={`space-y-2 border-t border-slate-200 pt-3 ${className}`}>
      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5 text-[#0B2545]" />
        <span>Pass Validity Dates</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">
            Valid From (Start Date) *
          </label>
          <input
            type="date"
            value={normalizedFrom}
            onChange={(e) => onChangeValidFrom(e.target.value)}
            required
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">
            Valid To (End Date) *
          </label>
          <input
            type="date"
            value={normalizedTo}
            onChange={(e) => onChangeValidTo(e.target.value)}
            required
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
          />
        </div>
      </div>
    </div>
  );
};
