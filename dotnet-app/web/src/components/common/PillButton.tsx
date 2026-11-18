import React from 'react';

interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'crimson' | 'outline' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const PillButton: React.FC<PillButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'rounded-full font-semibold transition-all duration-200 inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none shadow-sm whitespace-nowrap';

  const sizeStyles = {
    sm: 'min-h-9 text-xs px-3.5 py-2',
    md: 'min-h-11 text-xs px-4 py-2.5',
    lg: 'min-h-12 text-sm px-6 py-3',
  };

  const variantStyles = {
    primary:
      'bg-[#0B2545] text-white hover:bg-[#133E6D] focus:ring-[#0B2545] border border-[#0B2545]',
    crimson:
      'bg-[#8B1A1A] text-white hover:bg-[#A32020] focus:ring-[#8B1A1A] border border-[#8B1A1A]',
    secondary:
      'bg-slate-100 text-slate-800 hover:bg-slate-200 focus:ring-slate-300 border border-slate-200',
    outline:
      'bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-200 border border-slate-300',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500 border border-rose-600',
    ghost:
      'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-transparent shadow-none',
    success:
      'bg-emerald-700 text-white hover:bg-emerald-800 focus:ring-emerald-600 border border-emerald-700',
  };

  return (
    <button
      type="button"
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};
