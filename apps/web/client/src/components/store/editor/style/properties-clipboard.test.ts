import { beforeEach, describe, expect, it, mock } from 'bun:test';

import type { EditorEngine } from '../engine';
import { filterToVisualProps, PropertiesClipboardManager } from './properties-clipboard';

void mock.module('@weblab/ui/sonner', () => ({
    toast: {
        success: () => undefined,
        error: () => undefined,
        info: () => undefined,
        warning: () => undefined,
    },
}));

// Stub the system clipboard so the manager's best-effort write/read paths
// don't blow up under bun:test (jsdom has no navigator.clipboard by default).
const clipboardState = { text: '' };
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
        clipboard: {
            writeText: async (s: string) => {
                clipboardState.text = s;
            },
            readText: async () => clipboardState.text,
        },
    },
});

describe('filterToVisualProps', () => {
    it('keeps whitelisted visual props and drops everything else', () => {
        const raw = {
            // kept
            'background-color': 'rgb(255, 0, 0)',
            color: 'rgb(10, 20, 30)',
            'padding-top': '16px',
            'border-top-left-radius': '8px',
            // dropped — not on the whitelist
            content: '"hello"',
            'pointer-events': 'auto',
            overflow: 'hidden',
            'box-sizing': 'border-box',
            src: 'image.png',
        };
        expect(filterToVisualProps(raw)).toEqual({
            'background-color': 'rgb(255, 0, 0)',
            color: 'rgb(10, 20, 30)',
            'padding-top': '16px',
            'border-top-left-radius': '8px',
        });
    });

    it('normalizes camelCase keys to kebab-case before whitelisting', () => {
        // `getComputedStyleByDomId` returns camelCase (JSON-cloned
        // CSSStyleDeclaration); the whitelist is kebab-case.
        const raw = {
            paddingTop: '12px',
            backgroundColor: 'rgb(0, 0, 0)',
            zIndex: '5',
        };
        expect(filterToVisualProps(raw)).toEqual({
            'padding-top': '12px',
            'background-color': 'rgb(0, 0, 0)',
            'z-index': '5',
        });
    });

    it('drops empty strings and non-strings', () => {
        const raw = {
            color: '',
            'font-size': null as unknown as string,
            opacity: 1 as unknown as string,
            'background-color': 'rgb(0, 0, 0)',
        };
        expect(filterToVisualProps(raw)).toEqual({
            'background-color': 'rgb(0, 0, 0)',
        });
    });

    it('drops browser-default noop values that would pollute the paste target', () => {
        // Plain unstyled element from getComputedStyle — keep only the
        // properties that carry real visual intent.
        const raw = {
            transition: 'all 0s ease 0s',
            transform: 'none',
            filter: 'none',
            'backdrop-filter': 'none',
            'box-shadow': 'none',
            'background-image': 'none',
            'mix-blend-mode': 'normal',
            color: 'rgb(255, 0, 0)',
            'padding-top': '8px',
        };
        expect(filterToVisualProps(raw)).toEqual({
            color: 'rgb(255, 0, 0)',
            'padding-top': '8px',
        });
    });

    it('keeps non-default values for noop-filtered properties', () => {
        // A real shadow / transform / filter must still round-trip.
        const raw = {
            transition: 'opacity 200ms ease',
            transform: 'rotate(5deg)',
            'box-shadow': '0 2px 8px rgba(0,0,0,0.1)',
            'mix-blend-mode': 'multiply',
        };
        expect(filterToVisualProps(raw)).toEqual({
            transition: 'opacity 200ms ease',
            transform: 'rotate(5deg)',
            'box-shadow': '0 2px 8px rgba(0,0,0,0.1)',
            'mix-blend-mode': 'multiply',
        });
    });
});

interface StubFrameView {
    getComputedStyleByDomId: ReturnType<typeof mock>;
}

function makeEngineStub(opts: {
    selected: Array<{ frameId: string; domId: string; styles?: Record<string, unknown> }>;
    frameView?: StubFrameView | null;
    updateMultiple?: ReturnType<typeof mock>;
}): EditorEngine {
    const frameView = opts.frameView;
    return {
        elements: { selected: opts.selected },
        frames: {
            get: (frameId: string) =>
                frameView ? { frame: { id: frameId }, view: frameView } : null,
        },
        style: {
            updateMultiple: opts.updateMultiple ?? mock(() => undefined),
        },
    } as unknown as EditorEngine;
}

