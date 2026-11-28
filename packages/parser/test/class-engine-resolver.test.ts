import { expect, test } from 'bun:test';

import { editDeclaration, renameClass, resolveClassStylesheets } from '../src/classes';

test('matches the hypothetical Current and Hover state nested in structural selectors', () => {
    for (const [suffix, state, convention] of [
        [':is(.w--current)', 'current', 'webflow'],
        [':where(:is([aria-current]))', 'current', 'aria'],
        [':HOVER', 'hover', 'aria'],
    ] as const) {
        const css = '#wrapper .a' + suffix + '{color:green!important}.a{color:red}';
        const result = editDeclaration(
            css,
            {
                selector: '.a',
                width: 768,
                state,
                currentConvention: convention,
                matchesSelector: (s) => s === '#wrapper .a',
            },
            'color',
            'blue',
        );
        expect(result.effect).toBe('loses');
    }
    expect(
        editDeclaration(
            '.a[aria-current="page"]{color:green!important}.a{}',
            { selector: '.a', state: 'current', matchesSelector: () => false },
            'color',
            'blue',
        ).effect,
    ).toBe('unknown');
});
test('mixed-case CSS imports retain uncertainty and are followed for rename', () => {
    const css = '@ImPoRt UrL("./other.css"); .a{color:red}';
    const files = { 'app/main.css': css, 'app/other.css': '.a{color:green!important}' };
    expect(editDeclaration(css, { selector: '.a', width: 768 }, 'color', 'blue').effect).toBe(
        'unknown',
    );
    expect([...resolveClassStylesheets(files, ['app/main.css']).paths]).toEqual(Object.keys(files));
});
test('uses the configured mapping for module and CSS imports and never guesses alias ownership', () => {
    const files = {
        'app/layout.tsx': 'import "@/components/shell"; import "@/styles/x.css";',
        'app/components/shell.tsx': 'import "./real.css";',
        'components/shell.tsx': 'import "./unrelated.css";',
        'components/unrelated.css': '.a{}',
        'app/components/real.css': '.a{}',
        'app/styles/x.css': '.a{}',
        'styles/x.css': '.a{}',
    };
    const entries = ['app/layout.tsx'];
    expect(resolveClassStylesheets(files, entries).status).toBe('incomplete');
    const graph = resolveClassStylesheets(files, entries, {}, { paths: { '@/*': ['./app/*'] } });
    expect([...graph.paths]).toEqual(['app/components/real.css', 'app/styles/x.css']);
    const result = renameClass('.a{}', files, 'a', 'z', 'app/styles/x.css', graph);
    expect(result.files['components/unrelated.css']).toBe('.a{}');
    expect(result.files['app/components/real.css']).toBe('.z{}');
});
test('scope membership alone cannot determine the closer of two equal-specificity scope roots', () => {
    const css =
        '@scope (.inner){.a{color:green!important}} @scope (.outer){.a{color:orange!important}} .a{color:red}';
    const edit = editDeclaration(
        css,
        { selector: '.a', width: 768, matchesCondition: () => true },
        'color',
        'blue',
    );
    expect(edit.effect).toBe('unknown');
    expect(edit.competingRule).toBeUndefined();
    expect(edit.patch).not.toBeNull();
});
test('negation and partially resolved selector lists never consult live state markers', () => {
    for (const [pseudo, effect] of [
        [':NOT(:IS(.w--current))', 'applies'],
        [':IS(.w--current.feature,.x)', 'unknown'],
    ] as const) {
        const css = '#wrap .a' + pseudo + '{color:green!important}.a{}';
        const result = editDeclaration(
            css,
            {
                selector: '.a',
                state: 'current',
                currentConvention: 'webflow',
                matchesSelector: (s) => {
                    expect(s.toLowerCase()).not.toContain('w--current');
                    return undefined;
                },
            },
            'color',
            'blue',
        );
        expect(result.effect).toBe(effect);
    }
});
test('supports tsconfig directory, baseUrl, longest pattern and ordered fallbacks without crossing into unrelated assets', () => {
    const files = {
        'site/app.tsx': 'import "brand/css/main.css";',
        'site/code/theme/main.css': '.a{}',
        'site/code/other/css/main.css': '.a{}',
    };
    const config = {
        configPath: 'site/tsconfig.json',
        baseUrl: 'code',
        paths: { 'brand/*': ['other/*'], 'brand/css/*': ['missing/*', 'theme/*'] },
    };
    const set = resolveClassStylesheets(files, ['site/app.tsx'], {}, config);
    expect(set.status).toBe('complete');
    expect([...set.paths]).toEqual(['site/code/theme/main.css']);
    expect(
        resolveClassStylesheets({ 'site/app.tsx': 'import "brand/shell";' }, ['site/app.tsx'])
            .status,
    ).toBe('incomplete');
    expect(
        resolveClassStylesheets(
            files,
            ['site/app.tsx'],
            { 'brand/css/main.css': { path: 'site/code/other/css/main.css' } },
            config,
        ).paths.has('site/code/other/css/main.css'),
    ).toBe(true);
});

test('retains a proposed patch and prevents a rename plan when a selector cannot be parsed', () => {
    const css = '.a:{color:green}.a{color:red}';
    const edit = editDeclaration(css, { selector: '.a', width: 768 }, 'color', 'blue');
    expect(edit.effect).toBe('unknown');
    expect(edit.patch).not.toBeNull();
    const files = { 'app/global.css': css };
    const graph = resolveClassStylesheets(files, ['app/global.css']);
    expect(graph.status).toBe('incomplete');
    expect(graph.unresolved[0]?.importer).toBe('app/global.css');
    expect(() => renameClass(css, files, 'a', 'z', 'app/global.css', graph)).toThrow(/incomplete/i);
});
