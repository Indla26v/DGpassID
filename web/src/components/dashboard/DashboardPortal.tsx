'use client';

import { OperationsHeader } from '../common/OperationsHeader';

import React, { useState, useEffect, useCallback } from 'react';
import { PillButton } from '../common/PillButton';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import {
  ShieldCheck,
  Building2,
  Printer,
  CheckCircle2,
  RefreshCw,
  Layers,
} from 'lucide-react';
import type { ActivePortal } from '../common/Navbar';

interface PoliceStats {
  total: number;
  pendingDuty: number;
  dutyAssigned: number;
  printed: number;
  collected: number;
  byZone: { zone: string; count: number }[];
}

interface CampusStats {
  total: number;
  draft: number;
  pendingApproval: number;
  approved: number;
  readyToPrint: number;
  printed: number;
  issued: number;
  revoked: number;
  byInstitution: {
    IISER: number;
    IIT: number;
    ICI: number;
    ICU: number;
    Other: number;
  };
  byCategory: {
    Student: number;
    'Faculty/Staff': number;
    Worker: number;
    Other: number;
  };
  offices?: Array<{
    id: string;
    name: string;
    total: number;
    pending: number;
    ready: number;
    printed: number;
    issued: number;
    revoked: number;
  }>;
}

interface DashboardPortalProps {
  onNavigatePortal: (portal: ActivePortal) => void;
}

