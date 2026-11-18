import { ArrowUpRight, Building2 } from 'lucide-react';
import type { OfficeStatistics } from '@/core/domain/offices';

const metrics = [
  { key: 'pending', label: 'Pending', color: 'text-purple-800' },
  { key: 'ready', label: 'Ready to print', color: 'text-amber-800' },
  { key: 'printed', label: 'Printed', color: 'text-emerald-800' },
  { key: 'issued', label: 'Issued', color: 'text-blue-800' },
  { key: 'revoked', label: 'Revoked', color: 'text-rose-800' },
] as const;

export function OfficeStatsCards({ offices, activeOffice, onOfficeChange }: {
  offices: OfficeStatistics[];
  activeOffice: string;
  onOfficeChange?: (office: OfficeStatistics['id']) => void;
}) {
  return (
    <section aria-labelledby="office-stats-heading">
      <h3 id="office-stats-heading" className="mb-3 font-semibold text-[#0B2545]">Passes by office</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {offices.filter(office => office.id !== 'unassigned').map(office => (
          <article key={office.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${activeOffice === office.id ? 'border-[#0B2545] ring-1 ring-[#0B2545]/30' : 'border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#0B2545]/10 text-[#0B2545]">
                <Building2 className="h-4 w-4" aria-hidden="true" />
              </div>
              <h4 className="min-w-0 flex-1 text-sm font-semibold text-[#0B2545]">
                {onOfficeChange ? (
                  <button type="button" aria-pressed={activeOffice === office.id} onClick={() => onOfficeChange(office.id)}
                    className="flex w-full items-center justify-between gap-2 rounded text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                    {office.name}
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                  </button>
                ) : office.name}
              </h4>
            </div>
            <dl className="mt-4 flex items-baseline gap-2">
              <dt className="text-xs font-medium text-slate-600">Total passes</dt>
              <dd className="-order-1 text-3xl font-semibold tracking-tight tabular-nums text-[#0B2545]">{office.total.toLocaleString()}</dd>
            </dl>
            <dl className="mt-3 grid grid-cols-3 gap-x-2 gap-y-3 border-t border-slate-100 pt-3">
              {metrics.map(({ key, label, color }) => (
                <div key={key}>
                  <dt className="text-xs text-slate-600">{label}</dt>
                  <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${color}`}>{office[key].toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
