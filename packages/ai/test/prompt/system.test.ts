import { describe, expect, it } from 'bun:test';

import {
    frameworkSupportsShadcn,
    getSystemPromptForFramework,
    JSX_SYSTEM_PROMPT,
    NEXTJS_ADDENDUM,
    STATIC_HTML_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
} from '../../src/prompt/constants/system';

describe('getSystemPromptForFramework', () => {
    it('returns the static-HTML prompt for static-html projects', () => {
        const out = getSystemPromptForFramework('static-html');
        expect(out).toBe(STATIC_HTML_SYSTEM_PROMPT);
        // Sanity: static-HTML guidance is present and the React/Next.js
        // *positive* guidance (Prefer next/image, install shadcn) isn't
        // leaking through. The prompt does mention next/image and shadcn in
        // the "Do NOT introduce" line — that's intentional warnings, not
        // recommendations.
        expect(out).toContain('STATIC HTML');
        expect(out).not.toContain('Prefer next/image');
        expect(out).not.toContain('bunx --bun shadcn');
    });

    it('returns JSX prompt + Next.js addendum for nextjs projects', () => {
        const out = getSystemPromptForFramework('nextjs');
        expect(out).toContain(JSX_SYSTEM_PROMPT);
        expect(out).toContain(NEXTJS_ADDENDUM);
        expect(out).toContain('next/image');
    });

    it('treats null/undefined as nextjs (backward compatibility)', () => {
        const fromNull = getSystemPromptForFramework(null);
        const fromUndef = getSystemPromptForFramework(undefined);
        const expected = getSystemPromptForFramework('nextjs');
        expect(fromNull).toBe(expected);
        expect(fromUndef).toBe(expected);
    });

    it('returns JSX prompt without Next addendum for non-Next React frameworks', () => {
        for (const framework of ['vite-react', 'remix', 'tanstack-start', 'astro'] as const) {
            const out = getSystemPromptForFramework(framework);
            expect(out).toBe(JSX_SYSTEM_PROMPT);
            expect(out).not.toContain(NEXTJS_ADDENDUM);
            expect(out).not.toContain('Prefer next/image');
        }
    });
});

describe('frameworkSupportsShadcn', () => {
    it('returns false for static-html', () => {
        expect(frameworkSupportsShadcn('static-html')).toBe(false);
    });

    it('returns true for every other framework (and null/undefined)', () => {
        for (const framework of [
            'nextjs',
            'vite-react',
            'remix',
            'tanstack-start',
            'astro',
            null,
            undefined,
        ] as const) {
            expect(frameworkSupportsShadcn(framework)).toBe(true);
        }
    });
});

describe('SYSTEM_PROMPT alias', () => {
    it('is the JSX prompt (backward-compat for callers that still import SYSTEM_PROMPT)', () => {
        expect(SYSTEM_PROMPT).toBe(JSX_SYSTEM_PROMPT);
    });
});
