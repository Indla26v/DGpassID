'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react';

export interface SidebarSection<T extends string> {
  id: T;
  label: string;
  hint?: string;
  Icon: LucideIcon;
}

/** A dropdown entry in the menu that holds related sections. */
export interface SidebarGroup<T extends string> {
  group: string;
  label: string;
  hint?: string;
  Icon: LucideIcon;
  items: SidebarSection<T>[];
}

export type SidebarEntry<T extends string> = SidebarSection<T> | SidebarGroup<T>;

const isGroup = <T extends string>(entry: SidebarEntry<T>): entry is SidebarGroup<T> => 'items' in entry;

/**
 * Section menu for a portal. On large screens it renders into the page's left-edge sidebar
 * (#section-sidebar, provided by the page layout) and can collapse to icons; on small screens it
 * shows as a row of tabs above the content. Groups open as a dropdown in the sidebar and are
 * flattened into the tab row.
 */
export function SectionSidebar<T extends string>({
  title, storageKey, sections, active, onChange,
}: {
  title: string;
  storageKey: string;
  sections: SidebarEntry<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [navOffset, setNavOffset] = useState(0);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const flat = sections.flatMap(entry => (isGroup(entry) ? entry.items : [entry]));
  const groupKeys = sections.filter(isGroup).map(entry => entry.group).join('|');

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(`${storageKey}-collapsed`) === '1'); } catch { /* storage unavailable */ }
    setSlot(document.getElementById('section-sidebar'));
    const header = document.querySelector<HTMLElement>('body header');
    if (!header) return;
    const update = () => setNavOffset(header.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, [storageKey]);

  // Remembered open / closed state of each group.
  useEffect(() => {
    const remembered: Record<string, boolean> = {};
    for (const group of groupKeys ? groupKeys.split('|') : []) {
      try { remembered[group] = window.localStorage.getItem(`${storageKey}-group-${group}`) === '1'; } catch { /* storage unavailable */ }
    }
    setOpenGroups(remembered);
  }, [storageKey, groupKeys]);

  const toggle = () => setCollapsed(current => {
    try { window.localStorage.setItem(`${storageKey}-collapsed`, current ? '0' : '1'); } catch { /* storage unavailable */ }
    return !current;
  });
  const toggleGroup = (group: string, open: boolean) => setOpenGroups(current => {
    try { window.localStorage.setItem(`${storageKey}-group-${group}`, open ? '1' : '0'); } catch { /* storage unavailable */ }
    return { ...current, [group]: open };
  });

  if (flat.length < 2) return null;

  const item = ({ id, label, hint, Icon }: SidebarSection<T>, nested = false) => {
    const isActive = active === id;
    return (
      <li key={id}>
        <button type="button" aria-current={isActive ? 'page' : undefined} onClick={() => onChange(id)}
          title={collapsed ? label : hint} aria-label={label}
          className={`flex w-full items-center gap-2 rounded-lg py-1.5 text-left transition-colors ${collapsed ? 'justify-center' : nested ? 'pl-2.5 pr-2' : 'px-2.5'} ${isActive
            ? 'bg-police-crimson text-white shadow-md shadow-black/20' : 'text-slate-200 hover:bg-white/10 hover:text-white'}`}>
          <Icon aria-hidden="true" className={`size-4 shrink-0 text-white`} />
          {!collapsed && <span className="min-w-0 truncate text-[13.5px] font-bold tracking-[0.01em]">{label}</span>}
        </button>
      </li>
    );
  };

  const group = (entry: SidebarGroup<T>) => {
    const containsActive = entry.items.some(section => section.id === active);
    // In icon mode the items are shown directly, between dividers, so they stay one click away.
    if (collapsed) {
      return (
        <li key={entry.group} className="border-y border-white/15 py-0.5">
          <ul aria-label={entry.label} className="flex flex-col gap-0.5">{entry.items.map(section => item(section))}</ul>
        </li>
      );
    }
    const open = containsActive || Boolean(openGroups[entry.group]);
    const listId = `${storageKey}-group-${entry.group}-items`;
    return (
      <li key={entry.group}>
        <button type="button" aria-expanded={open} aria-controls={listId} title={entry.hint}
          onClick={() => toggleGroup(entry.group, !open)}
          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${containsActive
            ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/10 hover:text-white'}`}>
          <entry.Icon aria-hidden="true" className="size-4 shrink-0 text-white" />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold tracking-[0.01em]">{entry.label}</span>
          <ChevronDown aria-hidden="true" className={`size-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <ul id={listId} className="ml-[17px] mt-0.5 flex flex-col gap-0.5 border-l border-white/20 pl-1.5">
            {entry.items.map(section => item(section, true))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      <nav aria-label={`${title} sections`} className="operations-panel p-1.5 lg:hidden">
        <ul className="flex gap-1 overflow-x-auto">
          {flat.map(({ id, label, Icon }) => {
            const isActive = active === id;
            return (
              <li key={id} className="shrink-0">
                <button type="button" aria-current={isActive ? 'page' : undefined} onClick={() => onChange(id)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${isActive
                    ? 'bg-police-crimson text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}`}>
                  <Icon aria-hidden="true" className={`size-4 shrink-0 ${isActive ? 'text-white' : 'text-police-crimson'}`} />
                  <span className="whitespace-nowrap">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {slot && createPortal(
        <nav aria-label={`${title} sections`} style={{ top: navOffset }}
          className={`sticky flex flex-col gap-0.5 p-1.5 transition-[width] duration-200 ${collapsed ? 'w-14' : 'w-48'}`}>
          <button type="button" onClick={toggle} aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} title={collapsed ? 'Expand menu' : 'Collapse menu'}
            className={`mb-0.5 flex items-center gap-2 rounded-lg py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-300 hover:bg-white/10 hover:text-white ${collapsed ? 'justify-center' : 'justify-between px-2.5'}`}>
            {!collapsed && <span className="truncate">{title}</span>}
            {collapsed ? <PanelLeftOpen aria-hidden="true" className="size-4 shrink-0" /> : <PanelLeftClose aria-hidden="true" className="size-4 shrink-0" />}
          </button>
          <ul className="flex flex-col gap-0.5">
            {sections.map(entry => (isGroup(entry) ? group(entry) : item(entry)))}
          </ul>
        </nav>,
        slot,
      )}
    </>
  );
}
