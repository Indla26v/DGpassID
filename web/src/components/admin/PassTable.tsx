'use client';

import { OFFICES } from '@/core/domain/offices';
import { SECURITY_ZONES } from '@/core/domain/zones';
import React, { useEffect, useId, useRef, useState } from 'react';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { CollectionFeedback, CollectionPagination } from '../common/CollectionFeedback';
import { PillButton } from '../common/PillButton';
import { CustomSelect } from '../common/CustomSelect';
import {
  Search,
  Printer,
  Edit2,
  Trash2,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Send,
  CheckCircle,
  Layers,
  SlidersHorizontal,
  Ellipsis,
  X,
} from 'lucide-react';
import { PassStatus, InstitutionType, CategoryType } from '@/core/domain/types/pass-status.enum';

interface PassTableProps {
  passes: PassEntity[];
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onClearFilters: () => void;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  search: string;
  onSearchChange: (val: string) => void;
  statusFilter?: PassStatus;
  onStatusFilterChange: (status?: PassStatus) => void;
  institutionFilter?: InstitutionType;
  onInstitutionFilterChange: (inst?: InstitutionType) => void;
  categoryFilter?: CategoryType;
  onCategoryFilterChange: (cat?: CategoryType) => void;
  onPrint: (pass: PassEntity) => void;
  onBatchPrint?: () => void;
  onBulkAssignZones?: () => void;
  onEdit: (pass: PassEntity) => void;
  onPreview: (pass: PassEntity) => void;
  onQueueForPrint: (pass: PassEntity) => void;
  onApprove?: (pass: PassEntity) => void;
  onRevoke: (pass: PassEntity) => void;
  onDelete: (pass: PassEntity) => void;
}

