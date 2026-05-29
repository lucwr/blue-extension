import type { FC } from 'react';
import type { FlowStep } from '../store';
import type { AppError } from '@/types/messages';

const LABELS: Record<FlowStep, string> = {
  idle: 'Ready',
  extracting: 'Extracting job description…',
  'generating-resume': 'Generating ATS-optimized resume…',
  'generating-proposal': 'Generating tailored proposal…',
};

interface Props {
  step: FlowStep;
  error: AppError | null;
}

export const StatusBar: FC<Props> = ({ step, error }) => {
  const busy = step !== 'idle';
  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs">
      {error ? (
        <div className="flex items-start gap-2 text-red-700">
          <span className="font-semibold uppercase tracking-wide">{error.code}</span>
          <span>{error.message}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-slate-600">
          {busy && (
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />
          )}
          <span>{LABELS[step]}</span>
        </div>
      )}
    </div>
  );
};
