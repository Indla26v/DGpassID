'use client';

import { useDialog } from '../common/useDialog';
import React, { useState } from 'react';
import { PillButton } from '../common/PillButton';
import { CreatePassInput } from '@/core/domain/entities/pass.entity';
import { X, Upload, FileSpreadsheet } from 'lucide-react';

interface BatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export const BatchImportModal: React.FC<BatchImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const dialogRef = useDialog(isOpen, onClose);
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);

  if (!isOpen) return null;

  const sampleCsv = `FullName,FatherName,Institution,Category,Department,Mobile,GovtIdType,GovtIdNumber,ZoneA,ZoneB,ZoneC
Dr. M. Harinath,Sri. M. Venkat,IISER,Faculty/Staff,Department of Physics,+91 94411 22334,Institute ID,IISER-FAC-092,true,true,false
K. Sai Teja,Sri. K. Prasad,IISER,Student,BS-MS Dual Degree, Earth Sciences,+91 98492 88771,Institute ID,IISER-STU-182,true,true,false
B. Ramanjaneyulu,Sri. B. Chennaiah,IIT,Worker,Campus Transport & Fleet,+91 94405 11223,Aadhaar,XXXX-XXXX-3344,false,true,true
Dr. Preethi Nair,Late C. Nair,ICI,Other,Culinary Logistics Support,+91 98481 99001,Aadhaar,XXXX-XXXX-7788,true,true,true`;

  const handleLoadSample = () => {
    setCsvText(sampleCsv);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleProcessImport = async () => {
    if (!csvText.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const lines = csvText.trim().split('\n');
      if (lines.length < 2) {
        throw new Error('CSV must contain a header row and at least one data row.');
      }

      const records: CreatePassInput[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',').map((c) => c.trim());

        if (cols.length >= 8) {
          records.push({
            full_name: cols[0],
            father_or_spouse_name: cols[1] || '—',
            institution: (['IISER', 'IIT', 'ICI', 'ICU'].includes(cols[2]) ? (cols[2] === 'ICU' ? 'ICI' : cols[2]) : 'Other') as any,
            category: (['Student', 'Faculty/Staff', 'Worker'].includes(cols[3]) ? cols[3] : 'Other') as any,
            department: cols[4] || 'General Delegation',
            mobile_number: cols[5] || '+91 90000 00000',
            govt_id_type: (cols[6] || 'Aadhaar') as any,
            govt_id_number: cols[7] || 'XXXX-XXXX-0000',
            zone_a: cols[8]?.toLowerCase() === 'true',
            gate_zone_a: cols[8]?.toLowerCase() === 'true' ? 'Designated Hostel Gate' : undefined,
            zone_b: cols[9]?.toLowerCase() === 'true',
            gate_zone_b: cols[9]?.toLowerCase() === 'true' ? 'Designated Academic Gate' : undefined,
            zone_c: cols[10]?.toLowerCase() === 'true',
            gate_zone_c: cols[10]?.toLowerCase() === 'true' ? 'Designated Utility Gate' : undefined,
            status: 'READY_TO_PRINT',
          });
        }
      }

      const res = await fetch('/api/passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records,
          operatorName: 'Batch Security Admin',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to import batch');
      }

      const data = await res.json();
      setResult(data);
      onImportComplete();
    } catch (err: any) {
      setResult({ created: 0, errors: [err.message] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Import pass records" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0B2545] text-white flex items-center justify-between border-b border-[#8B1A1A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wide">
                Batch Import Personnel Passes
              </h2>
              <p className="text-[11px] text-slate-300">
                Bulk register students, faculty, and workers via CSV
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
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700">
              CSV Data (Comma Separated)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadSample}
                className="text-[11px] font-bold text-[#0B2545] hover:underline"
              >
                Insert Sample Data
              </button>
              <label className="text-[11px] font-bold text-[#8B1A1A] hover:underline cursor-pointer">
                Upload .CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={8}
            placeholder="FullName,FatherName,Institution,Category,Department,Mobile,GovtIdType,GovtIdNumber,ZoneA,ZoneB,ZoneC"
            className="w-full px-3 py-2 text-xs font-mono rounded-2xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
          />

          {result && (
            <div
              className={`p-3 rounded-2xl text-xs ${
                result.errors.length > 0 && result.created === 0
                  ? 'bg-rose-50 border border-rose-200 text-rose-800'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              }`}
            >
              <span className="font-bold block">
                Batch Result: {result.created} passes created successfully.
              </span>
              {result.errors.length > 0 && (
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-rose-700">
                  {result.errors.map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <PillButton variant="secondary" onClick={onClose}>
              Close
            </PillButton>
            <PillButton
              variant="primary"
              onClick={handleProcessImport}
              disabled={loading || !csvText.trim()}
              icon={<Upload className="w-3.5 h-3.5" />}
            >
              {loading ? 'Processing Import...' : 'Import & Send to Print Queue'}
            </PillButton>
          </div>
        </div>
      </div>
    </div>
  );
};
