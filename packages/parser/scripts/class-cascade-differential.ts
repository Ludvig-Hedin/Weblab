// Opt-in: bun run test:class-cascade [cases] [seed]
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

import type { ClassState, ClassTarget } from '../src/classes/stylesheet';
import type { AliasShape } from './class-rename-browser';
import { applyPatch, editDeclaration } from '../src/classes/stylesheet';
import { checkRename } from './class-rename-browser';

const count = Number(process.argv[2] ?? 2000);
const seed = Number(process.argv[3] ?? 314159);
if (!Number.isSafeInteger(count) || count <= 0 || !Number.isSafeInteger(seed))
    throw Error('Expected a positive case count and integer seed');
let random = seed >>> 0;
function pick<T>(choices: readonly T[]): T {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return choices[Math.floor((random / 2 ** 32) * choices.length)]!;
}
const bit = () => pick([true, false]);
type Fixture = {
    target: ClassTarget;
    css: string;
    imported: boolean;
    wrapped: boolean;
    classes: string;
    aria: string | null;
    shapes: string[];
    expectedColor?: string;
    supports?: string;
};
function fixture(): Fixture {
    const shapes = new Set<string>();
    const state = pick<ClassState | undefined>([
        undefined,
        'current',
        'hover',
        'focus-visible',
        'active',
    ]);
    const combo = bit(),
        wrapped = bit();
    const selector = pick(['.a', '.a.extra']);
    const width = pick([479, 640, 767, 768, 991, 1024]);
    const target: ClassTarget = {
        selector,
        state,
        width,
        direction: pick(['min', 'max']),
        currentConvention: pick(['webflow', 'aria']),
    };
    const aria =
        state === 'current' && target.currentConvention === 'aria' ? pick(['page', 'step']) : null;
    if (state === 'current') shapes.add(aria ? 'aria-current-target' : 'webflow-current-target');
    const base = '.a{color:red}';
    const rules = [bit() ? base : '@layer components{' + base + '}'];
    for (let j = pick([1, 2, 3, 4]); j > 0; j--) {
        const subject = pick([
            '.a',
            String.raw`.\61`,
            '.a.extra',
            '.a.other',
            'button',
            '.a.a',
            '*',
        ]);
        const pseudo = pick([
            '',
            ':hover',
            ':focus-visible',
            ':active',
            '.w--current',
            '[aria-current]',
            '[aria-current="page"]',
            ':where(:hover,.w--current)',
            ':not(.other)',
            ':is(.extra,:focus-visible)',
            ':is(svg|*:hover)',
        ]);
        if (pseudo.includes('aria-current'))
            shapes.add(
                pseudo.includes('page')
                    ? 'aria-current-page-selector'
                    : 'aria-current-presence-selector',
            );
        if (pseudo.includes('(')) shapes.add('functional-selector');
        if (subject.includes('\\')) shapes.add('escaped-class');
        const priority = pick(['', '!important', String.raw`!\69mportant`]);
        if (priority.includes('\\')) shapes.add('escaped-priority');
        const body = '{color:green' + priority + '}';
        const ancestor = pick(['.wrap', '#outer', '.absent', 'section']);
        let rule = pick([
            subject + pseudo + body,
            ancestor + ' ' + subject + pseudo + body,
            ancestor + '{' + subject + pseudo + body + '}',
            subject + '{&' + pseudo + body + '}',
        ]);
        if (bit())
            rule =
                '@media (' +
                pick(['min', 'max']) +
                '-width:' +
                pick([479, 767, 991]) +
                'px){' +
                rule +
                '}';
        if (bit())
            rule = '@layer ' + pick(['components', 'theme', 'theme.colors']) + '{' + rule + '}';
        if (bit()) rules.push(rule);
        else rules.unshift(rule);
    }
    if (bit()) rules.unshift('@layer theme,components;');
    rules.unshift('@namespace svg url("http://www.w3.org/2000/svg");');
    const imported = pick([false, false, false, false, false, false, false, true]);
    if (imported) {
        const href =
            'data:text/css,' +
            encodeURIComponent(pick(['.a{color:orange!important}', '.other{color:orange}']));
        const spelling = pick(['@import', String.raw`@i\6dport`]);
        shapes.add(spelling === '@import' ? 'import' : 'escaped-import');
        rules.unshift(spelling + ' "' + href + '";');
    }
    return {
        target,
        css: rules.join('\n'),
        imported,
        wrapped,
        shapes: [...shapes, 'random-cascade'],
        aria,
        classes: [
            'a',
            combo || selector === '.a.extra' ? 'extra' : '',
            state === 'current' && !aria ? 'w--current' : '',
        ].join(' '),
    };
}
function probe(
    kind: 'conditional-layer' | 'forgiving-list',
    positive: boolean,
    state: ClassState | undefined,
    withEvidence: boolean,
): Fixture {
    const target: ClassTarget = {
        selector: '.a',
        width: 768,
        direction: 'min',
        state,
        currentConvention: 'webflow',
    };
    const condition = positive ? '(display:grid)' : '(display:weblab-invalid)';
    const conditional = kind === 'conditional-layer';
    return {
        target,
        wrapped: false,
        imported: false,
        aria: null,
        classes: state === 'current' ? 'a w--current' : 'a',
        css: conditional
            ? '@supports' +
              condition +
              '{@layer theme;} @layer components{.a{color:red}} @layer theme{.a{color:green}}'
            : '.a:is(#unused:' +
              (positive ? 'hover' : 'weblab-review-unknown') +
              ',.a){color:green}.a{color:red}',
        shapes: [
            kind,
            kind + '-' + (positive ? 'positive' : 'negative'),
            ...(state ? ['probe-' + state] : []),
        ],
        expectedColor: (conditional ? positive : !positive) ? 'rgb(0, 0, 255)' : 'rgb(0, 128, 0)',
        supports: conditional && withEvidence ? condition : undefined,
    };
}
const fixed = [
    probe('conditional-layer', false, undefined, false),
    probe('conditional-layer', true, undefined, false),
    probe('conditional-layer', false, undefined, true),
    probe('conditional-layer', true, undefined, true),
    probe('forgiving-list', false, 'hover', false),
    probe('forgiving-list', false, 'current', false),
];
const coverage: Record<string, { definite: number; unknown: number; mismatches: number }> = {};
function record(shape: string, uncertain: boolean, mismatch: boolean) {
    const row = (coverage[shape] ??= { definite: 0, unknown: 0, mismatches: 0 });
    if (uncertain) row.unknown++;
    else row.definite++;
    if (mismatch) row.mismatches++;
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let applies = 0,
    loses = 0,
    unknown = 0,
    mismatches = 0;
try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><section><button id="target"></button></section>');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: '#target',
    });
    for (let index = 0; index < count; index++) {
        const f =
            fixed[index] ??
            (index % 8 === 0
                ? bit()
                    ? probe('conditional-layer', bit(), undefined, bit())
                    : probe('forgiving-list', bit(), pick(['hover', 'current']), false)
                : fixture());
        const supports =
            f.supports && (await page.evaluate((condition) => CSS.supports(condition), f.supports));
        if (typeof supports === 'boolean') f.target.matchesCondition = () => supports;
        const queries = new Set<string>();
        const edit = (matchesSelector: ClassTarget['matchesSelector']) =>
            editDeclaration(f.css, { ...f.target, matchesSelector }, 'color', 'blue');
        edit((s) => {
            queries.add(s);
            return undefined;
        });
        const evidence = await page.evaluate(
            ({ wrapped, classes, selectors, aria }) => {
                const el = document.querySelector('button')!;
                el.className = classes;
                if (aria === null) el.removeAttribute('aria-current');
                else el.setAttribute('aria-current', aria);
                el.parentElement!.className = wrapped ? 'wrap' : '';
                el.parentElement!.id = wrapped ? 'outer' : '';
                return Object.fromEntries(selectors.map((s) => [s, el.matches(s)]));
            },
            { wrapped: f.wrapped, classes: f.classes, aria: f.aria, selectors: [...queries] },
        );
        const result = edit((s) => evidence[s]);
        const css = applyPatch(f.css, result.patch);
        await page.setViewportSize({ width: f.target.width!, height: 600 });
        const state = f.target.state;
        await cdp.send('CSS.forcePseudoState', {
            nodeId,
            forcedPseudoClasses: state && state !== 'current' ? [state] : [],
        });
        const actual = await page.evaluate(
            async ({ css, imported }) => {
                document.querySelector('style')?.remove();
                const style = document.createElement('style');
                const loaded = imported
                    ? new Promise<void>((resolve, reject) => {
                          style.onload = () => resolve();
                          style.onerror = () => reject(Error('stylesheet load failed'));
                      })
                    : undefined;
                style.textContent = css;
                document.head.append(style);
                await loaded;
                return getComputedStyle(document.querySelector('button')!).color;
            },
            { css, imported: f.imported },
        );
        if (f.expectedColor)
            assert.equal(actual, f.expectedColor, 'Chrome control ' + JSON.stringify(f));
        const mismatch =
            result.effect !== 'unknown' &&
            (result.effect === 'applies') !== (actual === 'rgb(0, 0, 255)');
        for (const shape of f.shapes) record(shape, result.effect === 'unknown', mismatch);
        if (result.effect === 'unknown') unknown++;
        else {
            if (result.effect === 'applies') applies++;
            else loses++;
            if ((result.effect === 'applies') !== (actual === 'rgb(0, 0, 255)')) {
                mismatches++;
                if (mismatches <= 5)
                    console.error(JSON.stringify({ seed, index, ...f, css, result, actual }));
            }
        }
    }
    const ownershipPage = await browser.newPage();
    let renameMismatches = 0;
    const aliasShapes: AliasShape[] = [
        'direct-link',
        'tsconfig-path',
        'directory-index',
        'package-entry',
    ];
    const renameCases = Math.max(4, Math.ceil(count / 100));
    for (let i = 0; i < renameCases; i++) {
        const shape = aliasShapes[i % aliasShapes.length]!;
        let failed = false;
        try {
            await checkRename(ownershipPage, shape, pick([1, 2, 3, 5, 8, 13, 21, 34]) + i * 100);
        } catch (e) {
            failed = true;
            renameMismatches++;
            if (renameMismatches <= 4) console.error(shape, e);
        }
        record(shape, false, failed);
        record('browser-relative-import-with-alias', false, failed);
    }
    if (count >= 2000) {
        for (const shape of [
            'conditional-layer',
            'forgiving-list',
            'aria-current-target',
            'webflow-current-target',
            'aria-current-page-selector',
            'aria-current-presence-selector',
            ...aliasShapes,
        ]) {
            assert.ok(coverage[shape], 'Missing differential coverage for ' + shape);
        }
    }
    console.log(
        JSON.stringify({
            chrome: browser.version(),
            seed,
            count,
            applies,
            loses,
            unknown,
            unknownRate: unknown / count,
            mismatches,
            renameCases,
            renameMismatches,
            coverage,
        }),
    );
    if (mismatches || renameMismatches || !applies || !loses) process.exitCode = 1;
} finally {
    await browser.close();
}
