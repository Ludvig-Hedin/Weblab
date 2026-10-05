import { describe, expect, it } from 'bun:test';

import {
    analyzeLinkSource,
    buildHref,
    classifyHref,
    hrefToFieldValue,
    isSafeLabel,
} from './analyze';

describe('analyzeLinkSource', () => {
    it('reads a literal href, target and label from a Next Link', () => {
        const info = analyzeLinkSource(
            '<Link href="/about" target="_blank" data-oid="x">\n  About us\n</Link>',
        );
        expect(info?.tag).toBe('Link');
        expect(info?.href).toEqual({ state: 'literal', value: '/about' });
        expect(info?.target).toEqual({ state: 'literal', value: '_blank' });
        expect(info?.label).toBe('About us');
        expect(info?.canConvertToLink).toBe(false);
    });

    it('marks a computed href as dynamic and a nested label as not editable', () => {
        const info = analyzeLinkSource('<a href={item.href}><span>{item.label}</span></a>');
        expect(info?.href).toEqual({ state: 'dynamic' });
        expect(info?.label).toBeNull();
    });

    it('treats a string in braces as a literal', () => {
        expect(analyzeLinkSource("<a href={'/x'}>X</a>")?.href).toEqual({
            state: 'literal',
            value: '/x',
        });
    });

    it('allows converting a plain button only', () => {
        expect(analyzeLinkSource('<button className="btn">Go</button>')?.canConvertToLink).toBe(
            true,
        );
        expect(analyzeLinkSource('<button type="button">Go</button>')?.canConvertToLink).toBe(true);
        expect(analyzeLinkSource('<button onClick={go}>Go</button>')?.canConvertToLink).toBe(false);
        expect(analyzeLinkSource('<button type="submit">Go</button>')?.canConvertToLink).toBe(
            false,
        );
        expect(analyzeLinkSource('<button {...props}>Go</button>')?.canConvertToLink).toBe(false);
        expect(analyzeLinkSource('<Button>Go</Button>')?.canConvertToLink).toBe(false);
    });

    it('notes spread props', () => {
        expect(analyzeLinkSource('<a {...props} />')?.hasSpread).toBe(true);
    });
});

describe('href helpers', () => {
    it('classifies hrefs', () => {
        expect(classifyHref('/pricing')).toBe('page');
        expect(classifyHref('https://x.com')).toBe('url');
        expect(classifyHref('//cdn.x.com')).toBe('url');
        expect(classifyHref('mailto:a@b.se')).toBe('email');
        expect(classifyHref('tel:+4670')).toBe('phone');
        expect(classifyHref('#team')).toBe('section');
    });

    it('strips prefixes for editing', () => {
        expect(hrefToFieldValue('email', 'mailto:a@b.se?subject=hi')).toBe('a@b.se');
        expect(hrefToFieldValue('section', '#team')).toBe('team');
    });

    it('builds hrefs and rejects bad input', () => {
        expect(buildHref('url', 'example.com')).toEqual({
            ok: true,
            href: 'https://example.com',
        });
        expect(buildHref('url', 'https://a.se/x')).toEqual({
            ok: true,
            href: 'https://a.se/x',
        });
        expect(buildHref('url', 'javascript:alert(1)')).toEqual({
            ok: false,
            problem: 'badUrl',
        });
        expect(buildHref('url', 'hello')).toEqual({ ok: false, problem: 'badUrl' });
        expect(buildHref('email', 'a@b.se')).toEqual({
            ok: true,
            href: 'mailto:a@b.se',
        });
        expect(buildHref('email', 'nope')).toEqual({
            ok: false,
            problem: 'badEmail',
        });
        expect(buildHref('phone', '+46 70 123 45 67')).toEqual({
            ok: true,
            href: 'tel:+46701234567',
        });
        expect(buildHref('section', 'team')).toEqual({ ok: true, href: '#team' });
        expect(buildHref('page', '')).toEqual({ ok: false, problem: 'emptyValue' });
    });

    it('refuses JSX-significant characters in labels', () => {
        expect(isSafeLabel('Get started')).toBe(true);
        expect(isSafeLabel('Hi {name}')).toBe(false);
    });
});
