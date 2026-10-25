'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  width?: string;
  ariaLabel?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select option',
  width = '100%',
  ariaLabel
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  function openAt(index: number) {
    setActiveIndex(Math.max(0, Math.min(options.length - 1, index)));
    setOpen(true);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openAt(open ? activeIndex + 1 : selectedIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(open ? activeIndex - 1 : selectedIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      openAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      openAt(options.length - 1);
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) handleSelect(option.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="custom-select-container" ref={containerRef} style={{ position: 'relative', width }}>
      <button
        type="button"
        className={`custom-select-trigger ${open ? 'is-active' : ''}`}
        aria-label={ariaLabel ?? placeholder}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        onClick={() => {
          const selectedIndex = options.findIndex((option) => option.value === value);
          setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
          setOpen((v) => !v);
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="custom-select-value">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown size={16} className={`custom-select-arrow ${open ? 'is-open' : ''}`} />
      </button>

      {open && (
        <ul className="custom-select-dropdown" id={listboxId} role="listbox" aria-label={ariaLabel ?? placeholder}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="presentation">
                <button
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`custom-select-option ${isSelected ? 'is-selected' : ''} ${activeIndex === index ? 'is-active' : ''}`}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
