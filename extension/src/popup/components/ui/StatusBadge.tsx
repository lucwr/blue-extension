/**
 * Status badge — one of five tones matching the canonical workflow states
 * required in the spec: not-started, busy, completed, failed, ready.
 * Renders a tiny dot/spinner/check icon next to the label.
 */
import type { FC } from 'react';
import { Spinner } from '../Spinner';

export type StatusTone = 'idle' | 'ready' | 'busy' | 'done' | 'failed';

interface Props {
  tone: StatusTone;
  label: string;
}

const TONE_CLASSES: Record<StatusTone, string> = {
  idle: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200',
  ready: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200',
  busy: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200',
  done: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  failed: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
};

const DotIcon: FC<{ className?: string }> = ({ className }) => (
  <span className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${className ?? ''}`} />
);

const CheckIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const StatusBadge: FC<Props> = ({ tone, label }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${TONE_CLASSES[tone]}`}
  >
    {tone === 'busy' ? (
      <Spinner className="h-2.5 w-2.5" />
    ) : tone === 'done' ? (
      <CheckIcon className="h-2.5 w-2.5" />
    ) : tone === 'failed' ? (
      <XIcon className="h-2.5 w-2.5" />
    ) : (
      <DotIcon />
    )}
    {label}
  </span>
);
