'use client';

import React from 'react';
import { PassStatistics } from '@/core/interfaces/pass-repository.interface';
import { PassStatus } from '@/core/domain/types/pass-status.enum';
import { ShieldCheck, Printer, Users, Clock, AlertCircle } from 'lucide-react';
import { PillButton } from './PillButton';

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
    <div role="alert" className="operations-panel flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-slate-600">
      <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />Statistics are unavailable. Try refreshing the connection.</span>
      <PillButton variant="outline" size="sm" onClick={onRetry}>Try again</PillButton>
    </div>
  );
  if (loading || !stats) return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4" role="status" aria-label="Loading statistics">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="operations-panel h-[84px] p-3 motion-safe:animate-pulse">
          <div className="h-3 w-20 rounded-full bg-slate-100" />
          <div className="mt-2 h-6 w-14 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
  const cards = [
    { label: 'Passes registered', value: stats.total, status: undefined, Icon: ShieldCheck, tone: 'bg-slate-100 text-police-navy' },
    { label: 'Pending approval', value: stats.pendingApproval, status: 'PENDING_APPROVAL' as const, Icon: Clock, tone: 'bg-purple-50 text-purple-800' },
    { label: 'Ready to print', value: stats.readyToPrint, status: 'READY_TO_PRINT' as const, Icon: Printer, tone: 'bg-amber-50 text-amber-800' },
    { label: 'Passes printed', value: stats.printed, status: 'PRINTED' as const, Icon: Users, tone: 'bg-emerald-50 text-emerald-800' },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {cards.map(({ label, value, status, Icon, tone }) => (
        <button key={label} type="button" onClick={() => onStatusChange?.(status)} aria-pressed={activeStatus === status} disabled={!onStatusChange}
          className={`operations-metric text-left transition-colors enabled:hover:border-police-crimson/40 ${activeStatus === status ? 'ring-1 ring-police-crimson/40' : ''}`}>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-600">{label}</span>
            <span className="mt-0.5 block text-2xl font-semibold leading-none tabular-nums text-police-navy">{value.toLocaleString()}</span>
          </span>
          <Icon aria-hidden="true" className={`size-7 shrink-0 rounded-full p-1.5 lg:size-8 ${tone}`} />
        </button>
      ))}
    </div>
  );
};
