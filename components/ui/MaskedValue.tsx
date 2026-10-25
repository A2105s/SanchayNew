import { EyeOff } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Displays a value that is masked for callers outside the owning organization.
 * When `masked` is true, shows the masked label (or a neutral placeholder) with a
 * lock affordance; never renders the full sensitive value.
 */
export function MaskedValue({
  masked,
  value,
  maskedValue,
  placeholder = 'Restricted'
}: {
  masked: boolean;
  value: ReactNode;
  maskedValue?: string | null;
  placeholder?: string;
}) {
  if (!masked) return <>{value}</>;
  return (
    <span className="masked-value" title="Masked — visible only to the owning organization">
      <EyeOff size={13} aria-hidden="true" />
      <span>{maskedValue ?? placeholder}</span>
    </span>
  );
}
