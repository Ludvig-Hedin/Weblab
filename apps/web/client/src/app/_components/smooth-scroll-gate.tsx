'use client';

import { usePathname } from 'next/navigation';

import { SmoothScrollProvider } from './smooth-scroll-provider';

// Route prefixes where Lenis smooth scroll must NOT run. These are the
// editor, dashboard, auth, and other app surfaces — Lenis hijacks the
// wheel/RAF loop, which fights the editor canvas and any internally
// scrollable panels. Everything else (marketing/public pages) gets smooth
// scroll by default, so new public pages need no change here.
const EXCLUDED_PREFIXES = [
    '/project', // covers /project/[id] and /projects/*
    '/settings',
    '/admin',
    '/w', // legacy short-link editor entry
    '/sign-in',
    '/sign-up',
    '/auth',
    '/callback',
    '/invitation',
    '/profile-setup',
    '/dev',
    '/design-system',
    '/offline',
] as const;

function isExcluded(pathname: string): boolean {
    return EXCLUDED_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}

/**
 * Mounts {@link SmoothScrollProvider} on public/marketing routes only.
 * Mounted once in the root layout so every public page shares one Lenis
 * instance; the home page no longer mounts its own (avoids double-Lenis).
 */
export function SmoothScrollGate() {
    const pathname = usePathname();
    if (isExcluded(pathname)) return null;
    return <SmoothScrollProvider />;
}
