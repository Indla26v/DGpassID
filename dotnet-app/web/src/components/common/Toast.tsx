import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  removeToast: (id: string) => void;
  success: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration: number = 6000) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { id, message, type, title, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((title: string, message?: string) => {
    showToast(message || '', 'success', title);
  }, [showToast]);

  const warning = useCallback((title: string, message?: string) => {
    showToast(message || '', 'warning', title);
  }, [showToast]);

  const error = useCallback((title: string, message?: string) => {
    showToast(message || '', 'error', title);
  }, [showToast]);

  const info = useCallback((title: string, message?: string) => {
    showToast(message || '', 'info', title);
  }, [showToast]);

  return (
    <ToastContext.Provider
      value={{ toasts, showToast, removeToast, success, warning, error, info }}
    >
      {children}
      {/* Toast Overlay Container */}
      <div
        aria-live="polite"
        className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((t) => {
          let bgClass = 'bg-white border-slate-200 text-slate-800';
          let iconColor = 'text-blue-600 bg-blue-50';
          let IconComponent = Info;

          if (t.type === 'warning') {
            bgClass = 'bg-amber-50/95 border-amber-300 text-amber-950 shadow-amber-900/10';
            iconColor = 'text-amber-700 bg-amber-100';
            IconComponent = AlertTriangle;
          } else if (t.type === 'error') {
            bgClass = 'bg-rose-50/95 border-rose-300 text-rose-950 shadow-rose-900/10';
            iconColor = 'text-rose-700 bg-rose-100';
            IconComponent = XCircle;
          } else if (t.type === 'success') {
            bgClass = 'bg-emerald-50/95 border-emerald-300 text-emerald-950 shadow-emerald-900/10';
            iconColor = 'text-emerald-700 bg-emerald-100';
            IconComponent = CheckCircle2;
          }

          return (
            <div
              key={t.id}
              role="alert"
              className={`pointer-events-auto flex items-start gap-3.5 p-4 rounded-2xl border shadow-lg backdrop-blur-sm transition-all duration-300 ${bgClass}`}
            >
              <div className={`p-2 rounded-xl shrink-0 ${iconColor}`}>
                <IconComponent className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                {t.title && (
                  <p className="font-semibold text-sm tracking-tight leading-snug">
                    {t.title}
                  </p>
                )}
                {t.message && (
                  <p className="text-xs leading-relaxed opacity-90 mt-0.5 break-words">
                    {t.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                aria-label="Dismiss toast"
                className="shrink-0 p-1.5 rounded-full hover:bg-black/5 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;

