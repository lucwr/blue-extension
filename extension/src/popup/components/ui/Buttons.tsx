/**
 * Shared button atoms. UI-only — no behavior, no business logic. Always
 * pass the same handler from the existing hook into `onClick`.
 */
import type { ButtonHTMLAttributes, FC, ReactNode } from 'react';
import { Spinner } from '../Spinner';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';

interface BaseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** Renders a spinner instead of the leading icon and disables the button. */
  loading?: boolean;
  /** Optional leading icon. Hidden while `loading` is true. */
  leadingIcon?: ReactNode;
  size?: ButtonSize;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-[11px]',
  md: 'px-3 py-1.5 text-xs',
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-sm hover:from-brand-700 hover:to-brand-800 hover:shadow ' +
    'disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
  secondary:
    'border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 ' +
    'disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
  ghost:
    'text-slate-600 hover:bg-slate-100 hover:text-slate-900 ' +
    'disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
};

const Button: FC<BaseProps & { variant: ButtonVariant }> = ({
  variant,
  size = 'md',
  loading = false,
  leadingIcon,
  disabled,
  className = '',
  children,
  ...rest
}) => (
  <button
    type="button"
    disabled={disabled || loading}
    className={`inline-flex select-none items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
    {...rest}
  >
    {loading ? <Spinner className="h-3 w-3" /> : leadingIcon}
    {children}
  </button>
);

export const PrimaryButton: FC<BaseProps> = (props) => <Button variant="primary" {...props} />;
export const SecondaryButton: FC<BaseProps> = (props) => <Button variant="secondary" {...props} />;
export const GhostButton: FC<BaseProps> = (props) => <Button variant="ghost" {...props} />;
