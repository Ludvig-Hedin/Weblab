import { describe, expect, it } from 'bun:test';

import type { Frame } from '@weblab/models';

import { getWindowLabel } from './window-label';

const makeFrame = (overrides: Record<string, unknown>): Frame =>
    ({
        breakpoint: undefined,
        dimension: undefined,
        ...overrides,
    }) as unknown as Frame;

describe('getWindowLabel', () => {
    it('returns the breakpoint name when set', () => {
        const frame = makeFrame({ breakpoint: { name: 'Desktop', width: 1440 } });
        expect(getWindowLabel(frame)).toBe('Desktop');
    });

    it('trims whitespace around the breakpoint name', () => {
        const frame = makeFrame({ breakpoint: { name: '  Phone  ', width: 390 } });
        expect(getWindowLabel(frame)).toBe('Phone');
    });

    it('falls through to width when the name is blank', () => {
        const frame = makeFrame({
            breakpoint: { name: '   ', width: 390 },
            dimension: { width: 390, height: 800 },
        });
        expect(getWindowLabel(frame)).toBe('Mobile');
    });

    it('derives Mobile / Tablet / Desktop from dimension width, incl. boundaries', () => {
        expect(getWindowLabel(makeFrame({ dimension: { width: 375, height: 667 } }))).toBe('Mobile');
        // 480 is the last Mobile width; 481 crosses into Tablet.
        expect(getWindowLabel(makeFrame({ dimension: { width: 480, height: 800 } }))).toBe('Mobile');
        expect(getWindowLabel(makeFrame({ dimension: { width: 481, height: 800 } }))).toBe('Tablet');
        expect(getWindowLabel(makeFrame({ dimension: { width: 768, height: 1024 } }))).toBe('Tablet');
        // 1024 is the last Tablet width; 1025 crosses into Desktop.
        expect(getWindowLabel(makeFrame({ dimension: { width: 1024, height: 768 } }))).toBe('Tablet');
        expect(getWindowLabel(makeFrame({ dimension: { width: 1025, height: 768 } }))).toBe('Desktop');
        expect(getWindowLabel(makeFrame({ dimension: { width: 1440, height: 900 } }))).toBe('Desktop');
    });

    it('prefers dimension width but falls back to breakpoint width', () => {
        const frame = makeFrame({ breakpoint: { name: '', width: 800 } });
        expect(getWindowLabel(frame)).toBe('Tablet');
    });

    it('returns a generic Window label when nothing resolves', () => {
        expect(getWindowLabel(undefined)).toBe('Window');
        expect(getWindowLabel(null)).toBe('Window');
        expect(getWindowLabel(makeFrame({}))).toBe('Window');
        expect(getWindowLabel(makeFrame({ dimension: { width: 0, height: 0 } }))).toBe('Window');
    });
});
