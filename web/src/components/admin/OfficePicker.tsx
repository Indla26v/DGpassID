import { useId } from 'react';
import { OFFICES } from '@/core/domain/offices';

export function OfficePicker({ label, value, emptyLabel, onChange }: {
  label: string;
  value: string;
  emptyLabel?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700">{label}</label>
      <select id={id} value={value} onChange={event => onChange(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
        {emptyLabel && <option value="">{emptyLabel}</option>}
        {OFFICES.map(office => <option key={office.id} value={office.id}>{office.name}</option>)}
      </select>
    </div>
  );
}
