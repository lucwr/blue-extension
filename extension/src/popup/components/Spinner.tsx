import type { FC } from 'react';

/**
 * Inline SVG spinner — a single rotating arc on a track ring. Pure CSS,
 * no external dependencies. Defaults to the brand-blue accent.
 */
export const Spinner: FC<{ className?: string; label?: string }> = ({
  className = 'h-3.5 w-3.5',
  label,
}) => (
  <svg
    viewBox="0 0 24 24"
    className={`${className} animate-spin`}
    aria-label={label ?? 'Loading'}
    role="status"
  >
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="3" />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

type Tone = 'pending' | 'busy' | 'done' | 'idle';

/**
 * Compact status chip rendered in each panel header so users see, at a
 * glance, what's happening on that section: greyed when nothing's
 * happened yet, an animated spinner during work, and a green check
 * after success.
 */
export const StatusChip: FC<{ tone: Tone; text: string }> = ({ tone, text }) => {
  const styles: Record<Tone, string> = {
    pending: 'bg-slate-100 text-slate-500',
    busy: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200',
    done: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
    idle: 'bg-slate-100 text-slate-500',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[tone]}`}
    >
      {tone === 'busy' && <Spinner className="h-2.5 w-2.5" />}
      {tone === 'done' && (
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {text}
    </span>
  );
};
