'use client';

import { useDialog } from '../common/useDialog';
import React, { useEffect, useState } from 'react';
import { AuditLogEntity } from '@/core/domain/entities/audit.entity';
import { PillButton } from '../common/PillButton';
import { CollectionFeedback } from '../common/CollectionFeedback';
import { X, History, RefreshCw } from 'lucide-react';

interface AuditLogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuditLogDrawer: React.FC<AuditLogDrawerProps> = ({ isOpen, onClose }) => {
  const dialogRef = useDialog(isOpen, onClose);
  const [logs, setLogs] = useState<AuditLogEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/audit-logs?limit=40');
      if (!res.ok) throw new Error('Unable to load audit records. Please try again.');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#0B2545] text-white">
            ADMIN
          </span>
        );
      case 'PRINT_TEAM':
        return (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#8B1A1A] text-white">
            PRINT TEAM
          </span>
        );
      case 'SECURITY_GATE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-700 text-white">
            GATE SENTRY
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-600 text-white">
            {role}
          </span>
        );
    }
  };

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Conference security audit trail" tabIndex={-1} className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col border-l border-slate-200">
        {/* Header */}
        <div className="p-4 bg-[#0B2545] text-white flex items-center justify-between border-b border-[#8B1A1A]">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-300" />
            <h2 className="text-sm font-extrabold uppercase tracking-wide">
              Conference Security Audit Trail
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLogs}
              className="p-1.5 rounded-full hover:bg-white/10 text-white transition"
              title="Refresh logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading || error ? (
            <CollectionFeedback loading={loading} error={error} onRetry={fetchLogs} />
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400">
              No audit records found yet.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1 hover:border-slate-300 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-[#0B2545] text-[11px] truncate">
                    {log.action}
                  </span>
                  {getRoleBadge(log.user_role)}
                </div>

                <p className="text-slate-700 text-[11px] font-medium leading-relaxed">
                  {log.details || 'Action completed.'}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                  <span>By: {log.performed_by}</span>
                  <span>{new Date(log.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <PillButton variant="secondary" size="sm" onClick={onClose}>
            Close
          </PillButton>
        </div>
      </div>
    </div>
  );
};