describe('PropertiesClipboardManager', () => {
    beforeEach(() => {
        clipboardState.text = '';
    });

    it('copyFromSelected populates copied with only whitelisted keys', async () => {
        const frameView: StubFrameView = {
            getComputedStyleByDomId: mock(async () => ({
                color: 'rgb(255, 255, 255)',
                paddingTop: '8px',
                content: '"x"', // not whitelisted
                src: 'foo.png', // not whitelisted
            })),
        };
        const engine = makeEngineStub({
            selected: [{ frameId: 'f1', domId: 'd1' }],
            frameView,
        });
        const mgr = new PropertiesClipboardManager(engine);

        await mgr.copyFromSelected();

        expect(mgr.copied).toEqual({
            color: 'rgb(255, 255, 255)',
            'padding-top': '8px',
        });
        expect(mgr.canPaste).toBe(true);
        // System clipboard also got the envelope.
        expect(clipboardState.text).toContain('"weblab-properties"');
    });

    it('copyFromSelected falls back to cached styles when penpal returns null', async () => {
        const frameView: StubFrameView = {
            getComputedStyleByDomId: mock(async () => null),
        };
        const engine = makeEngineStub({
            selected: [
                {
                    frameId: 'f1',
                    domId: 'd1',
                    styles: {
                        computed: { color: 'rgb(0, 0, 0)' },
                        defined: { 'padding-top': '4px' },
                    },
                },
            ],
            frameView,
        });
        const mgr = new PropertiesClipboardManager(engine);

        await mgr.copyFromSelected();

        expect(mgr.copied).toEqual({
            color: 'rgb(0, 0, 0)',
            'padding-top': '4px',
        });
    });

    it('pasteToSelected calls updateMultiple once with the stored payload', async () => {
        const updateMultiple = mock(() => undefined);
        const engine = makeEngineStub({
            selected: [
                { frameId: 'f1', domId: 'a' },
                { frameId: 'f1', domId: 'b' },
            ],
            updateMultiple,
        });
        const mgr = new PropertiesClipboardManager(engine);
        mgr.copied = { color: 'rgb(255, 0, 0)' };

        await mgr.pasteToSelected();

        expect(updateMultiple).toHaveBeenCalledTimes(1);
        expect(updateMultiple).toHaveBeenCalledWith({ color: 'rgb(255, 0, 0)' });
    });

    it('pasteToSelected recovers from system clipboard when in-memory copy is missing', async () => {
        const updateMultiple = mock(() => undefined);
        const engine = makeEngineStub({
            selected: [{ frameId: 'f1', domId: 'a' }],
            updateMultiple,
        });
        const mgr = new PropertiesClipboardManager(engine);
        clipboardState.text = JSON.stringify({
            type: 'weblab-properties',
            version: 1,
            styles: { color: 'rgb(0, 0, 255)', notVisual: 'drop' },
        });

        await mgr.pasteToSelected();

        expect(updateMultiple).toHaveBeenCalledTimes(1);
        // `notVisual` was filtered out by filterToVisualProps before paste.
        expect(updateMultiple).toHaveBeenCalledWith({ color: 'rgb(0, 0, 255)' });
    });

    it('pasteToSelected no-ops when clipboard is empty and nothing was copied', async () => {
        const updateMultiple = mock(() => undefined);
        const engine = makeEngineStub({
            selected: [{ frameId: 'f1', domId: 'a' }],
            updateMultiple,
        });
        const mgr = new PropertiesClipboardManager(engine);

        await mgr.pasteToSelected();

        expect(updateMultiple).not.toHaveBeenCalled();
    });

    it('clear() resets the in-memory clipboard', () => {
        const engine = makeEngineStub({ selected: [] });
        const mgr = new PropertiesClipboardManager(engine);
        mgr.copied = { color: 'rgb(1, 2, 3)' };
        mgr.clear();
        expect(mgr.copied).toBeNull();
        expect(mgr.canPaste).toBe(false);
    });
});
