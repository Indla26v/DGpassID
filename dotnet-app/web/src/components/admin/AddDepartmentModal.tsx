'use client';

import { useDialog } from '../common/useDialog';
import React, { useState } from 'react';
import { PillButton } from '../common/PillButton';
import { X, Building2, Plus } from 'lucide-react';

interface AddDepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: (newItem: { name: string; type: 'EXTERNAL' | 'INTERNAL' }) => void;
  initialType?: 'EXTERNAL' | 'INTERNAL';
}

export const AddDepartmentModal: React.FC<AddDepartmentModalProps> = ({
  isOpen,
  onClose,
  onAdded,
  initialType = 'EXTERNAL',
}) => {
  const dialogRef = useDialog(isOpen, onClose);
  const [type, setType] = useState<'EXTERNAL' | 'INTERNAL'>(initialType);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          operatorName: 'Security Administrator',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add department');
      }

      const created = await res.json();
      onAdded({ name: created.name, type });
      setName('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error adding department');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Add department or staff role" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0B2545] text-white flex items-center justify-between border-b border-[#8B1A1A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wide">
                Add New Department / Category
              </h2>
              <p className="text-[11px] text-slate-300">
                Immediately updates dropdowns across all accounts
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Classification
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('EXTERNAL')}
                className={`py-2 px-3 rounded-full text-xs font-bold border transition ${
                  type === 'EXTERNAL'
                    ? 'bg-[#0B2545] text-white border-[#0B2545]'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                External Department
              </button>
              <button
                type="button"
                onClick={() => setType('INTERNAL')}
                className={`py-2 px-3 rounded-full text-xs font-bold border transition ${
                  type === 'INTERNAL'
                    ? 'bg-[#8B1A1A] text-white border-[#8B1A1A]'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Internal Staff Category
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {type === 'EXTERNAL' ? 'External Department Name' : 'Internal Staff Role / Category'}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                type === 'EXTERNAL'
                  ? 'e.g. Special Investigation Unit'
                  : 'e.g. Laboratory Technicians'
              }
              required
              className="w-full px-4 py-2.5 text-xs rounded-2xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              {type === 'EXTERNAL'
                ? 'Will be listed under External Departments in pass issuance and badge filters.'
                : 'Will be listed under IISER / IIT / ICI Staff Roles.'}
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <PillButton variant="secondary" onClick={onClose} type="button">
              Cancel
            </PillButton>
            <PillButton variant="primary" type="submit" disabled={loading || !name.trim()} icon={<Plus className="w-3.5 h-3.5" />}>
              {loading ? 'Adding...' : 'Add to Database'}
            </PillButton>
          </div>
        </form>
      </div>
    </div>
  );
};