export const DashboardPortal: React.FC<DashboardPortalProps> = ({ onNavigatePortal }) => {
  const [policeStats, setPoliceStats] = useState<PoliceStats | null>(null);
  const [campusStats, setCampusStats] = useState<CampusStats | null>(null);
  const [departments, setDepartments] = useState<{ department: string; count: number }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchAllStats = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes, dRes] = await Promise.all([
        fetch('/api/police-force/stats', { cache: 'no-store' }),
        fetch('/api/stats', { cache: 'no-store' }),
        fetch('/api/passes/departments-summary', { cache: 'no-store' }).catch(() => null),
      ]);

      if (pRes.ok) {
        const pData = await pRes.json();
        setPoliceStats(pData);
      }

      if (cRes.ok) {
        const cData = await cRes.json();
        setCampusStats(cData);
      }
      setDepartments(dRes?.ok ? (await dRes.json()).departments : null);

      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour12: true }));
    } catch (err) {
      console.error('Error fetching dashboard statistics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllStats();
  }, [fetchAllStats]);

  // Overall calculations
  const totalPolice = policeStats?.total || 0;
  const totalCampus = campusStats?.total || 0;
  const campusOffices = campusStats?.offices?.filter(office => office.id !== 'unassigned') ?? [];
  const grandTotal = totalPolice + totalCampus;

  const totalReadyToPrint = (policeStats?.dutyAssigned || 0) + (campusStats?.readyToPrint || 0);
  const totalPrinted = (policeStats?.printed || 0) + (campusStats?.printed || 0);
  const totalDistributed = (policeStats?.collected || 0) + (campusStats?.issued || 0);

  const metrics = [
    { label: 'Passes registered', value: grandTotal, detail: `${totalPolice.toLocaleString()} police · ${totalCampus.toLocaleString()} campus`, icon: Layers, tone: 'bg-slate-100 text-[#0B2545]' },
    { label: 'Ready to print', value: totalReadyToPrint, icon: CheckCircle2, tone: 'bg-amber-50 text-amber-800' },
    { label: 'Badges printed', value: totalPrinted, icon: Printer, tone: 'bg-blue-50 text-blue-800' },
    { label: 'Passes issued', value: totalDistributed, icon: ShieldCheck, tone: 'bg-emerald-50 text-emerald-800' },
  ];
  const policeMetrics = [
    { label: 'Total Personnel', value: totalPolice },
    { label: 'Duty assigned', value: policeStats?.dutyAssigned ?? 0 },
    { label: 'Duty pending', value: policeStats?.pendingDuty ?? 0 },
  ];
  const campusMetrics = [
    { label: 'Campus passes', value: totalCampus },
    { label: 'Ready to print', value: campusStats?.readyToPrint ?? 0 },
    { label: 'Badges printed', value: campusStats?.printed ?? 0 },
  ];
  const institutions = [
    { label: 'IISER Tirupati', value: campusStats?.byInstitution?.IISER ?? 0 },
    { label: 'IIT Tirupati', value: campusStats?.byInstitution?.IIT ?? 0 },
    { label: 'Indian Culinary Institute', value: (campusStats?.byInstitution?.ICI ?? 0) + (campusStats?.byInstitution?.ICU ?? 0) },
    { label: 'External agencies', value: campusStats?.byInstitution?.Other ?? 0 },
  ];
  const zoneCounts = new Map(policeStats?.byZone.map(({ zone, count }) => [zone.toLowerCase(), count]));
  const unassigned = zoneCounts.get('unassigned') ?? 0;
  const formatCount = (value: number, available: boolean) => available ? value.toLocaleString() : '—';

  return (
    <div className="space-y-4">
      <OperationsHeader title="Pass Operations Dashboard" description="Police deployment, campus passes and badge issuance.">
        {lastUpdated && <span className="text-xs tabular-nums text-slate-200">Updated {lastUpdated}</span>}
        <PillButton
          variant="outline"
          size="sm"
          onClick={fetchAllStats}
          disabled={loading}
          icon={<RefreshCw aria-hidden="true" className={`size-3.5 ${loading ? 'motion-safe:animate-spin' : ''}`} />}
        >
          Refresh data
        </PillButton>
      </OperationsHeader>

      <dl aria-label="Overall pass activity" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon, tone }) => (
          <div key={label} className="operations-metric">
            <div className="min-w-0">
              <dt className="text-sm font-medium text-slate-600">{label}</dt>
              <dd className="mt-0.5 text-2xl font-semibold leading-none tabular-nums text-[#0B2545]">
                {formatCount(value, Boolean(policeStats && campusStats))}
              </dd>
              {detail && policeStats && campusStats && <dd className="mt-1 text-xs text-slate-600">{detail}</dd>}
            </div>
            <Icon aria-hidden="true" className={`size-7 shrink-0 rounded-full p-1.5 lg:size-8 ${tone}`} />
          </div>
        ))}
      </dl>

      <div className="operations-enter grid items-start gap-4 md:grid-cols-2">
        <section aria-labelledby="dashboard-police" className="operations-panel">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h3 id="dashboard-police" className="flex items-center gap-2 text-base font-semibold text-[#0B2545]">
              <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-[#8B1A1A]" />
              Police Bandobusth Force
            </h3>
            <PillButton variant="outline" size="sm" onClick={() => onNavigatePortal('police')}>Open Police Force</PillButton>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 bg-slate-50">
            {policeMetrics.map(({ label, value }) => (
              <div key={label} className="px-3 py-2.5 sm:px-4">
                <dt className="text-xs font-medium text-slate-600">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold leading-tight tabular-nums text-[#0B2545]">{formatCount(value, !!policeStats)}</dd>
              </div>
            ))}
          </dl>
          <div className="space-y-3.5 p-4">
            <div>
              <h4 className="mb-1 text-sm font-semibold text-[#0B2545]">Bandobusth zones</h4>
              <dl className="divide-y divide-slate-100">
                {POLICE_BANDOBUSHT_ZONES.map((zone) => {
                  const count = zoneCounts.get(zone.name.toLowerCase()) ?? 0;
                  const percentage = totalPolice > 0 ? (count / totalPolice) * 100 : 0;
                  return (
                    <div key={zone.id} className="flex items-center gap-2.5 py-1.5 text-sm">
                      <dt className="flex min-w-0 flex-1 items-baseline gap-2 text-slate-700">
                        <span className="w-5 shrink-0 text-xs tabular-nums text-slate-500">{zone.number}</span>
                        <span>{zone.name}</span>
                      </dt>
                      <dd className="flex shrink-0 items-center gap-2">
                        <span aria-hidden="true" className="hidden h-1 w-12 overflow-hidden rounded-full bg-slate-100 min-[400px]:block">
                          <span className="block h-full rounded-full bg-police-crimson motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out" style={{ width: `${percentage}%` }} />
                        </span>
                        <span className="min-w-8 text-right font-semibold tabular-nums text-[#0B2545]">{formatCount(count, !!policeStats)}</span>
                      </dd>
                    </div>
                  );
                })}
                {unassigned > 0 && (
                  <div className="flex items-center justify-between gap-2 py-1.5 text-sm text-amber-800">
                    <dt>Unassigned to a zone</dt>
                    <dd className="font-semibold tabular-nums">{unassigned.toLocaleString()}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </section>

        <section aria-labelledby="dashboard-campus" className="operations-panel">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h3 id="dashboard-campus" className="flex items-center gap-2 text-base font-semibold text-[#0B2545]">
              <Building2 aria-hidden="true" className="size-4 shrink-0 text-[#8B1A1A]" />
              Campus &amp; Agencies
            </h3>
            <PillButton variant="outline" size="sm" onClick={() => onNavigatePortal('admin')}>Open Campus &amp; Agencies</PillButton>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 bg-slate-50">
            {campusMetrics.map(({ label, value }) => (
              <div key={label} className="px-3 py-2.5 sm:px-4">
                <dt className="text-xs font-medium text-slate-600">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold leading-tight tabular-nums text-[#0B2545]">{formatCount(value, !!campusStats)}</dd>
              </div>
            ))}
          </dl>
          <div className="space-y-3.5 p-4">
            <div>
              <h4 className="mb-1 text-sm font-semibold text-[#0B2545]">Institutions &amp; venues</h4>
              <dl className="divide-y divide-slate-100">
                {institutions.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-3 py-1.5 text-sm text-slate-700">
                    <dt>{label}</dt>
                    <dd className="font-semibold tabular-nums">{formatCount(value, !!campusStats)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="border-t border-slate-200 pt-3">
              <h4 className="mb-1 text-sm font-semibold text-[#0B2545]">Passes by department</h4>
              {departments?.length ? (
                <dl className="max-h-44 divide-y divide-slate-100 overflow-y-auto">
                  {departments.map(({ department, count }) => (
                    <div key={department} className="flex items-start justify-between gap-3 py-1.5 text-sm text-slate-700">
                      <dt className="min-w-0 break-words">{department || 'No department recorded'}</dt>
                      <dd className="shrink-0 font-semibold tabular-nums">{count.toLocaleString()}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="text-sm text-slate-600">{loading ? 'Loading departments…' : departments ? 'No department passes yet.' : 'Department data unavailable.'}</p>}
            </div>
            <div className="border-t border-slate-200 pt-3">
              <h4 className="mb-2 text-sm font-semibold text-[#0B2545]">Subdivision police offices</h4>
              {campusOffices.length ? (
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Pass counts by police office</caption>
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th scope="col" className="py-2 pl-2 font-medium">Office</th>
                      {['Total', 'Ready', 'Printed'].map((label) => <th key={label} scope="col" className="whitespace-nowrap px-1.5 py-2 text-right font-medium">{label}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {campusOffices.map((office) => (
                      <tr key={office.id}>
                        <th scope="row" className="py-2 pl-2 font-medium">{office.name}</th>
                        {[office.total, office.ready, office.printed].map((value, index) => <td key={index} className="px-1.5 py-2 text-right tabular-nums">{value.toLocaleString()}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-slate-600">{loading ? 'Loading offices…' : 'No office data available.'}</p>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
