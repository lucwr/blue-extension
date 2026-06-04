/**
 * Horizontal progress strip rendered at the top of the workflow.
 * Each step shows its current state derived from the existing store
 * (`step`, `jd`, `resume`, `proposal`, `bidReport`).
 */
import type { FC } from 'react';

type StepState = 'idle' | 'busy' | 'done';

interface StepConfig {
  key: string;
  label: string;
  state: StepState;
}

interface Props {
  steps: ReadonlyArray<StepConfig>;
}

const STATE_DOT: Record<StepState, string> = {
  idle: 'bg-slate-200 ring-2 ring-white',
  busy: 'bg-brand-500 ring-2 ring-brand-100 animate-pulse',
  done: 'bg-emerald-500 ring-2 ring-emerald-100',
};

const STATE_LABEL: Record<StepState, string> = {
  idle: 'text-slate-400',
  busy: 'text-brand-700 font-medium',
  done: 'text-emerald-700',
};

const STATE_BAR: Record<StepState, string> = {
  idle: 'bg-slate-200',
  busy: 'bg-gradient-to-r from-brand-500 to-brand-200',
  done: 'bg-emerald-400',
};

export const ProgressStep: FC<Props> = ({ steps }) => (
  <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-4 py-2">
    {steps.map((s, i) => (
      <div key={s.key} className="flex flex-1 items-center gap-1">
        <div className="flex flex-col items-center gap-0.5">
          <span className={`h-2 w-2 rounded-full transition-colors ${STATE_DOT[s.state]}`} />
          <span className={`text-[9px] uppercase tracking-wide transition-colors ${STATE_LABEL[s.state]}`}>
            {s.label}
          </span>
        </div>
        {i < steps.length - 1 && (
          <span className={`mt-[-12px] h-px flex-1 transition-colors ${STATE_BAR[s.state]}`} />
        )}
      </div>
    ))}
  </div>
);
