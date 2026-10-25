import { useId, type ReactNode, isValidElement, cloneElement } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  // Thread id / aria onto a single child control when possible for label association.
  const control =
    isValidElement(children)
      ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          id: (children as React.ReactElement<{ id?: string }>).props.id ?? id,
          'aria-describedby': describedBy,
          'aria-invalid': error ? true : undefined,
          'aria-required': required || undefined
        })
      : children;

  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {required ? <span aria-hidden="true" style={{ color: 'var(--color-danger)' }}> *</span> : null}
      </span>
      {control}
      {hint && !error ? (
        <small id={hintId} className="field__hint" style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>
          {hint}
        </small>
      ) : null}
      {error ? (
        <small id={errorId} className="field__error" style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
          {error}
        </small>
      ) : null}
    </label>
  );
}
