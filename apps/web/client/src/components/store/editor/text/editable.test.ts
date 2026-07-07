import { describe, expect, test } from 'bun:test';

import { canEditJsxChildrenAsText, isHtmlSourcePath } from './editable';

describe('canEditJsxChildrenAsText', () => {
    test('plain text child is editable', () => {
        expect(canEditJsxChildrenAsText('<p>Hello world</p>')).toBe(true);
    });

    test('empty element is editable', () => {
        expect(canEditJsxChildrenAsText('<p></p>')).toBe(true);
    });

    test('text with <br/> line breaks is editable', () => {
        expect(canEditJsxChildrenAsText('<p>line one<br/>line two</p>')).toBe(true);
    });

    test('whitespace string container ({" "}) is editable', () => {
        expect(canEditJsxChildrenAsText("<p>Hello{' '}world</p>")).toBe(true);
    });

    test('JSX comment container is editable', () => {
        expect(canEditJsxChildrenAsText('<p>Hello{/* note */}</p>')).toBe(true);
    });

    test('identifier expression child blocks editing', () => {
        expect(canEditJsxChildrenAsText('<p>Hello {name}</p>')).toBe(false);
    });

    test('member expression child blocks editing', () => {
        expect(canEditJsxChildrenAsText('<p>{user.name}</p>')).toBe(false);
    });

    test('computed expression child blocks editing', () => {
        expect(canEditJsxChildrenAsText('<span>{count + 1} items</span>')).toBe(false);
    });

    test('non-whitespace string literal container blocks editing', () => {
        expect(canEditJsxChildrenAsText("<p>{'rendered'}</p>")).toBe(false);
    });

    test('nested markup child blocks editing', () => {
        expect(canEditJsxChildrenAsText('<p>Hello <strong>bold</strong></p>')).toBe(false);
    });

    test('self-closing non-br element blocks editing', () => {
        expect(canEditJsxChildrenAsText('<div>Text<img src="/a.png"/></div>')).toBe(false);
    });

    test('template literal container blocks editing', () => {
        // eslint-disable-next-line no-template-curly-in-string
        expect(canEditJsxChildrenAsText('<p>{`hi ${name}`}</p>')).toBe(false);
    });

    test('unparsable snippet returns null', () => {
        expect(canEditJsxChildrenAsText('<p>unclosed')).toBe(null);
    });

    test('non-JSX snippet returns null', () => {
        expect(canEditJsxChildrenAsText('const x = 1;')).toBe(null);
    });
});

describe('isHtmlSourcePath', () => {
    test('matches .html and .htm regardless of case', () => {
        expect(isHtmlSourcePath('index.html')).toBe(true);
        expect(isHtmlSourcePath('pages/about.HTM')).toBe(true);
    });

    test('does not match JSX/TSX sources', () => {
        expect(isHtmlSourcePath('src/app/page.tsx')).toBe(false);
        expect(isHtmlSourcePath('components/html-preview.tsx')).toBe(false);
    });
});
