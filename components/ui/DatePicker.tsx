'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function DatePicker({ value, onChange, placeholder = 'Select date', ariaLabel }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  useEffect(() => {
    if (value) {
      const parsed = parseLocalDate(value);
      if (!isNaN(parsed.getTime())) {
        queueMicrotask(() => {
          setCurrentMonth(parsed.getMonth());
          setCurrentYear(parsed.getFullYear());
        });
      }
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(v => v - 1);
    } else {
      setCurrentMonth(v => v - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(v => v + 1);
    } else {
      setCurrentMonth(v => v + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const formattedMonth = String(currentMonth + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const dateStr = `${currentYear}-${formattedMonth}-${formattedDay}`;
    onChange(dateStr);
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setOpen(false);
  };

  const handleToday = () => {
    const formattedMonth = String(today.getMonth() + 1).padStart(2, '0');
    const formattedDay = String(today.getDate()).padStart(2, '0');
    const dateStr = `${today.getFullYear()}-${formattedMonth}-${formattedDay}`;
    onChange(dateStr);
    setOpen(false);
  };

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDayIndex = getFirstDayOfMonth(currentMonth, currentYear);
  const calendarCells = [];

  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push(null);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    calendarCells.push(i);
  }

  const getDisplayValue = () => {
    if (!value) return '';
    const date = parseLocalDate(value);
    if (isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}-${month}-${date.getFullYear()}`;
  };

  return (
    <div
      className="datepicker-container"
      ref={containerRef}
      style={{ position: 'relative', width: '100%' }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <div className="datepicker-input-wrapper">
        <input
          type="text"
          readOnly
          value={getDisplayValue()}
          placeholder={placeholder}
          className="datepicker-input"
          role="combobox"
          aria-label={ariaLabel ?? placeholder}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        />
        <CalendarIcon size={16} className="datepicker-icon" />
      </div>

      {open && (
        <div className="datepicker-popover" id={popoverId} role="dialog" aria-label={`Choose ${ariaLabel ?? 'date'}`}>
          <header className="datepicker-header">
            <button type="button" aria-label="Previous month" onClick={handlePrevMonth}><ChevronLeft size={16} /></button>
            <strong>{months[currentMonth]} {currentYear}</strong>
            <button type="button" aria-label="Next month" onClick={handleNextMonth}><ChevronRight size={16} /></button>
          </header>

          <div className="datepicker-weekdays">
            {daysOfWeek.map(day => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="datepicker-days">
            {calendarCells.map((day, index) => {
              if (day === null) {
                return <span key={`empty-${index}`} className="datepicker-day-empty" />;
              }
              const selectedDate = value ? parseLocalDate(value) : null;
              const isSelected = selectedDate && selectedDate.getDate() === day && selectedDate.getMonth() === currentMonth && selectedDate.getFullYear() === currentYear;
              const isToday = today.getDate() === day && today.getMonth() === currentMonth && today.getFullYear() === currentYear;

              return (
                <button
                  type="button"
                  key={`day-${day}`}
                  onClick={() => handleSelectDay(day)}
                  className={`datepicker-day-btn ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}`}
                  aria-label={`${months[currentMonth]} ${day}, ${currentYear}`}
                  aria-pressed={Boolean(isSelected)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <footer className="datepicker-footer">
            <button type="button" className="datepicker-footer-btn datepicker-clear-btn" onClick={handleClear}>Clear</button>
            <button type="button" className="datepicker-footer-btn datepicker-today-btn" onClick={handleToday}>Today</button>
          </footer>
        </div>
      )}
    </div>
  );
}

function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(value);
}
