'use client';

import { useEffect, type RefObject } from 'react';

const EDGE_CLASS = {
  top: 'pf-scroll-edge-top',
  bottom: 'pf-scroll-edge-bottom',
  left: 'pf-scroll-edge-left',
  right: 'pf-scroll-edge-right'
};

interface ScrollEdgeSpringOptions {
  scrollSelector?: string | null;
  targetSelector?: string | null;
  axis?: 'y' | 'x' | 'both';
  enabled?: boolean;
}

/**
 * Attaches PaperFlow spring physics recoil to an element.
 * Provides a single, clean elastic recoil without looping or multi-bouncing.
 */
export function attachScrollEdgeSpring(
  scroller: HTMLElement | Window,
  target: HTMLElement,
  options: { axis?: 'y' | 'x' | 'both'; enabled?: boolean } = {}
) {
  const { axis = 'y', enabled = true } = options;
  if (!enabled || !scroller || !target) return () => {};

  const isWindow = scroller === window;
  const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0));

  // On touch devices, mobile browser provides native window elastic bounce.
  // Never add synthetic CSS transform on window on touch screens to prevent double-bouncing.
  if (isWindow && isTouchDevice) {
    return () => {};
  }

  const getScrollTop = () =>
    isWindow ? window.scrollY || document.documentElement.scrollTop : (scroller as HTMLElement).scrollTop;
  const getScrollLeft = () =>
    isWindow ? window.scrollX || document.documentElement.scrollLeft : (scroller as HTMLElement).scrollLeft;
  const getScrollHeight = () =>
    isWindow ? document.documentElement.scrollHeight : (scroller as HTMLElement).scrollHeight;
  const getClientHeight = () =>
    isWindow ? window.innerHeight : (scroller as HTMLElement).clientHeight;
  const getScrollWidth = () =>
    isWindow ? document.documentElement.scrollWidth : (scroller as HTMLElement).scrollWidth;
  const getClientWidth = () =>
    isWindow ? window.innerWidth : (scroller as HTMLElement).clientWidth;

  let resetTimer: number | null = null;
  let isAnimating = false;
  let lastTriggerAt = 0;
  const COOLDOWN_MS = 650; // generous cooldown to guarantee exactly ONE bounce per edge encounter

  const edgeState = () => {
    const sTop = getScrollTop();
    const sHeight = getScrollHeight();
    const cHeight = getClientHeight();

    const sLeft = getScrollLeft();
    const sWidth = getScrollWidth();
    const cWidth = getClientWidth();

    return {
      atTop: sTop <= 2,
      atBottom: sHeight - cHeight - sTop <= 2,
      atLeft: sLeft <= 2,
      atRight: sWidth - cWidth - sLeft <= 2,
      isScrollableY: sHeight > cHeight + 6,
      isScrollableX: sWidth > cWidth + 6
    };
  };

  const trigger = (edge: 'top' | 'bottom' | 'left' | 'right') => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const now = performance.now();
    if (isAnimating || now - lastTriggerAt < COOLDOWN_MS) return;

    isAnimating = true;
    lastTriggerAt = now;

    if (resetTimer) window.clearTimeout(resetTimer);
    target.classList.remove(
      EDGE_CLASS.top,
      EDGE_CLASS.bottom,
      EDGE_CLASS.left,
      EDGE_CLASS.right
    );

    requestAnimationFrame(() => {
      target.classList.add(EDGE_CLASS[edge]);
      resetTimer = window.setTimeout(() => {
        target.classList.remove(EDGE_CLASS[edge]);
        isAnimating = false;
      }, 450);
    });
  };

  const handleWheel = (event: WheelEvent) => {
    const { atTop, atBottom, atLeft, atRight, isScrollableY, isScrollableX } = edgeState();

    if (axis === 'y' || axis === 'both') {
      if (isWindow || isScrollableY) {
        if (event.deltaY < -4 && atTop) trigger('top');
        if (event.deltaY > 4 && atBottom) trigger('bottom');
      }
    }
    if (axis === 'x' || axis === 'both') {
      if (isWindow || isScrollableX) {
        if (event.deltaX < -4 && atLeft) trigger('left');
        if (event.deltaX > 4 && atRight) trigger('right');
      }
    }
  };

  const eventTarget: EventTarget = scroller;
  eventTarget.addEventListener('wheel', handleWheel as EventListener, { passive: true });

  return () => {
    if (resetTimer) window.clearTimeout(resetTimer);
    target.classList.remove(
      EDGE_CLASS.top,
      EDGE_CLASS.bottom,
      EDGE_CLASS.left,
      EDGE_CLASS.right
    );
    eventTarget.removeEventListener('wheel', handleWheel as EventListener);
  };
}

