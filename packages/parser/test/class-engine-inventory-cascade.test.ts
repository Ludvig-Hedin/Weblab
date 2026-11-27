import { expect, test } from 'bun:test';

import * as engine from '../src/classes';

const { applyPatch, editDeclaration, renameClass, resolveClassStylesheets } = engine;

const files = {
    'app/layout.tsx':
        'import "./globals.css"; export default <link rel="stylesheet" href="/base.css"/>;',
    'app/globals.css': '@import url("./more.css") layer(components); .a{color:red}',
    'app/more.css': '@import "./globals.css"; .a{padding:0}',
    'public/base.css': '.a{display:block}',
    'public/unlinked.css': '.a{color:tomato}',
    'page.tsx': '<div className="a"/>',
};
test('only renames members of the explicit import graph, including cyclic and linked sheets', () => {
    const graph = resolveClassStylesheets(files, ['app/layout.tsx']);
    const result = renameClass(
        files['app/globals.css'],
        files,
        'a',
        'action',
        'app/globals.css',
        graph,
    );
    expect(result.files['public/unlinked.css']).toBe(files['public/unlinked.css']);
    expect(result.files['public/base.css']).toContain('.action');
    expect(result.files['app/more.css']).toContain('.action');
    expect(result.patches['public/unlinked.css']).toBeUndefined();
});
test('reports the missing import and importer, including layout imports', () => {
    for (const [importer, sheet] of [
        ['app/globals.css', '@import "./missing.css";'],
        ['app/layout.tsx', 'import "./missing.css";'],
    ] as const) {
        const graph = resolveClassStylesheets({ ...files, [importer]: sheet }, [importer]);
        expect(graph.status).toBe('incomplete');
        expect(graph.unresolved).toEqual([{ importer, specifier: './missing.css' }]);
        expect(() =>
            renameClass(files['app/globals.css'], files, 'a', 'action', 'app/globals.css', graph),
        ).toThrow(/missing\.css/);
    }
});
test('accepts caller proof for class-free external font CSS and resolved vendor CSS', () => {
    const url = 'https://fonts.googleapis.com/css2?family=Inter';
    const input = {
        ...files,
        'app/layout.tsx':
            'import "./globals.css"; export default <link rel="stylesheet" href="' + url + '"/>;',
    };
    expect(resolveClassStylesheets(input, ['app/layout.tsx']).status).toBe('incomplete');
    for (const proof of ['class-free', { path: 'public/unlinked.css' }] as const) {
        const graph = resolveClassStylesheets(input, ['app/layout.tsx'], { [url]: proof });
        expect(graph.status).toBe('complete');
        const result = renameClass(
            input['app/globals.css'],
            input,
            'a',
            'action',
            'app/globals.css',
            graph,
        );
        expect(result.files['app/globals.css']).toContain('.action');
        expect(result.files['public/unlinked.css']).toBe(
            proof === 'class-free' ? files['public/unlinked.css'] : '.action{color:tomato}',
        );
    }
});
test('applies valid breakpoint edits to grouped classes, base of combo and disjoint media', () => {
    const target = { selector: '.a', width: 768, direction: 'min' } as const;
    for (const css of [
        '.a,.b{color:red}',
        '@layer components{.a{color:red}.a.is-secondary{color:green}}',
        '@layer components{.a{color:red}@media(max-width:479px){#wrapper .a{color:green}}}',
    ]) {
        expect(applyPatch(css, editDeclaration(css, target, 'color', 'blue').patch)).toContain(
            'blue',
        );
    }
});
test('recognizes shorthand overrides in the same matching breakpoint', () => {
    const css = '@media (min-width:768px){.a{margin-left:10px;margin:0}}';
    expect(
        editDeclaration(
            css,
            { selector: '.a', width: 768, direction: 'min' },
            'margin-left',
            '20px',
        ).effect,
    ).toBe('loses');
});
test('reports optional DOM class mutations without rewriting them', () => {
    const src = 'el?.classList?.add("but" + "ton")';
    const r = renameClass('.button{}', { 'site.ts': src }, 'button', 'action');
    expect(r.files['site.ts']).toBe(src);
    expect(
        r.unsafe.some((s) => s.path === 'site.ts' && s.start === 0 && s.end === src.length),
    ).toBe(true);
});

test('follows local barrel imports and refuses stale graph evidence', () => {
    const project = {
        ...files,
        'app/layout.tsx': 'export {default} from "./shell";',
        'app/shell.tsx': 'import "./globals.css"; export default ()=>null;',
    };
    const graph = resolveClassStylesheets(project, ['app/layout.tsx']);
    expect([...graph.paths]).toEqual(['app/globals.css', 'app/more.css']);
    const changed = { ...project, 'app/shell.tsx': 'import "./new.css";' };
    expect(() =>
        renameClass(project['app/globals.css'], changed, 'a', 'action', 'app/globals.css', graph),
    ).toThrow(/changed/);
});

test('ranks applicable layer, importance, specificity, order and width for the selected element', () => {
    const target = {
        selector: '.a',
        width: 768,
        direction: 'min',
        matchesSelector: (selector: string) => ['.a', '#wrapper .a', '.a.a'].includes(selector),
    } as const;
    for (const css of [
        '@layer theme, components; @layer theme{#wrapper .a{color:red}} @layer components{.a{color:black}}',
        '@media(max-width:479px){#wrapper .a{color:red}} .a{color:black}',
        '@media(min-width:768px){.a{margin:0;margin-left:10px}}',
    ]) {
        const prop = css.includes('margin') ? 'margin-left' : 'color';
        const value = prop === 'color' ? 'blue' : '20px';
        expect(applyPatch(css, editDeclaration(css, target, prop, value).patch)).toContain(value);
    }
    for (const css of [
        '@layer components,theme; @layer theme{.a{color:red}} @layer components{.a{color:black}}',
        '@layer theme,components; @layer theme{.a{color:red!important}} @layer components{.a{color:black!important}}',
        '@media(min-width:768px){#wrapper .a{color:red}} .a{color:black}',
    ])
        expect(editDeclaration(css, target, 'color', 'blue').effect).toBe('loses');
});
