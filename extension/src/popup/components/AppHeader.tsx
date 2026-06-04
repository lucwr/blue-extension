/**
 * AppHeader — top bar of the popup. View-only component. The refresh
 * handler is the exact same `refresh()` function from `usePopupStore` —
 * we only pass it through, never wrap or transform it.
 */
import type { FC } from 'react';
import { GhostButton } from './ui';

type View = 'job' | 'profile';

interface Props {
  view: View;
  onSwitchView: (next: View) => void;
  onRefresh: () => void;
  canRefresh: boolean;
}

const StarMark: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <defs>
      <linearGradient id="rm-star-grad" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#8FC0FF" />
        <stop offset="45%" stopColor="#2F7DFF" />
        <stop offset="100%" stopColor="#0F3A99" />
      </linearGradient>
    </defs>
    <polygon
      points="50,5 60.58,36.41 92.80,36.10 67.12,55.56 76.45,82.36 50,67 23.55,82.36 32.88,55.56 7.20,37.64 39.42,36.41"
      fill="url(#rm-star-grad)"
      stroke="#0A2865"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const RefreshIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M21 12a9 9 0 1 1-3.5-7.1" />
    <path d="M21 4v6h-6" />
  </svg>
);

const TabButton: FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
      active
        ? 'bg-white text-brand-700 shadow-sm ring-1 ring-inset ring-slate-200'
        : 'text-slate-500 hover:text-slate-900'
    }`}
    role="tab"
    aria-selected={active}
  >
    {children}
  </button>
);

export const AppHeader: FC<Props> = ({ view, onSwitchView, onRefresh, canRefresh }) => (
  <header className="relative flex items-center justify-between border-b border-slate-200 bg-gradient-to-b from-white to-slate-50/80 px-4 py-2.5 backdrop-blur">
    <div className="flex items-center gap-2.5">
      <span className="relative inline-flex h-8 w-8 items-center justify-center">
        <StarMark className="h-7 w-7 drop-shadow-sm" />
      </span>
      <div className="leading-tight">
        <div className="text-sm font-bold text-slate-900">Resume Maker</div>
        <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-400">
          AI job bidding · v0.1
        </div>
      </div>
    </div>
    <div className="flex items-center gap-1.5">
      <GhostButton
        size="sm"
        onClick={onRefresh}
        disabled={!canRefresh}
        title="Clear generated content (F5)"
        aria-label="Refresh — clear generated content"
        className="!px-1.5"
      >
        <RefreshIcon className="h-3.5 w-3.5" />
      </GhostButton>
      <nav className="flex gap-0.5 rounded-lg bg-slate-100/80 p-0.5" role="tablist">
        <TabButton active={view === 'job'} onClick={() => onSwitchView('job')}>
          Job
        </TabButton>
        <TabButton active={view === 'profile'} onClick={() => onSwitchView('profile')}>
          Profile
        </TabButton>
      </nav>
    </div>
  </header>
);
