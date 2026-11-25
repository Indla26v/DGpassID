'use client';

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: string;
  count?: number;
  badge?: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  icon?: React.ReactNode;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  wrapValue?: boolean;
}

export function CustomSelect({
  value,
  onChange,
  options,
  icon,
  placeholder = 'Select option…',
  searchable = false,
  className = '',
  ariaLabel = placeholder,
  disabled = false,
  wrapValue = false,
}: CustomSelectProps) {
  const id = useId();
  const listId = `${id}-list`;
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<React.CSSProperties>({ visibility: 'hidden' });

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];
  const query = search.trim().toLowerCase();
  const visibleOptions = query ? options.filter((option) => option.label.toLowerCase().includes(query)) : options;
  const currentIndex = Math.min(activeIndex, visibleOptions.length - 1);
  const activeId = isOpen && currentIndex >= 0 ? `${id}-option-${currentIndex}` : undefined;

  function close(restoreFocus = false) {
    setIsOpen(false);
    setSearch('');
    if (restoreFocus) triggerRef.current?.focus();
  }

  function open(index = Math.max(0, selectedIndex)) {
    setPosition({ visibility: 'hidden' });
    setActiveIndex(index);
    setIsOpen(true);
  }

  function choose(option: CustomSelectOption) {
    if (option.value !== value) onChange(option.value);
    close(true);
  }

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const gap = 6;
      const margin = 8;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(Math.max(rect.width, 240), viewportWidth - margin * 2);
      const left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin));
      const below = viewportHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      const opensUp = below < 250 && above > below;
      setPosition({
        left,
        width,
        maxHeight: Math.max(0, Math.min(300, opensUp ? above : below)),
        top: opensUp ? undefined : rect.bottom + gap,
        bottom: opensUp ? viewportHeight - rect.top + gap : undefined,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !popupRef.current?.contains(event.target)) updatePosition();
    };
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !triggerRef.current?.contains(event.target) && !popupRef.current?.contains(event.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [isOpen]);

  const isPositioned = position.visibility !== 'hidden';
  useEffect(() => {
    if (isOpen && isPositioned && searchable) searchRef.current?.focus({ preventScroll: true });
  }, [isOpen, isPositioned, searchable]);

  useEffect(() => {
    if (!isOpen || !activeRef.current) return;
    const option = activeRef.current;
    const list = option.parentElement;
    if (!list) return;
    const optionRect = option.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (optionRect.top < listRect.top) list.scrollTop -= listRect.top - optionRect.top;
    if (optionRect.bottom > listRect.bottom) list.scrollTop += optionRect.bottom - listRect.bottom;
  }, [isOpen, currentIndex, query]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const { key } = event;
    const fromSearch = event.target === searchRef.current;
    if (key === 'Tab' && isOpen) {
      close(fromSearch);
      return;
    }

    if (key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }

    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const delta = key === 'ArrowDown' ? 1 : -1;
      if (!isOpen) {
        open(selectedIndex >= 0 ? selectedIndex : delta === 1 ? 0 : options.length - 1);
      } else if (visibleOptions.length) {
        setActiveIndex(Math.max(0, Math.min(visibleOptions.length - 1, currentIndex + delta)));
      }
      return;
    }

    if (isOpen && !fromSearch && (key === 'Home' || key === 'End')) {
      event.preventDefault();
      setActiveIndex(key === 'Home' ? 0 : Math.max(0, visibleOptions.length - 1));
      return;
    }

    if (isOpen && (key === 'Enter' || (key === ' ' && !fromSearch))) {
      event.preventDefault();
      const option = visibleOptions[currentIndex];
      if (option) choose(option);
    }
  }

  const popup = isOpen && (
    <div
      ref={popupRef}
      style={position}
      className="fixed z-[80] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl motion-safe:animate-[workspace-fade_150ms_ease-out]"
    >
      {searchable && (
        <div className="relative mb-1.5 shrink-0">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            ref={searchRef}
            type="search"
            aria-label={`Search ${ariaLabel.toLowerCase()} options`}
            aria-controls={listId}
            aria-activedescendant={activeId}
            placeholder="Search options"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="operations-input pl-9 pr-3"
          />
        </div>
      )}
      <div id={listId} role="listbox" aria-labelledby={labelId} className="min-h-0 space-y-0.5 overflow-y-auto overscroll-contain">
        {visibleOptions.map((option, index) => {
          const isSelected = option.value === value;
          const isActive = index === currentIndex;
          return (
            <div
              key={option.value}
              id={`${id}-option-${index}`}
              ref={isActive ? activeRef : undefined}
              role="option"
              aria-selected={isSelected}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
              className={`flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-slate-100 ${isActive ? 'bg-slate-100' : ''} ${isSelected ? 'font-semibold text-police-crimson' : 'text-slate-700'}`}
            >
              <span className="min-w-0 break-words">{option.label}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                {option.count !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums">{option.count}</span>}
                {isSelected && <Check aria-hidden="true" className="size-4" />}
              </span>
            </div>
          );
        })}
      </div>
      {visibleOptions.length === 0 && <p role="status" className="px-3 py-2 text-sm text-slate-600">No matching options</p>}
    </div>
  );

  return (
    <div
      className={`relative min-w-0 ${className}`}
      onBlur={(event) => {
        const target = event.relatedTarget;
        if (target && (triggerRef.current?.contains(target) || popupRef.current?.contains(target))) return;
        if (isOpen) close();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listId : undefined}
        aria-expanded={isOpen}
        aria-activedescendant={!searchable ? activeId : undefined}
        disabled={disabled}
        onClick={() => isOpen ? close(true) : open()}
        onKeyDown={handleKeyDown}
        className={`operations-input operations-action flex items-center justify-between gap-2 px-3.5 text-left font-medium disabled:cursor-not-allowed disabled:opacity-60 ${wrapValue ? 'py-2' : ''} ${isOpen ? 'border-police-crimson bg-white ring-2 ring-police-crimson/15' : ''}`}
      >
        <span id={labelId} className="sr-only">{ariaLabel}</span>
        <span className="flex min-w-0 items-center gap-2">
          {icon && <span aria-hidden="true" className="shrink-0 text-slate-500">{icon}</span>}
          <span id={valueId} className={wrapValue ? 'break-words leading-snug' : 'truncate'}>{selected?.label ?? placeholder}</span>
        </span>
        <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
          {selected?.count !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums">{selected.count}</span>}
          <ChevronDown className={`size-4 text-slate-500 motion-safe:transition-transform motion-safe:duration-200 ${isOpen ? 'rotate-180 text-police-crimson' : ''}`} />
        </span>
      </button>
      {popup && createPortal(popup, triggerRef.current?.closest('[role="dialog"]') ?? document.body)}
    </div>
  );
}
