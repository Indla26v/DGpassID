import { OFFICES } from '@/core/domain/offices';
import { CustomSelect } from '../common/CustomSelect';

const officeOptions = OFFICES.map(({ id, name }) => ({ value: id, label: name }));

export function OfficePicker({ label, value, emptyLabel, onChange }: {
  label: string;
  value: string;
  emptyLabel?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">{label}</span>
      <CustomSelect
        ariaLabel={label}
        value={value}
        onChange={onChange}
        options={emptyLabel ? [{ value: '', label: emptyLabel }, ...officeOptions] : officeOptions}
        className="mt-1.5"
      />
    </div>
  );
}