function RegistryRowActions({ pass, onPrint, onPreview, onEdit, onQueueForPrint, onApprove, onRevoke, onDelete }:
  Pick<PassTableProps, 'onPrint' | 'onPreview' | 'onEdit' | 'onQueueForPrint' | 'onApprove' | 'onRevoke' | 'onDelete'> & { pass: PassEntity }
) {
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const canApprove = pass.status === 'PENDING_APPROVAL' && Boolean(onApprove);
  const canQueue = !['READY_TO_PRINT', 'PRINTED', 'PENDING_APPROVAL'].includes(pass.status);
  const actions = [
    { label: 'Edit details', Icon: Edit2, select: () => onEdit(pass) },
    ...(canApprove ? [{ label: 'Print duty ID card', Icon: Printer, select: () => onPrint(pass) }] : []),
    ...(canQueue ? [{ label: 'Queue for print', Icon: Send, select: () => onQueueForPrint(pass) }] : []),
    ...(pass.status !== 'REVOKED' ? [{ label: 'Revoke / reject pass', Icon: ShieldAlert, select: () => onRevoke(pass), destructive: true }] : []),
    { label: 'Delete record', Icon: Trash2, select: () => onDelete(pass), destructive: true },
  ];

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: Event) => {
      if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) {
        if (menu.current?.matches(':popover-open')) menu.current.hidePopover();
      }
    };
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [menuOpen]);

  const positionMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!menu.current) return;
    const anchor = event.currentTarget.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const width = Math.min(208, document.documentElement.clientWidth - margin * 2);
    const below = window.innerHeight - anchor.bottom - gap - margin;
    const above = anchor.top - gap - margin;
    const openAbove = below < actions.length * 36 + 16 && above > below;
    Object.assign(menu.current.style, {
      width: `${width}px`,
      maxHeight: `${Math.max(0, openAbove ? above : below)}px`,
      left: `${Math.max(margin, Math.min(anchor.right - width, document.documentElement.clientWidth - width - margin))}px`,
      top: openAbove ? 'auto' : `${anchor.bottom + gap}px`,
      bottom: openAbove ? `${window.innerHeight - anchor.top + gap}px` : 'auto',
    });
  };

  return (
    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
      {canApprove ? (
        <PillButton variant="success" size="sm" onClick={() => onApprove?.(pass)} icon={<CheckCircle aria-hidden="true" className="size-3.5" />}>
          Approve
        </PillButton>
      ) : (
        <PillButton variant="crimson" size="sm" onClick={() => onPrint(pass)} icon={<Printer aria-hidden="true" className="size-3.5" />}>
          Print
        </PillButton>
      )}
      <button type="button" onClick={() => onPreview(pass)} aria-label="View print preview" title="View print preview" className="operations-action grid size-9 place-items-center border border-slate-200 bg-white text-police-navy hover:bg-slate-100">
        <Eye aria-hidden="true" className="size-4" />
      </button>
      <button ref={trigger} type="button" popoverTarget={menuId} aria-expanded={menuOpen} onClick={positionMenu} aria-label={`More actions for ${pass.full_name}`} title="More actions" className="operations-action grid size-9 place-items-center border border-slate-200 bg-white text-police-navy hover:bg-slate-100">
        <Ellipsis aria-hidden="true" className="size-4" />
      </button>
      <div ref={menu} id={menuId} popover="auto" role="group" aria-label="Pass actions" onToggle={(event) => setMenuOpen(event.newState === 'open')} className="fixed inset-auto m-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 text-left shadow-xl">
        {actions.map(({ label, Icon, select, destructive }) => (
          <button
            key={label}
            type="button"
            onClick={() => { menu.current?.hidePopover(); trigger.current?.focus({ preventScroll: true }); select(); }}
            className={`flex min-h-9 w-full items-center gap-2 rounded-xl px-2.5 text-left text-sm font-medium ${destructive ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

const zoneChipStyles = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
  purple: 'border-purple-200 bg-purple-50 text-purple-800',
};

export const PassTable: React.FC<PassTableProps> = ({
  passes,
  loading, error, onRefresh, total, page, pageSize, onPageChange, onClearFilters,
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  institutionFilter,
  onInstitutionFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  onPrint,
  onBatchPrint,
  onBulkAssignZones,
  onEdit,
  onPreview,
  onQueueForPrint,
  onApprove,
  onRevoke,
  onDelete,
}) => {
  const isAllSelected = passes.length > 0 && passes.every(pass => selectedIds.includes(pass.id));
  const hasFilters = Boolean(search || statusFilter || institutionFilter || categoryFilter);

  const getStatusBadge = (status: PassStatus) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
            AWAITING APPROVAL
          </span>
        );
      case 'READY_TO_PRINT':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            READY TO PRINT
          </span>
        );
      case 'PRINTED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            PRINTED
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
            APPROVED
          </span>
        );
      case 'REVOKED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            REVOKED
          </span>
        );
      case 'DRAFT':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            DRAFT
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
            {status}
          </span>
        );
    }
  };

  const getInstitutionBadge = (inst: string) => {
    switch (inst) {
      case 'IISER':
        return 'bg-[#0B2545]/10 text-[#0B2545] border-[#0B2545]/30';
      case 'IIT':
        return 'bg-[#8B1A1A]/10 text-[#8B1A1A] border-[#8B1A1A]/30';
      case 'ICI':
      case 'ICU':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <section aria-labelledby="registry-title" className="operations-panel operations-enter space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 id="registry-title" className="text-base font-semibold text-[#0B2545]">Pass registry <span className="ml-2 rounded-md bg-slate-100 px-2 py-1 align-middle text-[11px] font-medium text-slate-500">{total.toLocaleString()}</span></h3><p className="mt-1 text-xs text-slate-500">Review credentials and manage access in one place.</p></div>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><SlidersHorizontal className="h-3.5 w-3.5" />Search &amp; filter</span>
      </div>
      {/* Controls Bar */}
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        {/* Search */}
        <div className="relative min-w-0 sm:col-span-3 xl:col-span-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search pass registry"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, pass ID, department, mobile…"
            className="operations-input pl-10 pr-4"
          />
        </div>

        <CustomSelect
          ariaLabel="Filter by pass status"
          value={statusFilter || ''}
          onChange={(value) => onStatusFilterChange((value as PassStatus) || undefined)}
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'PENDING_APPROVAL', label: 'Awaiting Approval' },
            { value: 'READY_TO_PRINT', label: 'Ready to Print' },
            { value: 'PRINTED', label: 'Printed' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REVOKED', label: 'Revoked' },
            { value: 'DRAFT', label: 'Draft' },
          ]}
        />

        <CustomSelect
          ariaLabel="Filter by institution"
          value={institutionFilter || ''}
          onChange={(value) => onInstitutionFilterChange((value as InstitutionType) || undefined)}
          options={[
            { value: '', label: 'All Units & Agencies' },
            { value: 'IISER', label: 'IISER Tirupati' },
            { value: 'IIT', label: 'IIT Tirupati' },
            { value: 'ICI', label: 'ICI: Indian Culinary Institute' },
            { value: 'Other', label: 'External Agencies' },
          ]}
        />

        <CustomSelect
          ariaLabel="Filter by category"
          value={categoryFilter || ''}
          onChange={(value) => onCategoryFilterChange((value as CategoryType) || undefined)}
          options={[
            { value: '', label: 'All Categories' },
            { value: 'Student', label: 'Student' },
            { value: 'Faculty/Staff', label: 'Faculty/Staff' },
            { value: 'Worker', label: 'Worker' },
            { value: 'Other', label: 'Other' },
          ]}
        />
      </div>

      {hasFilters && <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span>Filtered results</span>{statusFilter && <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-[#0B2545]">{statusFilter.replaceAll('_', ' ').toLowerCase()}</span>}{institutionFilter && <span className="rounded-md bg-slate-100 px-2 py-1">{institutionFilter}</span>}{categoryFilter && <span className="rounded-md bg-slate-100 px-2 py-1">{categoryFilter}</span>}<button type="button" onClick={onClearFilters} className="ml-auto flex min-h-8 items-center gap-1 operations-action px-2.5 font-semibold text-police-navy hover:bg-slate-100"><X className="h-3 w-3" />Clear filters</button></div>}

      {/* Batch Selection Banner for Admin */}
      {selectedIds.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
            <Printer className="w-4 h-4 text-[#8B1A1A]" />
            <span>
              {selectedIds.length} Pass{selectedIds.length > 1 ? 'es' : ''} Selected for Admin Printing
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onDeselectAll && (
              <PillButton variant="secondary" size="sm" onClick={onDeselectAll}>
                Clear Selection
              </PillButton>
            )}

            {onBulkAssignZones && (
              <PillButton
                variant="primary"
                size="sm"
                onClick={onBulkAssignZones}
                icon={<ShieldCheck className="w-3.5 h-3.5" />}
              >
                Assign Security Zones ({selectedIds.length})
              </PillButton>
            )}

            {onBatchPrint && (
              <PillButton
                variant="crimson"
                size="sm"
                onClick={onBatchPrint}
                icon={<Layers className="w-3.5 h-3.5" />}
              >
                Batch Print Selected ({selectedIds.length})
              </PillButton>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div role="region" aria-label="Pass records" tabIndex={0} className="overflow-x-auto rounded-2xl border border-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-police-crimson">
        <table className="workspace-table w-full min-w-[840px] text-left text-xs" aria-busy={loading}>
          <caption className="sr-only">Security pass registry</caption>
          <thead className="bg-[#0B2545] text-white">
            <tr>
              {onToggleSelect && (
                <th className="py-3 px-3 text-center w-10">
                  <input
                    aria-label="Select all passes on this page"
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(e) => {
                      if (e.target.checked && onSelectAll) onSelectAll();
                      else if (!e.target.checked && onDeselectAll) onDeselectAll();
                    }}
                    className="w-3.5 h-3.5 rounded text-[#8B1A1A] cursor-pointer"
                  />
                </th>
              )}
              <th className="py-3 px-3.5 font-bold">Pass ID / Token</th>
              <th className="py-3 px-3.5 font-bold">Cardholder &amp; Classification</th>
              <th className="py-3 px-3.5 font-bold">Department / Role</th>
              <th className="py-3 px-3.5 font-bold">Access Zones</th>
              <th className="py-3 px-3.5 font-bold">Status</th>
              <th className="py-3 px-3.5 font-bold text-center">Printed</th>
              <th className="py-3 px-3.5 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {loading || error || passes.length === 0 ? (
              <tr><td colSpan={onToggleSelect ? 8 : 7}><CollectionFeedback loading={loading} error={error} onRetry={onRefresh} filtered={hasFilters} onClear={onClearFilters} /></td></tr>
            ) : (
              passes.map((pass) => (
                <tr key={pass.id} className={`hover:bg-slate-50/80 transition ${selectedIds.includes(pass.id) ? 'bg-amber-50/50' : ''}`}>
                  {onToggleSelect && (
                    <td className="py-3 px-3 text-center">
                      <input
                        aria-label={`Select pass for ${pass.full_name}`}
                        type="checkbox"
                        checked={selectedIds.includes(pass.id)}
                        onChange={() => onToggleSelect(pass.id)}
                        className="w-3.5 h-3.5 rounded text-[#8B1A1A] cursor-pointer"
                      />
                    </td>
                  )}

                  {/* Pass ID & Serial Token */}
                  <td className="py-3 px-3.5">
                    <span className="font-mono font-semibold text-[#0B2545] block text-[11px]">
                      {pass.pass_number}
                    </span>
                    <span className="font-mono text-[9px] text-[#8B1A1A] block">
                      {pass.verification_token}
                    </span>
                  </td>

                  {/* Cardholder & Institution */}
                  <td className="py-3 px-3.5">
                    <span className="font-semibold text-slate-900 block text-xs">
                      {pass.full_name}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {pass.institution ? (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getInstitutionBadge(
                            pass.institution
                          )}`}
                        >
                          {pass.institution === 'Other'
                            ? pass.institution_other || 'External'
                            : pass.institution === 'ICU'
                            ? 'ICI'
                            : pass.institution}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-slate-100 text-slate-500 border-slate-200">
                          {pass.is_imported ? 'Venue Pending' : 'External'}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">{pass.mobile_number}</span>
                    </div>
                  </td>

                  {/* Category & Department */}
                  <td className="py-3 px-3.5">
                    <span className="font-bold text-slate-800 block text-[11px]">
                      {pass.department}
                      {pass.office_id && <span className="block text-slate-500">{OFFICES.find(office => office.id === pass.office_id)?.name}</span>}
                    </span>
                    <span className="text-[10px] text-slate-500 truncate max-w-[180px] block">
                      {pass.category}
                    </span>
                  </td>

                  <td className="py-3 px-3.5">
                    {pass.zone_a || pass.zone_b || pass.zone_c ? (
                      <ul aria-label="Granted access zones" className="flex items-center gap-1">
                        {SECURITY_ZONES.filter(({ field }) => pass[field]).map(({ key, label, badgeTitle, color }) => (
                          <li key={key} className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${zoneChipStyles[color]}`} title={badgeTitle}>
                            <span className="sr-only">{label}</span>
                            <span aria-hidden="true">{key}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="whitespace-nowrap text-xs text-slate-500">No zones</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="py-3 px-3.5">{getStatusBadge(pass.status)}</td>

                  {/* Printed Count */}
                  <td className="py-3 px-3.5 text-center">
                    <span className="font-mono font-bold text-slate-800">
                      {pass.printed_count || 0}
                    </span>
                  </td>

                  <td className="py-3 px-3.5 text-right">
                    <RegistryRowActions
                      pass={pass}
                      onApprove={onApprove}
                      onPrint={onPrint}
                      onPreview={onPreview}
                      onEdit={onEdit}
                      onQueueForPrint={onQueueForPrint}
                      onRevoke={onRevoke}
                      onDelete={onDelete}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <CollectionPagination total={total} page={page} pageSize={pageSize} onPageChange={onPageChange} loading={loading} />
    </section>
  );
};
