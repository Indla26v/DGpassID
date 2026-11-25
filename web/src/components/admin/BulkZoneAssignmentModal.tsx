'use client';

import React, { useState } from 'react';
import { useDialog } from '../common/useDialog';
import { PillButton } from '../common/PillButton';
import { ShieldCheck, X, Check } from 'lucide-react';

interface BulkZoneAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIds: string[];
  onComplete: () => void;
}

export const BulkZoneAssignmentModal: React.FC<BulkZoneAssignmentModalProps> = ({
  isOpen,
  onClose,
  selectedIds,
  onComplete,
}) => {
  const dialogRef = useDialog(isOpen, onClose);
  const [zoneA, setZoneA] = useState(true);
  const [zoneB, setZoneB] = useState(true);
  const [zoneC, setZoneC] = useState(false);
  const [gateA, setGateA] = useState('');
  const [gateB, setGateB] = useState('');
  const [gateC, setGateC] = useState('');
  const [accommodation, setAccommodation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || selectedIds.length === 0) return null;

  const handleApply = async () => {
    if (!zoneA && !zoneB && !zoneC) {
      setError('Please select at least one security zone (Zone A, B, or C).');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/passes/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedIds,
          zone_a: zoneA,
          zone_b: zoneB,
          zone_c: zoneC,
          gate_zone_a: gateA.trim() || undefined,
          gate_zone_b: gateB.trim() || undefined,
          gate_zone_c: gateC.trim() || undefined,
          dept_hostel_quarter: accommodation.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update security zones.');
      }

      onComplete();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error applying security zones.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Bulk Security Zone Assignment"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-hidden"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col animate-scaleUp">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0B2545] text-white flex items-center justify-between border-b border-[#8B1A1A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#8B1A1A] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wide">
                Assign Security Zones &amp; Clearance
              </h2>
              <p className="text-[11px] text-slate-300">
                Updating {selectedIds.length} Selected Police Personnel Passes
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(85vh-120px)]">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Quick Preset Zone Pills */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
              Select Authorized Security Zones
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Zone A */}
              <button
                type="button"
                onClick={() => setZoneA(!zoneA)}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  zoneA
                    ? 'border-blue-600 bg-blue-50/70 text-blue-950 shadow-xs ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-extrabold text-xs">Zone A</span>
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      zoneA ? 'bg-blue-600 text-white' : 'border border-slate-300'
                    }`}
                  >
                    {zoneA && <Check className="w-2.5 h-2.5" />}
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 leading-tight">
                  Inner perimeter &amp; VVIP Accommodations
                </span>
              </button>

              {/* Zone B */}
              <button
                type="button"
                onClick={() => setZoneB(!zoneB)}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  zoneB
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 shadow-xs ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-extrabold text-xs">Zone B</span>
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      zoneB ? 'bg-indigo-600 text-white' : 'border border-slate-300'
                    }`}
                  >
                    {zoneB && <Check className="w-2.5 h-2.5" />}
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 leading-tight">
                  Academic Core &amp; Plenary Hall
                </span>
              </button>

              {/* Zone C */}
              <button
                type="button"
                onClick={() => setZoneC(!zoneC)}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  zoneC
                    ? 'border-amber-600 bg-amber-50/70 text-amber-950 shadow-xs ring-1 ring-amber-600'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-extrabold text-xs">Zone C</span>
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      zoneC ? 'bg-amber-600 text-white' : 'border border-slate-300'
                    }`}
                  >
                    {zoneC && <Check className="w-2.5 h-2.5" />}
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 leading-tight">
                  Logistics, Fleet &amp; Dining Pavilions
                </span>
              </button>
            </div>
          </div>

          {/* Designated Gate Names (Optional) */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <span className="text-xs font-bold text-slate-700 block uppercase tracking-wide">
              Designated Gate Access (Optional)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                  Gate for Zone A
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hostel Gate 1"
                  value={gateA}
                  onChange={(e) => setGateA(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#0B2545]"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                  Gate for Zone B
                </label>
                <input
                  type="text"
                  placeholder="e.g. Auditorium Gate"
                  value={gateB}
                  onChange={(e) => setGateB(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#0B2545]"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                  Gate for Zone C
                </label>
                <input
                  type="text"
                  placeholder="e.g. Service Gate 3"
                  value={gateC}
                  onChange={(e) => setGateC(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#0B2545]"
                />
              </div>
            </div>
          </div>

          {/* Assigned Accommodation / Quarter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
              Assigned Camp / Barracks / Quarters (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. IISER TRANSIT HOSTEL 1 or POLICE GUEST HOUSE"
              value={accommodation}
              onChange={(e) => setAccommodation(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>

          <PillButton
            variant="crimson"
            size="md"
            onClick={handleApply}
            disabled={loading || (!zoneA && !zoneB && !zoneC)}
            icon={<ShieldCheck className="w-4 h-4" />}
          >
            {loading ? 'Applying Changes...' : `Apply Security Zones (${selectedIds.length})`}
          </PillButton>
        </div>
      </div>
    </div>
  );
};
