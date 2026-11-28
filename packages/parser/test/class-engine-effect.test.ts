import { expect, test } from 'bun:test';

import {
    buildElementContext,
    editDeclaration,
    prepareElementContext,
    renameClass,
    resolveClassStylesheets,
} from '../src/classes';

const target = { selector: '.a', width: 768, direction: 'min' } as const;
test('reports an unresolved ancestor and preserves the proposed edit in every case', () => {
    const css = '#wrapper .a{color:green} .a{color:red}';
    for (const [match, effect] of [
        [undefined, 'unknown'],
        [true, 'loses'],
        [false, 'applies'],
    ] as const) {
        const result = editDeclaration(
            css,
            {
                ...target,
                matchesSelector: match === undefined ? undefined : (s) => s === '.a' || match,
            },
            'color',
            'blue',
        );
        expect(result.effect).toBe(effect);
        expect(result.patch).not.toBeNull();
        if (effect !== 'applies') expect(result.competingRule?.selector).toBe('#wrapper .a');
    }
    expect(
        editDeclaration(
            '@media(max-width:479px){' + css + '} .a{color:red}',
            target,
            'color',
            'blue',
        ).effect,
    ).toBe('applies');
});
test('evaluates the requested state independently of live preview state', () => {
    for (const state of ['hover', 'active', 'focus-visible', 'current'] as const) {
        for (const css of ['.a{color:red}', '.a{display:block}']) {
            expect(
                editDeclaration(
                    css,
                    { ...target, state, matchesSelector: (s) => s === '.a' },
                    'color',
                    'blue',
                ).effect,
            ).toBe('applies');
        }
    }
});
test('reports unknown winning conditions or imported declarations', () => {
    for (const css of [
        '@supports(display:grid){#wrapper .a{color:green}}',
        '@media(width >= 48rem){#wrapper .a{color:green}}',
        '@scope (#wrapper){.a{color:green!important}}',
        '@import "./other.css";',
    ]) {
        expect(
            editDeclaration(
                css + ' .a{color:red}',
                { ...target, matchesSelector: () => true },
                'color',
                'blue',
            ).effect,
        ).toBe('unknown');
    }
});
test('limits markup edits to source ownership and stylesheet-defined classes', () => {
    const files = {
        'app/layout.tsx': 'import "./base.css"; export default <div className="a"/>',
        'app/base.css': '.a{}',
        'other/layout.tsx': 'import "./other.css"; export default <div className="a"/>',
        'other/other.css': '.a{}',
    };
    const set = resolveClassStylesheets(files, ['app/layout.tsx']);
    const result = renameClass('.a{}', files, 'a', 'action', 'app/base.css', set);
    expect(result.files['other/layout.tsx']).toBe(files['other/layout.tsx']);
    expect(result.patches['other/layout.tsx']).toBeUndefined();
    expect(() => renameClass('.a{}', files, 'absent', 'new', 'app/base.css', set)).toThrow(
        /defined/,
    );
});
test('resolves local aliases and literal dynamic imports or identifies the missing dependency', () => {
    for (const specifier of ['@/components/shell', './lazy']) {
        const entry = specifier.startsWith('@')
            ? 'import "@/components/shell"'
            : 'const pending=import("./lazy")';
        const path = specifier.startsWith('@') ? 'src/components/shell.tsx' : 'app/lazy.tsx';
        const sheet = path.replace(/[^/]+$/, 'shell.css');
        const files = { 'app/layout.tsx': entry, [path]: 'import "./shell.css";', [sheet]: '.a{}' };
        expect([
            ...resolveClassStylesheets(
                files,
                ['app/layout.tsx'],
                {},
                { paths: { '@/*': ['src/*'] } },
            ).paths,
        ]).toContain(sheet);
        expect(
            resolveClassStylesheets({ 'app/layout.tsx': entry }, ['app/layout.tsx']).unresolved,
        ).toEqual([{ importer: 'app/layout.tsx', specifier }]);
    }
});

