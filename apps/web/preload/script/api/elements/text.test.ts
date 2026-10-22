import { afterEach, describe, expect, it, mock } from 'bun:test';
import { EditorAttributes } from '@weblab/constants';

// Text extraction does not need the iframe's live parent connection.
mock.module('../../index', () => ({ penpalParent: null }));
const { extractTextContent, readPlainTextV1, writePlainTextV1, stopEditingPlainTextV1, startEditingPlainTextV1 } = await import('./text');

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


describe('approved plain-string text', () => {
    it('keeps raw whitespace and HTML-looking strings without inserting breaks', () => {
        for (const value of ['', '  ', '\n', '\n\n\nFirst\n', 'First\tSecond\u00a0 ', '<br>&nbsp;']) {
            const el = { childNodes: [{ nodeType: 3 }, { nodeType: 8 }], textContent: 'Original' } as unknown as HTMLElement;
            expect(writePlainTextV1(el, value)).toBe(true);
            expect(readPlainTextV1(el)).toBe(value);
            expect(el.childNodes).toHaveLength(2);
        }
    });
    it('rejects CR in existing source or a programmatic replacement without normalizing it', () => {
        for (const value of ['First\rSecond', 'First\r\nSecond']) {
            const el = { childNodes: [{ nodeType: 3 }], textContent: value } as unknown as HTMLElement;
            expect(readPlainTextV1(el)).toBeNull();
            expect(writePlainTextV1(el, 'Replacement')).toBe(false);
            expect(el.textContent).toBe(value);
            el.textContent = 'Original';
            expect(writePlainTextV1(el, value)).toBe(false);
            expect(el.textContent).toBe('Original');
        }
    });
    it('refuses BR and rich children, and stop still removes the editing marker', async () => {
        for (const tagName of ['BR', 'STRONG']) {
            const attributes = new Map<string, string>([[EditorAttributes.DATA_WEBLAB_EDITING_TEXT, 'true']]);
            const el = { childNodes: [{ nodeType: 1, tagName }], textContent: 'Text',
                getAttribute: (name: string) => attributes.get(name) ?? null,
                removeAttribute: (name: string) => attributes.delete(name),
            } as unknown as HTMLElement;
            Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => el } });
            expect(readPlainTextV1(el)).toBeNull();
            expect(writePlainTextV1(el, 'Replacement')).toBe(false);
            expect(await startEditingPlainTextV1('target')).toBeNull();
            expect(stopEditingPlainTextV1('target')).toBeNull();
            expect(attributes.has(EditorAttributes.DATA_WEBLAB_EDITING_TEXT)).toBe(false);
            expect(el.textContent).toBe('Text');
        }
    });
});
