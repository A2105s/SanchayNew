import Link from 'next/link';
import { LoaderCircle } from 'lucide-react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'blue';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

function sizeClass(size: ButtonSize | undefined): string {
  return size === 'sm' ? ' button--sm' : '';
}

export function Button({
  children,
  variant = 'primary',
  size,
  icon,
  loading = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`button button--${variant}${sizeClass(size)} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : icon}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  variant = 'primary',
  size,
  icon,
  className = '',
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={`button button--${variant}${sizeClass(size)} ${className}`.trim()} href={href} {...props}>
      {icon}
      {children ? <span>{children}</span> : null}
    </Link>
  );
}
