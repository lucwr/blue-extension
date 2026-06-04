/**
 * ActionCard — the canonical card-shell every workflow step renders into.
 * Three regions: title row (icon, name, status badge), an optional
 * subtitle/preview line, and an action row (buttons). Pure presentation —
 * caller passes its handlers + state from the existing hooks.
 */
import type { FC, ReactNode } from 'react';
import { StatusBadge, type StatusTone } from './StatusBadge';

interface Props {
  /** Inline SVG icon component, rendered ~14px inside a gradient tile. */
  icon: ReactNode;
  title: string;
  /** Short caption rendered as a small uppercase tag under the title. */
  subtitle?: string;
  /** One-line preview of the card's current content (e.g. JD title, target role). */
  preview?: ReactNode;
  status: { tone: StatusTone; label: string };
  /** Action region — buttons, selects, etc. Right-aligned. */
  actions: ReactNode;
  /** Optional content rendered below the header row (e.g. detected fields). */
  footer?: ReactNode;
  /** Highlight the card with an accent gradient (used by the bid card). */
  accent?: boolean;
}

export const ActionCard: FC<Props> = ({
  icon,
  title,
  subtitle,
  preview,
  status,
  actions,
  footer,
  accent = false,
}) => (
  <section
    className={`border-t border-slate-200 p-4 ${accent ? 'bg-gradient-to-b from-brand-50/40 to-transparent' : ''}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset ${
            accent
              ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white ring-brand-700/20'
              : 'bg-gradient-to-br from-slate-800 to-slate-900 text-white ring-slate-900/20'
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0 pt-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
            <StatusBadge tone={status.tone} label={status.label} />
          </div>
          {(subtitle || preview) && (
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {preview ?? subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">{actions}</div>
    </div>
    {footer && <div className="mt-3">{footer}</div>}
  </section>
);
