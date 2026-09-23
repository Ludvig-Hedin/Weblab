import { describe, expect, it, mock } from 'bun:test';

import type { StyleChange } from '@weblab/models';
import { EditorAttributes } from '@weblab/constants';

// `../state` imports the preload entry, which re-enters this module graph.
// The bundle orders that cycle; a bare test import hits a TDZ error.
void mock.module('../state', () => ({
    getFrameId: () => 'frame',
    getBranchId: () => 'branch',
    setFrameId: () => undefined,
    setBranchId: () => undefined,
}));
const { updateStyle } = await import('../style/update');
const { getElementByDomId } = await import('./index');

const emptyChange = {
    original: {} as Record<string, StyleChange>,
    updated: {} as Record<string, StyleChange>,
};

function withDocument(querySelector: (selector: string) => Element | null, run: () => void) {
    const original = globalThis.document;
    const originalCss = globalThis.CSS;
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
            querySelector,
            get body() {
                throw new Error('A missing domId must not fall back to body');
            },
            getElementById() {
                throw new Error('A missing domId must not inject CSS');
            },
        },
    });
    Object.defineProperty(globalThis, 'CSS', {
        configurable: true,
        value: { escape: (value: string) => value },
    });
    try {
        run();
    } finally {
        Object.defineProperty(globalThis, 'document', {
            configurable: true,
            value: original,
        });
        Object.defineProperty(globalThis, 'CSS', {
            configurable: true,
            value: originalCss,
        });
    }
}

describe('stale preload domId', () => {
    it('returns null for a missing domId instead of the document body', () => {
        withDocument(() => null, () => {
            expect(getElementByDomId('removed', true)).toBeNull();
        });
    });

    it('skips preview CSS when the domId is missing', () => {
        withDocument(() => null, () => {
            expect(updateStyle('removed', emptyChange)).toBeNull();
            expect(updateStyle('removed', emptyChange, undefined, 'missing-oid')).toBeNull();
        });
    });

    it('does not edit a different element that reused the stale domId', () => {
        const otherElement = {
            getAttribute: (name: string) =>
                name === EditorAttributes.DATA_WEBLAB_ID ? 'different-oid' : null,
        } as unknown as Element;
        withDocument(
            (selector) =>
                selector.includes(EditorAttributes.DATA_WEBLAB_DOM_ID) ? otherElement : null,
            () => {
                expect(updateStyle('stale', emptyChange, undefined, 'expected-oid')).toBeNull();
            },
        );
    });
});