/**
 * Component Hook: PaperFlow useScrollEdgeSpring for individual components
 */
export default function useScrollEdgeSpring(
  rootRef: RefObject<HTMLElement | null>,
  {
    scrollSelector = null,
    targetSelector = null,
    axis = 'y',
    enabled = true
  }: ScrollEdgeSpringOptions = {}
) {
  useEffect(() => {
    if (!enabled) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;

    const scroller = scrollSelector ? root.querySelector<HTMLElement>(scrollSelector) : root;
    const target = targetSelector ? root.querySelector<HTMLElement>(targetSelector) : root;
    if (!scroller || !target) return undefined;

    return attachScrollEdgeSpring(scroller, target, { axis, enabled });
  }, [enabled, rootRef, scrollSelector, targetSelector, axis]);
}

/**
 * Known independent scrollable containers across EasyLife
 */
const GLOBAL_SPRING_TARGETS: Array<{ selector: string; axis: 'y' | 'x' | 'both' }> = [
  { selector: '.modal__body', axis: 'y' },
  { selector: '.custom-select-dropdown', axis: 'y' },
  { selector: '.settings-log-window', axis: 'y' },
  { selector: '.customer-mapping-grid', axis: 'y' },
  { selector: '.customer-preview-table-wrap', axis: 'y' },
  { selector: '.review-editor', axis: 'y' },
  { selector: '.image-stage', axis: 'both' },
  { selector: '.table-wrap', axis: 'x' },
  { selector: '.source-tabs', axis: 'x' },
  { selector: '.row-strip', axis: 'x' },
  { selector: '.settings-tabs', axis: 'x' }
];

/**
 * Global Edge Spring: Equips desktop wheel edge recoil + independent card scrollers
 * with clean PaperFlow spring recoil without mobile bounce conflicts.
 */
export function useGlobalScrollEdgeSpring() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isMobile =
      window.innerWidth <= 820 ||
      ('ontouchstart' in window && window.matchMedia('(pointer: coarse)').matches);

    // On mobile devices, delegate entirely to native OS GPU momentum and rubber-band bounce
    if (isMobile) return;

    const cleanups: Array<() => void> = [];

    // 1. Desktop wheel recoil on page edges
    const pageEl = document.querySelector<HTMLElement>('.page') || document.querySelector<HTMLElement>('main');
    if (pageEl) {
      cleanups.push(attachScrollEdgeSpring(window, pageEl, { axis: 'y' }));
    }

    // 2. Attach to independent card & table scrollers
    function attachContainers() {
      GLOBAL_SPRING_TARGETS.forEach(({ selector, axis }) => {
        document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
          if ((el as HTMLElement & { __has_spring__?: boolean }).__has_spring__) return;
          (el as HTMLElement & { __has_spring__?: boolean }).__has_spring__ = true;
          cleanups.push(attachScrollEdgeSpring(el, el, { axis }));
        });
      });
    }

    attachContainers();

    // 3. Observe dynamic elements (like open modals, rendered charts, etc.)
    const observer = new MutationObserver(() => {
      attachContainers();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => {
      cleanups.forEach((fn) => fn());
      observer.disconnect();
    };
  }, []);
}
