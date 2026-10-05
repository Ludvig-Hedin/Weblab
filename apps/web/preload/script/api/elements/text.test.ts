import { afterEach, describe, expect, it, mock } from 'bun:test';

// Text extraction does not need the iframe's live parent connection.
mock.module('../../index', () => ({ penpalParent: null }));
const { extractTextContent } = await import('./text');

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
afterEach(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
});

function extract(markup: string): string {
    // These fixtures contain no entities. Keep the browser decoder boundary
    // small while exercising the real extraction function after DOM tagging.
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
            createElement: () => ({
                innerHTML: '',
                get value(): string { return this.innerHTML; },
            }),
        },
    });
    return extractTextContent({ innerHTML: markup } as HTMLElement);
}

describe('final canvas text extraction', () => {
    it('does not treat custom elements with a br prefix as line breaks', () => {
        expect(extract('First<br-widget>Second</br-widget>')).toBe('FirstSecond');
    });

    it('keeps the break after layer discovery assigns its DOM ID', () => {
        expect(extract('Built together.<br data-weblab-dom-id="odid-break">Saved in the cloud.'))
            .toBe('Built together.\nSaved in the cloud.');
    });

    it('keeps breaks with both source and DOM IDs after a source refresh', () => {
        expect(extract('First<br data-oid="source-break" data-weblab-dom-id="odid-break"/>Second'))
            .toBe('First\nSecond');
    });

    it('preserves existing block and whitespace normalization', () => {
        expect(extract('  <p>First  line</p><p>Second<br><br>Last</p>  '))
            .toBe('First  line\nSecond\n\nLast');
    });
});
