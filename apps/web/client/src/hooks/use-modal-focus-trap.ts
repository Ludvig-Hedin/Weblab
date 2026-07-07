import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Minimal focus trap for hand-rolled (non-Radix) modal shells: focuses the
 * modal on open, cycles Tab/Shift+Tab within it, and restores focus to the
 * previously-focused element on close.
 */
export function useModalFocusTrap(isOpen: boolean, containerRef: RefObject<HTMLElement | null>) {
    const previouslyFocused = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        previouslyFocused.current = document.activeElement as HTMLElement | null;
        const container = containerRef.current;

        // Defer so the entering animation has mounted the tab content first.
        const raf = requestAnimationFrame(() => {
            const first = container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
            (first ?? container)?.focus();
        });

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab' || !container) {
                return;
            }
            const focusable = Array.from(
                container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
            ).filter((el) => el.offsetParent !== null);
            if (focusable.length === 0) {
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        };
        container?.addEventListener('keydown', onKeyDown);

        return () => {
            cancelAnimationFrame(raf);
            container?.removeEventListener('keydown', onKeyDown);
            previouslyFocused.current?.focus();
        };
    }, [isOpen, containerRef]);
}
