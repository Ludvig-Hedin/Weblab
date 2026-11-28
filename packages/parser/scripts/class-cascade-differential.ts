// Opt-in: bun run test:class-cascade [cases] [seed]
import { chromium } from 'playwright';

import type { ClassState, ClassTarget } from '../src/classes/stylesheet';
import { applyPatch, editDeclaration } from '../src/classes/stylesheet';

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
function fixture() {
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
        currentConvention: 'webflow',
    };
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
            ':where(:hover,.w--current)',
            ':not(.other)',
            ':is(.extra,:focus-visible)',
            ':is(svg|*:hover)',
        ]);
        const priority = pick(['', '!important', String.raw`!\69mportant`]);
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
        rules.unshift(pick(['@import', String.raw`@i\6dport`]) + ' "' + href + '";');
    }
    return {
        target,
        css: rules.join('\n'),
        imported,
        wrapped,
        classes: [
            'a',
            combo || selector === '.a.extra' ? 'extra' : '',
            state === 'current' ? 'w--current' : '',
        ].join(' '),
    };
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
        const f = fixture();
        const queries = new Set<string>();
        const edit = (matchesSelector: ClassTarget['matchesSelector']) =>
            editDeclaration(f.css, { ...f.target, matchesSelector }, 'color', 'blue');
        edit((s) => {
            queries.add(s);
            return undefined;
        });
        const evidence = await page.evaluate(
            ({ wrapped, classes, selectors }) => {
                const el = document.querySelector('button')!;
                el.className = classes;
                el.parentElement!.className = wrapped ? 'wrap' : '';
                el.parentElement!.id = wrapped ? 'outer' : '';
                return Object.fromEntries(selectors.map((s) => [s, el.matches(s)]));
            },
            { wrapped: f.wrapped, classes: f.classes, selectors: [...queries] },
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
        }),
    );
    if (mismatches || !applies || !loses) process.exitCode = 1;
} finally {
    await browser.close();
}
