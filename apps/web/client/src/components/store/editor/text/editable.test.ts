import { describe, expect, test } from 'bun:test';

import { canEditJsxChildrenAsRichText, canEditJsxChildrenAsText, isHtmlSourcePath } from './editable';

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

    test('static string literal container remains editable', () => {
        expect(canEditJsxChildrenAsText("<p>{'rendered'}</p>")).toBe(true);
        expect(canEditJsxChildrenAsText('<p>{"{client} &amp; <hello>"}</p>')).toBe(true);
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


describe('authored text ownership guards', () => {
    test.each([
        '<p dangerouslySetInnerHTML={{__html: cms}} />',
        '<p children={cms} />',
        '<p {...props}>old</p>',
        '<br />',
        '<p>one<br className="mobile-only" />two</p>',
        '<p>one<br {...props} />two</p>',
        '<p>one<br data-oid={id} />two</p>',
    ])('refuses both plain and rich editing: %s', code => {
        expect(canEditJsxChildrenAsText(code)).toBe(false);
        expect(canEditJsxChildrenAsRichText(code)).toBe(false);
    });
    test('rich editing also checks ownership on nested text elements', () => {
        for (const code of [
            '<p>one<span children={cms} /></p>',
            '<p>one<span dangerouslySetInnerHTML={{__html: cms}} /></p>',
            '<p>one<span {...props} /></p>',
        ]) expect(canEditJsxChildrenAsRichText(code)).toBe(false);
    });
    test('generated source IDs do not disable ordinary line breaks', () => {
        const code = '<p>one<br data-oid="generated" />two</p>';
        expect(canEditJsxChildrenAsText(code)).toBe(true);
        expect(canEditJsxChildrenAsRichText(code)).toBe(true);
    });
});
