'use client';

import { useEffect, useRef } from 'react';

const openDialogs: symbol[] = [];
let originalOverflow = '';

/** Keep keyboard focus inside the top dialog and restore it to its trigger. */
export function useDialog(isOpen: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const token = Symbol('dialog');
    const previousFocus = document.activeElement as HTMLElement | null;
    if (openDialogs.length === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogs.push(token);
    const frame = requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
    const handleKey = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== token) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key === 'Tab' && ref.current) {
        const targets = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (!first) { event.preventDefault(); ref.current.focus({ preventScroll: true }); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKey);
      const index = openDialogs.indexOf(token);
      if (index >= 0) openDialogs.splice(index, 1);
      if (!openDialogs.length) document.body.style.overflow = originalOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [isOpen]);

  return ref;
}
