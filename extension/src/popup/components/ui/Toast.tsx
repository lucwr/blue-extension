/**
 * Transient toast surface. Renders one or zero toasts at a time. Auto-
 * dismisses after `ttlMs` (default 2500ms). UI-only — does NOT touch any
 * existing business logic.
 */
import { useEffect, useState, type FC } from 'react';

export type ToastKind = 'success' | 'info' | 'error';

interface ToastState {
  id: number;
  kind: ToastKind;
  text: string;
}

let setExternal: ((t: ToastState) => void) | null = null;
let counter = 0;

/** Imperative API any component can call: `toast.success('PDF saved')`. */
export const toast = {
  success: (text: string): void => {
    setExternal?.({ id: ++counter, kind: 'success', text });
  },
  info: (text: string): void => {
    setExternal?.({ id: ++counter, kind: 'info', text });
  },
  error: (text: string): void => {
    setExternal?.({ id: ++counter, kind: 'error', text });
  },
};

const KIND_CLASSES: Record<ToastKind, string> = {
  success: 'bg-emerald-600 text-white ring-emerald-700/30',
  info: 'bg-slate-800 text-white ring-slate-900/30',
  error: 'bg-red-600 text-white ring-red-700/30',
};

const KIND_ICONS: Record<ToastKind, FC<{ className?: string }>> = {
  success: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  info: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
    </svg>
  ),
  error: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  ),
};

interface Props {
  ttlMs?: number;
}

export const ToastHost: FC<Props> = ({ ttlMs = 2500 }) => {
  const [current, setCurrent] = useState<ToastState | null>(null);

  useEffect(() => {
    setExternal = (t: ToastState): void => setCurrent(t);
    return () => {
      setExternal = null;
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    const id = window.setTimeout(() => setCurrent(null), ttlMs);
    return () => window.clearTimeout(id);
  }, [current, ttlMs]);

  if (!current) return null;
  const Icon = KIND_ICONS[current.kind];

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-3 z-50 -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg ring-1 ${KIND_CLASSES[current.kind]} animate-[rmToastIn_180ms_ease-out]`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{current.text}</span>
      </div>
    </div>
  );
};
