'use client';

import { cloneElement, isValidElement, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  ariaLabel?: string;
  layoutId?: string;
  toolbar?: boolean;
  toolbarEyebrow?: string;
  toolbarTitle?: string;
  toolbarIcon?: ReactNode;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className = '',
  ariaLabel = 'Navigation tabs',
  layoutId,
  toolbar = false,
  toolbarEyebrow,
  toolbarTitle,
  toolbarIcon,
}: TabsProps) {
  const shouldReduceMotion = useReducedMotion();

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      const next = tabs[nextIndex];
      if (next) {
        onChange(next.id);
        queueMicrotask(() => {
          document.getElementById(`tab-${next.id}`)?.focus();
        });
      }
    }
  }

  const activeTab = tabs.find((t) => t.id === active) || tabs[0];
  const rawHeaderIcon = toolbarIcon ?? activeTab?.icon;
  const headerIcon = isValidElement(rawHeaderIcon)
    ? cloneElement(rawHeaderIcon as React.ReactElement<{ size?: number; 'aria-hidden'?: boolean }>, {
        size: 18,
        'aria-hidden': true,
      })
    : rawHeaderIcon;

  const tabList = (
    <div
      className={`settings-tabs ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === active;
        const rawIcon = tab.icon;
        const iconNode = isValidElement(rawIcon)
          ? cloneElement(rawIcon as React.ReactElement<{ size?: number; 'aria-hidden'?: boolean }>, {
              size: 15,
              'aria-hidden': true,
            })
          : rawIcon;

        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            className={`settings-tab-btn ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            style={{ position: 'relative' }}
          >
            {/* Subtle animated active indicator if layoutId provided & motion enabled */}
            {isActive && layoutId && !shouldReduceMotion ? (
              <motion.span
                layoutId={layoutId}
                className="settings-tab-btn__indicator"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 'inherit',
                  background: 'var(--color-bg-primary)',
                  boxShadow: '0 1px 3px rgba(29, 69, 77, 0.16)',
                  zIndex: 0,
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            ) : null}

            <span
              style={{
                position: 'relative',
                zIndex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
              }}
            >
              {iconNode ? (
                <span
                  className="settings-tab-btn__icon"
                  aria-hidden="true"
                  style={{ display: 'inline-flex', alignItems: 'center' }}
                >
                  {iconNode}
                </span>
              ) : null}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' ? (
                <span
                  className="badge badge--neutral"
                  style={{ minHeight: 18, fontSize: '0.68rem', padding: '0 6px', marginLeft: '2px' }}
                >
                  {tab.count}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (toolbar) {
    return (
      <section className="an-toolbar settings-toolbar" aria-label={ariaLabel}>
        <div className="an-toolbar__info">
          {headerIcon ? (
            <span className="panel-header__icon" aria-hidden="true">
              {headerIcon}
            </span>
          ) : null}
          <div>
            {toolbarEyebrow ? <span className="an-toolbar__eyebrow">{toolbarEyebrow}</span> : null}
            <strong>{toolbarTitle ?? activeTab?.label ?? ''}</strong>
          </div>
        </div>
        <div className="an-toolbar__controls">
          {tabList}
        </div>
      </section>
    );
  }

  return tabList;
}

