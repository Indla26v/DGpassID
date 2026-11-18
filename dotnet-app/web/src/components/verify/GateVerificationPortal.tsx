'use client';

import React, { useState } from 'react';
import { PillButton } from '../common/PillButton';
import { VerificationResult } from '@/core/interfaces/verification-service.interface';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Shield,
  Building,
  UserCheck,
} from 'lucide-react';

export const GateVerificationPortal: React.FC = () => {
  const [tokenInput, setTokenInput] = useState('');
  const [selectedGate, setSelectedGate] = useState('IISER Gate-1 (Main/Academic)');
  const [officerName, setOfficerName] = useState('Sentry Officer on Duty');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenInput.trim(),
          gateId: selectedGate,
          securityPersonnel: officerName,
        }),
      });

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({
        isValid: false,
        status: 'NOT_FOUND',
        message: 'Network error or verification service unreachable.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPreset = (sampleToken: string) => {
    setTokenInput(sampleToken);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Sentry Station Header */}
      <div className="bg-[#0B2545] text-white p-6 rounded-3xl border-2 border-[#8B1A1A] shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-[#8B1A1A] text-white">
            Access Control Terminal
          </span>
          <h2 className="text-xl font-black tracking-tight mt-1">
            Gate Police Security &amp; Verification Scanner
          </h2>
          <p className="text-xs text-slate-300">
            Real-time verification against 61st DGsP / IGPs Conference Database
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-300">Checkpoint:</span>
          <select
            value={selectedGate}
            onChange={(e) => setSelectedGate(e.target.value)}
            className="px-3 py-1.5 rounded-full bg-slate-900 text-white font-bold border border-white/20 focus:outline-none"
          >
            <option value="IISER Gate-1 (Main/Academic)">IISER Gate-1 (Academic/Admin)</option>
            <option value="IISER Gate-2 (Hostel Sector)">IISER Gate-2 (Hostel Sector)</option>
            <option value="IISER Gate-3 (Utility/Service)">IISER Gate-3 (Utility/Gate)</option>
            <option value="IIT Main Gate-A (Academic Block)">IIT Main Gate-A (Academic)</option>
            <option value="IIT Transit Gate-B (Hostel Block)">IIT Transit Gate-B (Hostel)</option>
            <option value="General Entry">General Campus Entry</option>
          </select>
        </div>
      </div>

      {/* Verification Input Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Enter Verification Code, Pass Serial No. or Scan QR Payload
            </label>
            <div className="flex items-center rounded-2xl border-2 border-slate-300 overflow-hidden focus-within:border-[#0B2545] shadow-xs">
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="e.g. PV-2026-XXXXXX-AP, DGPCONF-2026-0142, or paste scanned QR text"
                className="w-full px-4 py-3 text-sm font-mono font-bold text-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !tokenInput.trim()}
                className="px-6 py-3 bg-[#0B2545] hover:bg-[#133E6D] text-white font-bold text-xs uppercase tracking-wider transition disabled:opacity-50"
              >
                {loading ? 'Checking...' : 'Verify Entry'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <span>Quick Test Samples:</span>
              <button
                type="button"
                onClick={() => handleQuickPreset('DGPCONF-2026-0142')}
                className="text-[11px] font-mono font-bold text-[#0B2545] underline"
              >
                Pass 0142 (IISER Faculty)
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => handleQuickPreset('DGPCONF-2026-0143')}
                className="text-[11px] font-mono font-bold text-[#0B2545] underline"
              >
                Pass 0143 (Student)
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => handleQuickPreset('DGPCONF-2026-0144')}
                className="text-[11px] font-mono font-bold text-[#0B2545] underline"
              >
                Pass 0144 (Worker)
              </button>
            </div>

            <div className="flex items-center gap-1 text-[11px]">
              <span>Sentry:</span>
              <input
                type="text"
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
                className="px-2 py-0.5 rounded border border-slate-300 text-[11px]"
              />
            </div>
          </div>
        </form>
      </div>

      {/* Verification Result Display */}
      {result && (
        <div
          className={`rounded-3xl p-6 border-2 shadow-md transition-all ${
            result.isValid
              ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
              : result.status === 'REVOKED'
              ? 'bg-rose-50 border-rose-600 text-rose-950'
              : result.status === 'ZONE_RESTRICTED'
              ? 'bg-amber-50 border-amber-500 text-amber-950'
              : 'bg-slate-50 border-slate-400 text-slate-900'
          }`}
        >
          <div className="flex items-center gap-3 pb-4 border-b border-current/15">
            {result.isValid ? (
              <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
            ) : result.status === 'REVOKED' ? (
              <XCircle className="w-8 h-8 text-rose-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-amber-600 shrink-0" />
            )}

            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest block opacity-75">
                Verification Result
              </span>
              <h3 className="text-lg font-black">{result.message}</h3>
            </div>
          </div>

          {result.pass && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 text-xs">
              <div className="space-y-1">
                <div>
                  <span className="font-bold opacity-75">Cardholder:</span>{' '}
                  <strong className="text-sm font-black">{result.pass.full_name}</strong>
                </div>
                <div>
                  <span className="font-bold opacity-75">Pass Serial:</span>{' '}
                  <span className="font-mono font-bold">{result.pass.pass_number}</span>
                </div>
                <div>
                  <span className="font-bold opacity-75">Institution / Unit:</span>{' '}
                  <span className="font-bold">{result.pass.institution}</span>
                </div>
                <div>
                  <span className="font-bold opacity-75">Category:</span>{' '}
                  <span className="font-bold">{result.pass.category}</span>
                </div>
                <div>
                  <span className="font-bold opacity-75">Department:</span>{' '}
                  <span>{result.pass.department}</span>
                </div>
              </div>

              <div className="space-y-1">
                <div>
                  <span className="font-bold opacity-75">Emergency Mobile:</span>{' '}
                  <span className="font-mono font-bold">{result.pass.mobile_number}</span>
                </div>
                <div>
                  <span className="font-bold opacity-75">Govt ID:</span>{' '}
                  <span>
                    {result.pass.govt_id_type} ({result.pass.govt_id_number})
                  </span>
                </div>
                <div>
                  <span className="font-bold opacity-75">Validity:</span>{' '}
                  <span>
                    {result.pass.valid_from} to {result.pass.valid_to}
                  </span>
                </div>

                <div className="pt-1">
                  <span className="font-bold opacity-75 block mb-1">Permitted Zones:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {result.pass.zone_a && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900">
                        Zone-A (Residential/Hostel)
                      </span>
                    )}
                    {result.pass.zone_b && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-900">
                        Zone-B (Academic/Admin)
                      </span>
                    )}
                    {result.pass.zone_c && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                        Zone-C (Service/Utility)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
