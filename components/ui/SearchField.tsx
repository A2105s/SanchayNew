'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  placeholders?: string[];
  ariaLabel: string;
  className?: string;
  intervalMs?: number;
}

/**
 * Standard search input with optional Blinkit-style rotating animated placeholder:
 * - Leading search icon
 * - Smooth vertical ticker cycling through dynamic search prompts when empty
 * - Pauses rotation cleanly while focused to avoid distracting the user
 * - Input text cursor & typing are 100% unobstructed (native transparent input on top)
 * - Clear button once text is present, Escape to clear
 * - Respects prefers-reduced-motion
 */
export function SearchField({
  value,
  onChange,
  placeholder = '',
  placeholders,
  ariaLabel,
  className = '',
  intervalMs = 2800,
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const hasAnimated = Boolean(
    placeholders && placeholders.length > 1 && !shouldReduceMotion
  );

  // Keep index within bounds if placeholders list changes
  useEffect(() => {
    if (placeholders && index >= placeholders.length) {
      setIndex(0);
    }
  }, [placeholders, index]);

  // Cycle through placeholders every intervalMs when empty and idle (not focused, tab visible)
  useEffect(() => {
    if (!hasAnimated || !placeholders) return;
    if (value || isFocused) return;

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      setIndex((prev) => (prev + 1) % placeholders.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [hasAnimated, placeholders, value, isFocused, intervalMs]);

  function clear() {
    onChange('');
    inputRef.current?.focus();
  }

  // Active placeholder label for screen-readers and accessibility
  const currentPlaceholder = hasAnimated && placeholders
    ? (placeholders[index] ?? placeholder)
    : (placeholders?.[0] ?? placeholder);

  return (
    <label className={`search-field ${className}`.trim()}>
      <Search size={16} aria-hidden="true" />
      <div className="search-field__inner">
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
          style={{ position: 'relative', zIndex: 2 }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </label>
  );
}
