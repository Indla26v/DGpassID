import type { ReactNode } from 'react';

export function OperationsHeader({ title, description, children }: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="operations-banner operations-enter flex flex-wrap items-center justify-between gap-x-6 gap-y-3 md:flex-nowrap">
      <div className="min-w-0 md:flex-1">
        <h2 className="operations-heading">{title}</h2>
        <p className="mt-1 text-sm text-slate-200">{description}</p>
      </div>
      {children && <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 md:max-w-[54%]">{children}</div>}
    </header>
  );
}
