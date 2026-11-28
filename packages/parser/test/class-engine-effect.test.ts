import { expect, test } from 'bun:test';

import { editDeclaration, renameClass, resolveClassStylesheets } from '../src/classes';

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
