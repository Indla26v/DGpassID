'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react';

export interface SidebarSection<T extends string> {
  id: T;
  label: string;
  hint?: string;
  Icon: LucideIcon;
}

/**
 * Section menu for a portal. On large screens it renders into the page's left-edge sidebar
 * (#section-sidebar, provided by the page layout) and can collapse to icons; on small screens it
 * shows as a row of tabs above the content.
 */
export function SectionSidebar<T extends string>({
  title, storageKey, sections, active, onChange,
}: {
  title: string;
  storageKey: string;
  sections: SidebarSection<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [navOffset, setNavOffset] = useState(0);

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

  const toggle = () => setCollapsed(current => {
    try { window.localStorage.setItem(`${storageKey}-collapsed`, current ? '0' : '1'); } catch { /* storage unavailable */ }
    return !current;
  });

  if (sections.length < 2) return null;

  return (
    <>
      <nav aria-label={`${title} sections`} className="operations-panel p-1.5 lg:hidden">
        <ul className="flex gap-1 overflow-x-auto">
          {sections.map(({ id, label, Icon }) => {
            const isActive = active === id;
            return (
              <li key={id} className="shrink-0">
                <button type="button" aria-current={isActive ? 'page' : undefined} onClick={() => onChange(id)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${isActive
                    ? 'bg-police-navy text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}`}>
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
          className={`sticky flex flex-col gap-1 p-2 transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-56'}`}>
          <button type="button" onClick={toggle} aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} title={collapsed ? 'Expand menu' : 'Collapse menu'}
            className={`mb-1 flex items-center gap-2 rounded-xl py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-100 hover:text-police-navy ${collapsed ? 'justify-center' : 'justify-between px-3'}`}>
            {!collapsed && <span className="truncate">{title}</span>}
            {collapsed ? <PanelLeftOpen aria-hidden="true" className="size-4 shrink-0" /> : <PanelLeftClose aria-hidden="true" className="size-4 shrink-0" />}
          </button>
          <ul className="flex flex-col gap-1">
            {sections.map(({ id, label, hint, Icon }) => {
              const isActive = active === id;
              return (
                <li key={id}>
                  <button type="button" aria-current={isActive ? 'page' : undefined} onClick={() => onChange(id)}
                    title={collapsed ? label : undefined} aria-label={label}
                    className={`flex w-full items-center gap-2.5 rounded-xl py-2.5 text-left transition-colors ${collapsed ? 'justify-center' : 'px-3'} ${isActive
                      ? 'bg-police-navy text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}`}>
                    <Icon aria-hidden="true" className={`size-[18px] shrink-0 ${isActive ? 'text-white' : 'text-police-crimson'}`} />
                    {!collapsed && (
                      <span className="min-w-0">
                        <span className="block whitespace-nowrap text-sm font-semibold">{label}</span>
                        {hint && <span className={`block text-[11px] ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>{hint}</span>}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>,
        slot,
      )}
    </>
  );
}
