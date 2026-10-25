'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'warning' | 'danger' | 'info';

interface ToastItem {
  leaving?: boolean;
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail-safe no-op so a missing provider never crashes the UI.
    return { toast: () => undefined };
  }
  return ctx;
}

const ICON = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info
} as const;

const DURATION = 4200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    // Fade out first (EasyLife's toast-inline--leaving), then remove.
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 220);
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'success') => {
      const id = `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, message, variant }]);
      const timer = setTimeout(() => dismiss(id), DURATION);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div className="toast-stack" role="region" aria-label="Notifications">
              <div aria-live="polite" aria-atomic="false" className="toast-stack__inner">
                {toasts.map((item) => {
                  const Icon = ICON[item.variant];
                  const variantClass = item.variant === 'success' ? '' : ` toast-inline--${item.variant}`;
                  return (
                    <div
                      key={item.id}
                      className={`toast-inline${variantClass}${item.leaving ? ' toast-inline--leaving' : ''}`}
                      role={item.variant === 'danger' || item.variant === 'warning' ? 'alert' : 'status'}
                    >
                      <Icon size={17} className="toast-inline__icon" aria-hidden="true" />
                      <span className="toast-inline__message">{item.message}</span>
                      <button
                        type="button"
                        className="toast-inline__close"
                        aria-label="Dismiss notification"
                        onClick={() => dismiss(item.id)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </ToastContext.Provider>
  );
}

/** Standalone inline toast (for in-panel usage). */
export function Toast({
  message,
  onDismiss,
  variant = 'success'
}: {
  message: string;
  onDismiss?: () => void;
  variant?: ToastVariant;
}) {
  const Icon = ICON[variant];
  const variantClass = variant === 'success' ? '' : ` toast-inline--${variant}`;
  return (
    <div
      className={`toast-inline${variantClass}${''}`}
      role={variant === 'danger' || variant === 'warning' ? 'alert' : 'status'}
    >
      <Icon size={17} className="toast-inline__icon" aria-hidden="true" />
      <span className="toast-inline__message">{message}</span>
      {onDismiss ? (
        <button type="button" className="toast-inline__close" aria-label="Dismiss notification" onClick={onDismiss}>
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
