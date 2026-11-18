'use client';

import React from 'react';
import { PassStatistics } from '@/core/interfaces/pass-repository.interface';
import { PassStatus } from '@/core/domain/types/pass-status.enum';
import { ShieldCheck, Printer, Users, Clock, ArrowUpRight, AlertCircle } from 'lucide-react';

interface StatsCardsProps {
  stats: PassStatistics | null;
  loading?: boolean;
  error?: boolean;
  activeStatus?: PassStatus;
  onStatusChange?: (status?: PassStatus) => void;
  onRetry?: () => void;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats, loading, error, activeStatus, onStatusChange, onRetry }) => {
  if (error && !loading) return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">
      <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />Statistics are unavailable. Try refreshing the connection.</span>
      <button type="button" onClick={onRetry} className="min-h-9 rounded-lg px-3 font-semibold text-[#0B2545] hover:bg-slate-100">Try again</button>
    </div>
  );
  if (loading || !stats) return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4" role="status" aria-label="Loading statistics">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-[146px] animate-pulse rounded-2xl border border-slate-200 bg-white p-5"><div className="h-3 w-20 rounded bg-slate-100" /><div className="mt-5 h-8 w-14 rounded bg-slate-100" /><div className="mt-3 h-2 w-24 rounded bg-slate-100" /></div>)}
    </div>
  );
  const cards = [
    { label: 'Total Pass Registry', value: stats.total, detail: 'All units & agencies', status: undefined, Icon: ShieldCheck, border: 'border-slate-200', text: 'text-[#0B2545]', labelColor: 'text-slate-500', detailColor: 'text-slate-500', icon: 'bg-[#0B2545]/10 text-[#0B2545]' },
    { label: 'Pending Approval', value: stats.pendingApproval, detail: 'Submitted by Print Team', status: 'PENDING_APPROVAL' as const, Icon: Clock, border: 'border-purple-200', text: 'text-purple-900', labelColor: 'text-purple-700', detailColor: 'text-purple-600', icon: 'bg-purple-100 text-purple-800' },
    { label: 'Approved & Queued', value: stats.readyToPrint, detail: 'Ready for physical print', status: 'READY_TO_PRINT' as const, Icon: Printer, border: 'border-amber-200', text: 'text-amber-900', labelColor: 'text-amber-700', detailColor: 'text-amber-700', icon: 'bg-amber-100 text-amber-800' },
    { label: 'Printed & Active', value: stats.printed, detail: 'Issued on campus', status: 'PRINTED' as const, Icon: Users, border: 'border-emerald-200', text: 'text-emerald-900', labelColor: 'text-emerald-700', detailColor: 'text-emerald-700', icon: 'bg-emerald-100 text-emerald-800' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
      {cards.map(({ label, value, detail, status, Icon, border, text, labelColor, detailColor, icon }) => (
        <button key={label} type="button" onClick={() => onStatusChange?.(status)} aria-pressed={activeStatus === status} disabled={!onStatusChange}
          className={`group stat-card relative rounded-2xl border bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${border} ${activeStatus === status ? 'ring-1 ring-[#0B2545]/30' : ''}`}>
          <div className="flex items-center justify-between gap-2"><span className={`text-[10px] font-semibold uppercase tracking-wider sm:text-[11px] ${labelColor}`}>{label}</span><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${icon}`}><Icon className="h-4 w-4" /></div></div>
          <div className={`mt-3 text-3xl font-semibold tracking-tight tabular-nums ${text}`}>{value.toLocaleString()}</div>
          <div className="mt-2 flex items-center justify-between gap-1"><span className={`text-[10px] sm:text-[11px] ${detailColor}`}>{detail}</span><ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
        </button>
      ))}
    </div>
  );
};