test('leaves weaker unresolved rules below the requested winner and reports linked CSS evidence gaps', () => {
    for (const [css, effect] of [
        ['#wrapper :where(.a){color:green} .a{color:red}', 'unknown'],
        ['@supports(display:grid){.a{color:green}} .a{color:red}', 'applies'],
        ['@supports(display:grid){.a{color:green!important}} .a{color:red}', 'unknown'],
    ] as const)
        expect(editDeclaration(css, target, 'color', 'blue').effect).toBe(effect);
    expect(
        editDeclaration(
            '.a{color:red}',
            { ...target, linkedStylesheets: ['other.css'] },
            'color',
            'blue',
        ),
    ).toMatchObject({ effect: 'unknown', reason: 'Uninspected stylesheet: other.css' });
    expect(editDeclaration('.a{color:red}', { selector: '.a' }, 'color', 'red')).toMatchObject({
        patch: null,
        effect: 'applies',
    });
    expect(editDeclaration('.a{color:red}', { selector: '.a' }, 'color', null).effect).toBe(
        'applies',
    );
    expect(() =>
        renameClass('.other:not(.a){}', { 'page.tsx': '<div className="a"/>' }, 'a', 'action'),
    ).toThrow(/defined/);
});
test('uses structural ancestor evidence while simulating hover', () => {
    const css = '#wrapper .a:hover{color:green}.a{color:red}';
    for (const [inside, effect] of [
        [true, 'loses'],
        [false, 'applies'],
    ] as const) {
        const result = editDeclaration(
            css,
            { ...target, state: 'hover', matchesSelector: (s) => s === '#wrapper .a' && inside },
            'color',
            'blue',
        );
        expect(result.effect).toBe(effect);
        expect(result.patch).not.toBeNull();
    }
});

test('a nonliteral lazy dependency or ambiguous alias leaves the project inventory incomplete', () => {
    const files = {
        'app/layout.tsx': 'import "@/shell"; const pending=import(which);',
        'src/shell.tsx': 'export {}',
        'shell.tsx': 'export {}',
    };
    expect(resolveClassStylesheets(files, ['app/layout.tsx']).unresolved).toEqual([
        { importer: 'app/layout.tsx', specifier: '@/shell' },
        { importer: 'app/layout.tsx', specifier: 'import(which)' },
    ]);
});

test('pseudo-elements and excluded subjects do not compete for element color', () => {
    for (const selector of [
        'input::placeholder',
        'input:before',
        '.form_input::placeholder',
        '.other:weblab-unmodeled',
    ]) {
        const edit = editDeclaration(
            '.button{color:red}' + selector + '{color:gray!important}',
            { selector: '.button', width: 768, matchesSelector: () => false },
            'color',
            'blue',
        );
        expect(edit.effect).toBe('applies');
    }
});

test('builds serializable per-state evidence from structural matches on the selected element', () => {
    const css =
        'input.field#different[required]::placeholder{color:gray!important} .wrap a.button#cta[href]:hover{color:green!important} .button{color:red}';
    const queried: string[] = [];
    const context = buildElementContext(
        prepareElementContext([css]),
        (selector) => {
            queried.push(selector);
            return ['a.button#cta[href]', '.wrap a.button#cta[href]', '.button'].includes(selector);
        },
        1440,
    );
    const elementContext = JSON.parse(JSON.stringify(context)) as typeof context;
    expect(
        editDeclaration(css, { selector: '.button', elementContext }, 'color', 'blue').effect,
    ).toBe('applies');
    expect(
        editDeclaration(
            css,
            { selector: '.button', state: 'hover', elementContext },
            'color',
            'blue',
        ).effect,
    ).toBe('loses');
    expect(queried).not.toContain('.wrap a.button#cta[href]:hover');
    expect(queried).toContain('.wrap a.button#cta[href]');
});
test('respects document order and identifies the winning source', () => {
    const css = '.a{color:red}';
    const linked = { path: 'linked.css', source: '.a{color:green}' };
    const edited = { path: 'authored.css', edited: true } as const;
    const sheets = [edited, linked];
    const apply = (stylesheets: typeof sheets) =>
        editDeclaration(
            css,
            { selector: '.a', stylesheets, linkedStylesheets: ['linked.css'] },
            'color',
            'blue',
        );
    expect(apply(sheets)).toMatchObject({
        effect: 'loses',
        competingRule: { path: 'linked.css', start: 3 },
    });
    expect(apply([linked, edited]).effect).toBe('applies');
    expect(
        editDeclaration(
            css,
            { selector: '.a', stylesheets: [edited], linkedStylesheets: ['missing.css'] },
            'color',
            'blue',
        ).effect,
    ).toBe('unknown');
});
test('unverified selector specificity cannot beat higher importance', () => {
    expect(
        editDeclaration(
            '.a:is(#x:unverified,.a){color:gray}.a{color:red!important}',
            { selector: '.a' },
            'color',
            'blue',
        ).effect,
    ).toBe('applies');
});

test('element evidence excludes other tags, classes, IDs and attributes while retaining class combinations', () => {
    const css = '.button{color:red}.other,h1,#other,[disabled]{color:gray!important}';
    const plan = prepareElementContext([css], ['base']);
    const target = { selector: '.button' };
    expect(editDeclaration(css, target, 'color', 'blue').effect).toBe('unknown');
    for (const extra of [false, true]) {
        const elementContext = buildElementContext(
            plan,
            (s) => s === '.button' || (s === '.other' && extra),
        );
        expect(editDeclaration(css, { ...target, elementContext }, 'color', 'blue').effect).toBe(
            extra ? 'loses' : 'applies',
        );
    }
});
