'use client';

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

/** Dropdown with a searchable checkbox list, styled like CustomSelect. */
export function MultiSelectDropdown({
  ariaLabel,
  options,
  value,
  onChange,
  placeholder = 'Choose…',
  emptyLabel,
}: {
  ariaLabel: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  /** Text shown when nothing is chosen (e.g. "All districts"). */
  emptyLabel?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState<React.CSSProperties>({ visibility: 'hidden' });

  const query = search.trim().toLowerCase();
  const visible = query ? options.filter(option => option.toLowerCase().includes(query)) : options;
  const chosen = new Set(value);
  const summary = value.length === 0
    ? emptyLabel ?? placeholder
    : value.length <= 2 ? value.join(', ') : `${value.slice(0, 2).join(', ')} +${value.length - 2} more`;

  const close = (restoreFocus = false) => {
    setIsOpen(false);
    setSearch('');
    if (restoreFocus) triggerRef.current?.focus();
  };
  const toggle = (option: string) =>
    onChange(chosen.has(option) ? value.filter(item => item !== option) : [...value, option]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = 6;
      const margin = 8;
      const viewportWidth = document.documentElement.clientWidth;
      const width = Math.min(Math.max(rect.width, 260), viewportWidth - margin * 2);
      const left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin));
      const below = window.innerHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      const opensUp = below < 280 && above > below;
      setPosition({
        left, width,
        maxHeight: Math.max(0, Math.min(360, opensUp ? above : below)),
        top: opensUp ? undefined : rect.bottom + gap,
        bottom: opensUp ? window.innerHeight - rect.top + gap : undefined,
      });
    };
    update();
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !popupRef.current?.contains(event.target)) update();
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !triggerRef.current?.contains(event.target) && !popupRef.current?.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && position.visibility !== 'hidden') searchRef.current?.focus({ preventScroll: true });
  }, [isOpen, position.visibility]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };

  const popup = isOpen && (
    <div ref={popupRef} style={position} onKeyDown={onKeyDown}
      className="fixed z-[80] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl motion-safe:animate-[workspace-fade_150ms_ease-out]">
      <div className="relative mb-1.5 shrink-0">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <input ref={searchRef} type="search" value={search} onChange={event => setSearch(event.target.value)}
          aria-label={`Search ${ariaLabel.toLowerCase()}`} placeholder="Search" className="operations-input pl-9 pr-3" />
      </div>
      <div className="mb-1 flex shrink-0 items-center justify-between gap-2 px-2 text-xs">
        <span className="text-slate-500">{value.length ? `${value.length} selected` : emptyLabel ?? 'None selected'}</span>
        <span className="flex gap-3">
          {visible.length > 0 && (
            <button type="button" className="font-semibold text-police-navy hover:underline"
              onClick={() => onChange([...new Set([...value, ...visible])])}>
              Select {query ? 'shown' : 'all'}
            </button>
          )}
          {value.length > 0 && (
            <button type="button" className="font-semibold text-police-crimson hover:underline" onClick={() => onChange([])}>Clear</button>
          )}
        </span>
      </div>
      <ul id={`${id}-list`} aria-label={ariaLabel} className="min-h-0 space-y-0.5 overflow-y-auto overscroll-contain">
        {visible.map(option => (
          <li key={option}>
            <label className={`flex min-h-9 cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm hover:bg-slate-100 ${chosen.has(option) ? 'font-semibold text-police-crimson' : 'text-slate-700'}`}>
              <input type="checkbox" checked={chosen.has(option)} onChange={() => toggle(option)} className="size-4 shrink-0 accent-police-crimson" />
              <span className="min-w-0 flex-1 break-words">{option}</span>
              {chosen.has(option) && <Check aria-hidden="true" className="size-4 shrink-0" />}
            </label>
          </li>
        ))}
      </ul>
      {visible.length === 0 && <p role="status" className="px-3 py-2 text-sm text-slate-600">No matching options</p>}
    </div>
  );

  return (
    <div className="relative min-w-0">
      <button ref={triggerRef} type="button" aria-haspopup="true" aria-expanded={isOpen} aria-controls={isOpen ? `${id}-list` : undefined}
        aria-label={`${ariaLabel}: ${summary}`}
        onClick={() => (isOpen ? close(true) : (setPosition({ visibility: 'hidden' }), setIsOpen(true)))}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' && !isOpen) { event.preventDefault(); setPosition({ visibility: 'hidden' }); setIsOpen(true); }
          else onKeyDown(event);
        }}
        className={`operations-input operations-action flex items-center justify-between gap-2 px-3.5 text-left font-medium ${isOpen ? 'border-police-crimson bg-white ring-2 ring-police-crimson/15' : ''}`}>
        <span className={`truncate ${value.length ? '' : 'text-slate-600'}`}>{summary}</span>
        <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
          {value.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums">{value.length}</span>}
          <ChevronDown className={`size-4 text-slate-500 motion-safe:transition-transform motion-safe:duration-200 ${isOpen ? 'rotate-180 text-police-crimson' : ''}`} />
        </span>
      </button>
      {popup && createPortal(popup, triggerRef.current?.closest('[role="dialog"]') ?? document.body)}
    </div>
  );
}
