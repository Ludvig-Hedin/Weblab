import { describe, expect, it } from 'bun:test';

import type { RichTextItem } from './rich-text';
import { distributeText, serializeItems } from './rich-text';

// Hero heading: two block <span>s inside an <h1>, empty root gaps around them.
const HERO: RichTextItem[] = [
    { kind: 'gap', key: 'h1:0', text: '' },
    { kind: 'gap', key: 'a:0', text: 'AI agents for' },
    { kind: 'gap', key: 'h1:1', text: '' },
    { kind: 'sep' },
    { kind: 'gap', key: 'b:0', text: 'IP and patent analysis' },
    { kind: 'gap', key: 'h1:2', text: '' },
];

describe('distributeText', () => {
    it('serializes block spans as separate lines', () => {
        expect(serializeItems(HERO)).toBe('AI agents for\nIP and patent analysis');
    });

    it('returns no changes for identical text', () => {
        expect(distributeText(HERO, serializeItems(HERO))?.size).toBe(0);
    });

    it('edits the end of the first line inside the first span', () => {
        const out = distributeText(HERO, 'AI agents built for\nIP and patent analysis');
        expect(Object.fromEntries(out!)).toEqual({ 'a:0': 'AI agents built for' });
    });

    it('typing at the start of line two goes into the second span', () => {
        const out = distributeText(HERO, 'AI agents for\nFast IP and patent analysis');
        expect(Object.fromEntries(out!)).toEqual({ 'b:0': 'Fast IP and patent analysis' });
    });

    it('appending to line one stays in the first span', () => {
        const out = distributeText(HERO, 'AI agents for you\nIP and patent analysis');
        expect(Object.fromEntries(out!)).toEqual({ 'a:0': 'AI agents for you' });
    });

    it('a selection across both lines trims both spans and keeps the line break', () => {
        const out = distributeText(HERO, 'AI X analysis');
        expect(Object.fromEntries(out!)).toEqual({ 'a:0': 'AI X', 'b:0': ' analysis' });
    });

    it('a new line inside a span stays in that span', () => {
        const out = distributeText(HERO, 'AI agents for\nIP and patent\nanalysis');
        expect(Object.fromEntries(out!)).toEqual({ 'b:0': 'IP and patent\nanalysis' });
    });

    it('text next to inline formatting extends the text before the caret', () => {
        const items: RichTextItem[] = [
            { kind: 'gap', key: 'p:0', text: 'Hello ' },
            { kind: 'gap', key: 'strong:0', text: 'world' },
            { kind: 'gap', key: 'p:1', text: '!' },
        ];
        expect(Object.fromEntries(distributeText(items, 'Hello world?!')!)).toEqual({
            'strong:0': 'world?',
        });
        expect(Object.fromEntries(distributeText(items, 'Hi world!')!)).toEqual({ 'p:0': 'Hi ' });
    });
});
