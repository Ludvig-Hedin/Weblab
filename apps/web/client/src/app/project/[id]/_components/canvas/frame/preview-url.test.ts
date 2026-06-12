import { afterEach, describe, expect, it, mock } from 'bun:test';

import { getPopoutRoute, openPreviewWindow, toPreviewableUrl } from './preview-url';

describe('toPreviewableUrl', () => {
    it('substitutes a single dynamic-route segment', () => {
        expect(toPreviewableUrl('https://abc.vercel.run/blog/[slug]')).toBe(
            'https://abc.vercel.run/blog/temp-slug',
        );
    });

    it('substitutes multiple segments', () => {
        expect(toPreviewableUrl('https://abc.vercel.run/[lang]/posts/[id]')).toBe(
            'https://abc.vercel.run/temp-lang/posts/temp-id',
        );
    });

    it('leaves static URLs untouched', () => {
        const url = 'https://abc.vercel.run/about';
        expect(toPreviewableUrl(url)).toBe(url);
    });
});

describe('getPopoutRoute', () => {
    it('builds the standalone preview route under the project', () => {
        expect(getPopoutRoute('proj_123')).toBe('/project/proj_123/preview');
    });
});

describe('openPreviewWindow', () => {
    const originalOpen = globalThis.window?.open;

    afterEach(() => {
        if (globalThis.window) {
            globalThis.window.open = originalOpen;
        }
    });

    function stubWindowOpen() {
        const calls: Array<[string, string, string]> = [];
        const open = mock((url: string, target: string, features: string) => {
            calls.push([url, target, features]);
            return null;
        });
        // jsdom/happy-dom not guaranteed in this unit env — provide a minimal window.
        globalThis.window = {
            ...(globalThis.window ?? {}),
            open,
        } as unknown as Window & typeof globalThis;
        return { calls };
    }

    it('opens the wrapper route for a cloud (vercel.run) URL', () => {
        const { calls } = stubWindowOpen();
        openPreviewWindow('proj_123', 'https://abc.vercel.run/', 'tab');
        expect(calls[0]?.[0]).toBe('/project/proj_123/preview');
    });

    it('opens the raw (previewable) URL for a local dev server', () => {
        const { calls } = stubWindowOpen();
        openPreviewWindow('proj_123', 'http://localhost:3000/blog/[slug]', 'tab');
        expect(calls[0]?.[0]).toBe('http://localhost:3000/blog/temp-slug');
    });

    it('passes sized window features in window mode', () => {
        const { calls } = stubWindowOpen();
        openPreviewWindow('proj_123', 'https://abc.vercel.run/', 'window');
        expect(calls[0]?.[2]).toContain('width=1280');
    });

    it('uses a plain tab (no sizing) in tab mode', () => {
        const { calls } = stubWindowOpen();
        openPreviewWindow('proj_123', 'https://abc.vercel.run/', 'tab');
        expect(calls[0]?.[2]).not.toContain('width=');
    });
});
