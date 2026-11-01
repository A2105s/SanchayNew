'use client';

import { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useTranslation, LANGUAGES } from '@/lib/i18n/context';

export function LanguageSelector() {
  const { language, setLanguage } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const activeLang = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        className="lang-selector-btn"
        aria-label="Select language"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Language: ${activeLang.label} (${activeLang.nativeLabel})`}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 10px',
          height: 36,
          minHeight: 36,
          maxHeight: 36,
          minWidth: 92,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          background: open ? 'var(--color-brand-subtle)' : 'var(--color-bg-primary)',
          color: open ? 'var(--color-brand)' : 'var(--color-text-primary)',
          fontSize: '0.82rem',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          boxSizing: 'border-box',
          transition: 'all var(--transition-fast)',
        }}
      >
        <Globe size={15} color="var(--color-brand)" aria-hidden="true" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{activeLang.nativeLabel}</span>
        <ChevronDown
          size={13}
          style={{
            opacity: 0.65,
            marginLeft: 2,
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select language"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 1000,
            minWidth: 175,
            padding: '6px',
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.18)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div
            style={{
              padding: '4px 8px',
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-text-muted)',
            }}
          >
            Language / भाषा
          </div>
          {LANGUAGES.map((l) => {
            const isSelected = language === l.code;
            return (
              <button
                key={l.code}
                role="option"
                aria-selected={isSelected}
                type="button"
                onClick={() => {
                  setLanguage(l.code);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: isSelected ? 'var(--color-brand-subtle)' : 'transparent',
                  color: isSelected ? 'var(--color-brand)' : 'var(--color-text-primary)',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'var(--color-bg-secondary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <span>
                  <strong>{l.nativeLabel}</strong>{' '}
                  <span style={{ opacity: 0.7, fontSize: '0.74rem' }}>({l.label})</span>
                </span>
                {isSelected && <Check size={14} color="var(--color-brand)" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
