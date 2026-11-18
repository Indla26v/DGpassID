'use client';

import { useId } from 'react';
import { InstitutionType } from '@/core/domain/types/pass-status.enum';

export function InstitutionSelector({ value, onChange }: {
  value: InstitutionType;
  onChange: (institution: InstitutionType) => void;
}) {
  const name = useId();
  return (
    <fieldset className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <legend className="px-1 text-xs font-bold text-slate-700">Institution / Unit</legend>
      <div className="grid grid-cols-3 gap-2">
        {(['IISER', 'IIT', 'ICI'] as const).map(institution => {
          const isSelected = value === institution || (institution === 'ICI' && value === 'ICU');
          return (
            <label key={institution} className={`flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-full border px-3 text-xs font-bold focus-within:ring-2 focus-within:ring-[#0B2545] focus-within:ring-offset-2 ${isSelected ? 'border-[#8B1A1A] bg-[#8B1A1A] text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
              <input type="radio" name={name} value={institution} checked={isSelected} onChange={() => onChange(institution)} required className="sr-only" />
              {institution}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
