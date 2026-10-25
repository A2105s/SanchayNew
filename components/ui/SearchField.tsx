'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  placeholders?: string[];
  ariaLabel: string;
  className?: string;
  intervalMs?: number;
}

export function SearchField({
  value,
  onChange,
  placeholder = '',
  placeholders,
  ariaLabel,
  className = '',
  intervalMs = 2800
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const hasAnimated = Boolean(placeholders && placeholders.length > 1 && !shouldReduceMotion);

  useEffect(() => {
    if (placeholders && index >= placeholders.length) setIndex(0);
  }, [placeholders, index]);

  useEffect(() => {
    if (!hasAnimated || !placeholders) return;
    if (value || isFocused) return;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      setIndex((prev) => (prev + 1) % placeholders.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [hasAnimated, placeholders, value, isFocused, intervalMs]);

  function clear() {
    onChange('');
    inputRef.current?.focus();
  }

  const currentPlaceholder =
    hasAnimated && placeholders ? placeholders[index] ?? placeholder : placeholders?.[0] ?? placeholder;

  return (
    <label className={`search-field ${className}`.trim()}>
      <Search size={16} aria-hidden="true" />
      <div className="search-field__inner" style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        {hasAnimated && placeholders && !value && (
          <div className="search-field__placeholder-carousel" aria-hidden="true">
            <AnimatePresence initial={false}>
              <motion.span
                key={index}
                className="search-field__placeholder-text"
                initial={{ y: 11, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -11, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                {placeholders[index]}
              </motion.span>
            </AnimatePresence>
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && value) {
              event.preventDefault();
              onChange('');
            }
          }}
          placeholder={hasAnimated ? '' : currentPlaceholder}
          aria-label={ariaLabel}
          title={currentPlaceholder}
          style={{ position: 'relative', zIndex: 1 }}
        />
      </div>
      {value ? (
        <button
          type="button"
          className="search-field__clear"
          onClick={clear}
          aria-label="Clear search"
          title="Clear search"
          style={{ position: 'relative', zIndex: 2, display: 'inline-grid', placeItems: 'center', border: 0, background: 'transparent', color: 'var(--color-text-muted)' }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </label>
  );
}
