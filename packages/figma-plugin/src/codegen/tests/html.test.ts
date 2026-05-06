import { describe, test, expect } from 'bun:test';
import { generateHTML } from '../html';
import type { SerializedNode } from '../types';

const frame: SerializedNode = {
    type: 'FRAME',
    name: 'Card',
    width: 320,
    height: 200,
    backgroundColor: '#ffffff',
    children: [
        {
            type: 'TEXT',
            name: 'Label',
            width: 200,
            height: 24,
            fontSize: 16,
            characters: 'Click me',
        },
    ],
};

describe('generateHTML', () => {
    test('wraps top-level frame in div', () => {
        const html = generateHTML([frame], { framework: 'html', styleMode: 'inline' });
        expect(html).toContain('<div');
    });
    test('includes background color as inline style', () => {
        const html = generateHTML([frame], { framework: 'html', styleMode: 'inline' });
        expect(html).toContain('background-color: #ffffff');
    });
    test('renders text in p tag', () => {
        const html = generateHTML([frame], { framework: 'html', styleMode: 'inline' });
        expect(html).toContain('<p');
        expect(html).toContain('Click me');
    });
    test('includes width and height as px', () => {
        const html = generateHTML([frame], { framework: 'html', styleMode: 'inline' });
        expect(html).toContain('width: 320px');
        expect(html).toContain('height: 200px');
    });
    test('empty selection returns comment', () => {
        const html = generateHTML([], { framework: 'html', styleMode: 'inline' });
        expect(html).toContain('No selection');
    });
});
