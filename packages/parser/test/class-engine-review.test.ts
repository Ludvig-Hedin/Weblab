import { expect, test } from 'bun:test';

import {
    applyPatch,
    classUsage,
    createClass,
    editDeclaration,
    renameClass,
    resolveClassStylesheets,
} from '../src/classes';

const base = '.a{color:red}';
const target = { selector: '.a' };
test('only rewrites verified class helpers flowing to className', () => {
    for (const source of [
        'import {cn} from "./countries"; export default <p className={cn("a")}/>;',
        'import clsx from "clsx"; const title = clsx("a","guide");',
        'const country = cn("a");',
        'const Title = ({className}: {className:string}) => <p>{className}</p>; export default <Title className="a"/>;',
    ]) {
        const r = renameClass(base, { 'x.tsx': source }, 'a', 'z');
        expect(r.files['x.tsx']).toBe(source);
        expect(r.unsafe.length).toBeGreaterThan(0);
    }
});
test('nonbreaking space belongs to the HTML class token', () => {
    const files = { 'x.tsx': '<div className="a\u00a0suffix"/>' };
    expect(renameClass(base, files, 'a', 'z').files).toEqual(files);
    expect(classUsage(base, files).counts.a).toBe(0);
});
test('plans patches for each supplied stylesheet', () => {
    const files = {
        'public/base.css': base,
        'public/site.css': '.a{padding:1rem}',
        'page.tsx':
            '<><link rel="stylesheet" href="/base.css"/><link rel="stylesheet" href="/site.css"/><div className="a"/></>',
    };
    expect(() =>
        renameClass(files['public/site.css'], { 'page.tsx': files['page.tsx'] }, 'a', 'z'),
    ).toThrow(/inventory/);
    const r = renameClass(
        files['public/site.css'],
        files,
        'a',
        'z',
        'public/site.css',
        resolveClassStylesheets(files, ['page.tsx']),
    );
    expect(r.files['public/base.css']).toBe('.z{color:red}');
    expect(r.files['public/site.css']).toBe('.z{padding:1rem}');
});
test('accounts for attribute selectors, scope roots, computed DOM calls and JSX spreads', () => {
    const css =
        '[class~="button"]{color:red} @scope (.button){.b{color:blue}} .button{display:block}';
    const files = {
        'dom.ts': 'el.classList.add("but" + "ton")',
        'x.tsx': 'const props={["class"+"Name"]:"b"+"utton"}; <div {...props}/>',
    };
    const r = renameClass(css, files, 'button', 'action');
    expect(r.css).toBe(css.replaceAll('button', 'action'));
    for (const match of css.matchAll(/button/g)) {
        expect(
            r.cssPatches.some((p) => p.start <= match.index && p.end >= match.index + 6) ||
                r.unsafe.some(
                    (p) =>
                        p.path === '<stylesheet>' &&
                        p.start <= match.index &&
                        p.end >= match.index + 6,
                ),
        ).toBe(true);
    }
    for (const path of Object.keys(files)) expect(r.unsafe.some((p) => p.path === path)).toBe(true);
});
test('refuses known destination usage', () => {
    expect(() =>
        renameClass(base, { 'x.tsx': '<><div className="a"/><div className="z"/></>' }, 'a', 'z'),
    ).toThrow();
});
test('keeps CSS whitespace, header comments and priority comments', () => {
    const css = '.a{color : red ;}';
    expect(applyPatch(css, editDeclaration(css, target, 'color', 'blue'))).toBe(
        css.replace('red', 'blue'),
    );
    for (const source of [
        '.a /* keep rationale */ {color:red}',
        '@media (max-width:767px) /* keep rationale */ {.a{color:red}}',
    ]) {
        const next = applyPatch(
            source,
            editDeclaration(
                source,
                { ...target, width: source.startsWith('@') ? 767 : undefined },
                'color',
                null,
            ),
        );
        expect(next).toContain('/* keep rationale */');
        expect(next).not.toContain('color:red');
    }
    const annotation = '.a{color:red !/* keep rationale */important}';
    expect(applyPatch(annotation, editDeclaration(annotation, target, 'color', 'blue'))).toBe(
        annotation.replace('red', 'blue'),
    );
});
test('warns when a breakpoint edit would lose to another applicable declaration', () => {
    for (const css of [
        '@media (max-width:767px){.b{display:block}} .a{color:red}',
        '@media (max-width:767px){.a{color:red}} @media (max-width:991px){.a{color:pink}}',
        '.a.a{color:red} .a{display:block}',
        '#wrapper .a{color:red} .a{display:block}',
    ]) {
        // The descendant rule only competes for an element inside #wrapper.
        const matchesSelector = css.startsWith('#wrapper')
            ? (selector: string) => ['#wrapper .a', '.a'].includes(selector)
            : undefined;
        expect(() =>
            editDeclaration(css, { ...target, width: 767, matchesSelector }, 'color', 'blue'),
        ).toThrow(/cascade/i);
    }
});
test('preserves priority and matches ordinary property names case insensitively', () => {
    const css = '.a{COLOR:red!important} .a{color:blue}';
    expect(applyPatch(base, editDeclaration(base, target, 'color', 'blue', 'important'))).toContain(
        '!important',
    );
    expect(
        applyPatch(
            '.a{color:red!important}',
            editDeclaration('.a{color:red!important}', target, 'color', 'blue', 'normal'),
        ),
    ).toBe('.a{color:blue}');
    expect(applyPatch(css, editDeclaration(css, target, 'color', 'green'))).toBe(
        css.replace('red', 'green'),
    );
    expect(applyPatch(css, editDeclaration(css, target, 'color', null))).toBe('');
});
test('creates the selected current state convention', () => {
    expect(
        applyPatch(
            base,
            editDeclaration(
                base,
                { ...target, state: 'current', currentConvention: 'webflow' },
                'color',
                'blue',
            ),
        ),
    ).toContain('.a.w--current');
});
test('inventories complex selectors separately from editable declarations and ignores condition identifiers', () => {
    const css =
        '.a,.b{color:red} @supports(display:grid){@media (min-width:1px){.c{display:grid}}}';
    expect(() => createClass(css, 'a', {})).toThrow();
    expect(classUsage(css, { 'x.tsx': '<div className={a ? "b" : "c"}/>' }).counts).toEqual({
        a: 0,
        b: 1,
        c: 1,
    });
});
test('uses CRLF when creating classes', () => {
    const css = '/* keep */\r\n';
    expect(applyPatch(css, createClass(css, 'a', { color: 'red' }))).not.toMatch(/(?<!\r)\n/);
});
