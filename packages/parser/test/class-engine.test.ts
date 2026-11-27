import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import {
    applyPatch,
    classUsage,
    createClass,
    detachStyles,
    editDeclaration,
    indexStylesheet,
    renameClass,
} from '../src/classes';

const fixture = (name: string) =>
    readFileSync(new URL('./data/classes/' + name + '.css', import.meta.url), 'utf8');
const webflow = fixture('webflow');
const mobile = fixture('mobile');

test('edits only the source value, including in an unlayered imported combo', () => {
    const patch = editDeclaration(
        webflow,
        { selector: '.button.is-secondary', state: 'hover' },
        'color',
        'black',
    );
    expect(applyPatch(webflow, patch)).toBe(webflow.replace('blue', 'black'));
    expect(patch).toEqual({
        start: webflow.indexOf('blue') + 2,
        end: webflow.indexOf('blue') + 4,
        text: 'ack',
    });
    const rules = indexStylesheet(webflow);
    expect(rules[1]?.classes).toEqual(['button', 'is-secondary']);
    expect(webflow.slice(rules[1]!.start, rules[1]!.end)).toBe(
        '.button.is-secondary:hover { color: blue; }',
    );
    expect(detachStyles(webflow, { selector: '.button', width: 991, state: 'current' })).toEqual({
        display: 'block',
    });
});

test('creates states and ordered media in both directions and prunes empty rules', () => {
    for (const [source, selector, width, direction] of [
        [webflow, '.button', 479, 'max'],
        [mobile, 'h1', 480, 'min'],
    ] as const) {
        const target = { selector, width, direction, state: 'active' } as const;
        const changed = applyPatch(source, editDeclaration(source, target, 'opacity', '1'));
        expect(detachStyles(changed, target)).toEqual({ opacity: '1' });
        const widths = indexStylesheet(changed).flatMap((row) => row.width ?? []);
        expect(widths).toEqual(direction === 'min' ? [480, 768] : [991, 479]);
        expect(applyPatch(changed, editDeclaration(changed, target, 'opacity', null))).toBe(source);
    }
    const added = applyPatch('', createClass('', 'card', { display: 'grid', gap: '1rem' }));
    expect(added).toContain('@layer components');
    expect(detachStyles(added, { selector: '.card' })).toEqual({ display: 'grid', gap: '1rem' });
});

test('renames a nine-page project and accounts for every remaining occurrence', () => {
    const imports =
        'import {cn} from "@weblab/ui/utils"; import clsx from "clsx"; import {twMerge} from "tailwind-merge"; ';
    const expr = [
        '"button"',
        "{'button large'}",
        '{cn("button")}',
        '{clsx("button")}',
        '{twMerge("button")}',
        '{`button ${kind}`}',
        '{ok && "button"}',
        '{document.querySelector(".button")}',
        '"buttonish"',
    ];
    const files = Object.fromEntries(
        expr.map((x, i) => [
            'page' + i + '.tsx',
            imports + 'export default <a className=' + x + ' />',
        ]),
    );
    const result = renameClass(webflow, files, 'button', 'action');
    expect(result.css).toBe(webflow.replaceAll('.button', '.action'));
    expect(result.unsafe.map((s) => s.path).sort()).toEqual([
        'page5.tsx',
        'page6.tsx',
        'page7.tsx',
    ]);
    expect(
        Object.entries(result.files)
            .filter(([, s]) => /\bbutton\b/.test(s))
            .map(([p]) => p),
    ).toEqual(result.unsafe.map((s) => s.path));
    const usage = classUsage(webflow, files);
    expect(usage.counts.button).toBe(7);
    expect(usage.unused).toEqual(['is-secondary']);
    for (const [path, source] of Object.entries(result.files)) {
        for (const match of source.matchAll(/\bbutton\b/g)) {
            expect(
                result.unsafe.some(
                    (site) =>
                        site.path === path &&
                        site.start <= match.index &&
                        site.end >= match.index + match[0].length,
                ),
            ).toBe(true);
        }
    }
});

test('creates an empty class and writes every supported global tag in the components layer', () => {
    const css = applyPatch('', createClass('', 'card', {}));
    expect(indexStylesheet(css)[0]?.classes).toEqual(['card']);
    for (const selector of ['body', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
        const next = applyPatch(css, editDeclaration(css, { selector }, 'color', 'inherit'));
        expect(indexStylesheet(next).find((row) => row.selector === selector)?.layer).toBe(
            'components',
        );
    }
});

test('preserves BOM, CRLF, comments and nested current-state rules', () => {
    const css =
        '\uFEFF/* 😀 */\r\n@layer components {\r\n  .link { @media (max-width: 767px) { &[aria-current] { color : red; /* keep */ } } }\r\n}\r\n';
    const target = { selector: '.link', state: 'current', width: 767 } as const;
    const row = indexStylesheet(css).find((rule) => rule.state === 'current')!;
    expect(css.slice(row.start, row.end)).toBe('&[aria-current] { color : red; /* keep */ }');
    expect(applyPatch(css, editDeclaration(css, target, 'color', 'blue'))).toBe(
        css.replace('red;', 'blue;'),
    );
    expect(applyPatch(css, editDeclaration(css, target, 'color', null))).toBe(
        css.replace(' color : red;', ''),
    );
    expect(editDeclaration(css, target, 'color', 'red')).toBeNull();
});

test('uses layer and important precedence across duplicate rules', () => {
    const target = { selector: '.title' };
    const css = '.title { color:red; } @layer components { .title { color:blue; } }';
    expect(detachStyles(css, target)).toEqual({ color: 'red' });
    expect(applyPatch(css, editDeclaration(css, target, 'color', 'green'))).toBe(
        css.replace('red', 'green'),
    );
    const important = css.replaceAll(';', ' !important;');
    expect(detachStyles(important, target)).toEqual({ color: 'blue !important' });
    expect(() => editDeclaration(css, target, 'color', 'red;display:none')).toThrow();
});

test('renames complex CSS selector tokens and nested helpers, and flags script selectors and shadowed helpers', () => {
    const css = '.button, article > .button:hover { content: ".button"; }';
    const files = {
        'site.tsx':
            'import clsx from "clsx"; import {twMerge} from "tailwind-merge"; const s = <div className={twMerge(clsx("button"))}/>; document.querySelector(".button"); function f(cn: Function) { return cn("button"); }',
    };
    const result = renameClass(css, files, 'button', 'action');
    expect(result.css).toBe('.action, article > .action:hover { content: ".button"; }');
    expect(result.files['site.tsx']).toBe(
        files['site.tsx'].replace('clsx("button")', 'clsx("action")'),
    );
    expect(result.unsafe).toHaveLength(3);
});
