import type { FC } from 'react';
import type { FlowStep } from '../store';
import type { AppError } from '@/types/messages';
import { Spinner } from './Spinner';

const LABELS: Record<FlowStep, string> = {
  idle: 'Ready',
  extracting: 'Extracting job description…',
  'generating-resume': 'Generating ATS-optimized resume…',
  'generating-proposal': 'Generating tailored proposal…',
  'auto-filling': 'Auto-filling bid form…',
  'answering-questions': 'Drafting answers to bid questions…',
};

const AlertIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="8" x2="12" y2="13" />
    <circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
  </svg>
);

const CheckIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

interface Props {
  step: FlowStep;
  error: AppError | null;
}

export const StatusBar: FC<Props> = ({ step, error }) => {
  const busy = step !== 'idle';

  if (error) {
    return (
      <div className="border-t border-red-200 bg-red-50 px-4 py-2">
        <div className="flex items-start gap-2 text-xs text-red-700">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-red-600">
              {error.code}
            </div>
            <div className="truncate text-red-700">{error.message}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden border-t border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-2 text-xs">
      <div className="flex items-center gap-2">
        {busy ? (
          <Spinner className="h-3.5 w-3.5 text-brand-600" />
        ) : (
          <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
        )}
        <span className={busy ? 'font-medium text-slate-700' : 'text-slate-500'}>
          {LABELS[step]}
        </span>
      </div>
      {busy && (
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand-500 to-transparent"
          style={{ animation: 'rmShimmer 1.5s ease-in-out infinite' }}
        />
      )}
    </div>
  );
};
