'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

declare global {
    interface Window {
        __lenis?: Lenis;
    }
}

export function SmoothScrollProvider({ children }: { children?: React.ReactNode }) {
    useEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) return;

        const lenis = new Lenis({
            duration: 1.1,
            easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            touchMultiplier: 1.5,
        });
        window.__lenis = lenis;

        let rafId: number;
        const raf = (time: number) => {
            lenis.raf(time);
            rafId = requestAnimationFrame(raf);
        };
        rafId = requestAnimationFrame(raf);

        const handleAnchorClick = (event: MouseEvent) => {
            const anchor = (event.target as HTMLElement | null)?.closest(
                'a[href^="#"]',
            ) as HTMLAnchorElement | null;
            if (!anchor) return;
            const href = anchor.getAttribute('href');
            if (!href || href === '#') return;
            const target = document.querySelector(href);
            if (!target) return;
            event.preventDefault();
            lenis.scrollTo(target as HTMLElement, { offset: -80, duration: 1.2 });
            history.replaceState(null, '', href);
        };
        document.addEventListener('click', handleAnchorClick);

        return () => {
            cancelAnimationFrame(rafId);
            document.removeEventListener('click', handleAnchorClick);
            lenis.destroy();
            delete window.__lenis;
        };
    }, []);

    return <>{children}</>;
}
