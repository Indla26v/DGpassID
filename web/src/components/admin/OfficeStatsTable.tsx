import { ArrowUpRight } from 'lucide-react';
import type { OfficeStatistics } from '@/core/domain/offices';

const metrics = [
  { key: 'total', label: 'Total', color: 'text-police-navy' },
  { key: 'pending', label: 'Pending', color: 'text-purple-800' },
  { key: 'ready', label: 'Ready to print', color: 'text-amber-800' },
  { key: 'printed', label: 'Printed', color: 'text-emerald-800' },
  { key: 'issued', label: 'Issued', color: 'text-blue-800' },
  { key: 'revoked', label: 'Revoked', color: 'text-rose-800' },
] as const;

export function OfficeStatsTable({ offices, activeOffice, onOfficeChange }: {
  offices: OfficeStatistics[];
  activeOffice: string;
  onOfficeChange?: (office: OfficeStatistics['id']) => void;
}) {
  return (
    <section aria-labelledby="office-stats-heading" className="operations-panel overflow-hidden">
      <h3 id="office-stats-heading" className="px-4 py-3 font-semibold text-police-navy">Passes by office</h3>
      <div role="region" aria-label="Office pass counts" tabIndex={0} className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-left text-sm">
          <thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">Office</th>
              {metrics.map(({ key, label }) => (
                <th key={key} scope="col" className="whitespace-nowrap px-3 py-2 text-right font-semibold">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {offices.filter(office => office.id !== 'unassigned').map(office => (
              <tr key={office.id} className={activeOffice === office.id ? 'bg-rose-50' : undefined}>
                <th scope="row" className="px-4 py-2.5 font-semibold text-police-navy">
                  {onOfficeChange ? (
                    <button type="button" aria-pressed={activeOffice === office.id} onClick={() => onOfficeChange(office.id)}
                      className="inline-flex items-center gap-2 rounded text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                      {office.name}
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                    </button>
                  ) : office.name}
                </th>
                {metrics.map(({ key, color }) => (
                  <td key={key} className={`px-3 py-2.5 text-right font-semibold tabular-nums ${color}`}>{office[key].toLocaleString()}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
