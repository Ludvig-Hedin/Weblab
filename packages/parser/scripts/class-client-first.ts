// Replay the twenty edits from the Client-First review against the exported style guide.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

import type { CascadeSheet, ClassTarget } from '../src/classes';
import { applyPatch, editDeclaration, prepareElementContext } from '../src/classes';
import { installElementContext } from './class-element-preview';

const button = 'a.button:not([class*="is-"])';
const cases: [string, string, string, ('hover' | undefined)?, number?, string?][] = [
    ['.padding-global', 'padding-left', '3rem'],
    ['.padding-section-large', 'padding-top', '6rem'],
    ['.button', 'padding', '0.875rem 1.75rem', undefined, undefined, button],
    ['.button.is-small', 'padding', '0.625rem 1.125rem'],
    ['.text-color-primary', 'color', '#394456'],
    ['.text-color-secondary', 'color', '#4b576d'],
    ['.text-style-link', 'color', '#174fb9'],
    ['.button.is-secondary', 'color', '#1b2740'],
    ['.heading-style-h1', 'font-size', '3.25rem'],
    ['.heading-style-h2', 'font-size', '2.5rem'],
    ['.text-size-medium', 'font-size', '1.1875rem'],
    ['.text-size-small', 'font-size', '0.9375rem'],
    ['.button', 'color', '#f0eeff', 'hover', undefined, button],
    ['.button.is-secondary', 'color', '#3d1b80', 'hover'],
    ['.button.is-text', 'color', '#3267d3', 'hover'],
    ['.text-style-link', 'color', '#3164c1', 'hover'],
    ['.padding-global', 'padding-left', '1.75rem', undefined, 991],
    ['.heading-style-h1', 'font-size', '2.75rem', undefined, 991],
    ['.button.is-small', 'padding', '0.5rem 1rem', undefined, 991],
    ['.text-size-medium', 'font-size', '1.0625rem', undefined, 991],
];
const dir = new URL('../../../coding-agent-context/client-first-template/', import.meta.url);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage();
    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (
            url.origin !== 'https://fixture.test' ||
            !['document', 'stylesheet'].includes(route.request().resourceType())
        )
            return route.abort();
        const file = Bun.file(new URL('.' + url.pathname, dir));
        await route.fulfill({ body: await file.text(), contentType: file.type });
    });
    await page.goto('https://fixture.test/style-guide.html');
    await installElementContext(page);
    const sources = await page.evaluate(() =>
        [...document.styleSheets].map((s, i) => ({
            path: s.href ? new URL(s.href).pathname.slice(1) : 'style-guide.html#style-' + i,
            inline: s.href ? null : s.ownerNode!.textContent,
        })),
    );
    const paths = sources.map((s) => s.path);
    const css = await Promise.all(
        sources.map(async (s) => s.inline ?? Bun.file(new URL(s.path, dir)).text()),
    );
    const edited = paths.findIndex((p) => p.endsWith('.webflow.css'));
    assert.ok(edited >= 0);
    const authored = css[edited]!;
    const sheets: CascadeSheet[] = paths.map((path, i) =>
        i === edited ? { path, edited: true } : { path, source: css[i]! },
    );
    const plan = prepareElementContext(css);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    type Effect = ReturnType<typeof editDeclaration>['effect'];
    const rows: {
        selector: string;
        property: string;
        state?: string;
        width?: number;
        single: Effect;
        singleContext: Effect;
        without: Effect;
        withContext: Effect;
        reason?: string;
    }[] = [];
    for (const [selector, property, value, state, width, subject = selector] of cases) {
        await page.setViewportSize({ width: width ?? 1440, height: 900 });
        const context = await page.evaluate(
            ({ plan, subject }) => {
                const el = document.querySelector(subject)!;
                return window.classElementContext(plan, (s) => el.matches(s), innerWidth);
            },
            { plan, subject },
        );
        const target: ClassTarget = {
            selector,
            width,
            state,
            direction: 'max',
            currentConvention: 'webflow',
            viewportWidth: width ?? 1440,
        };
        const single = editDeclaration(authored, target, property, value);
        const singleContext = editDeclaration(
            authored,
            { ...target, elementContext: context },
            property,
            value,
        );
        const without = editDeclaration(
            authored,
            { ...target, stylesheets: sheets },
            property,
            value,
        );
        const withContext = editDeclaration(
            authored,
            { ...target, stylesheets: sheets, elementContext: context },
            property,
            value,
        );
        const { nodeId } = await cdp.send('DOM.querySelector', {
            nodeId: root.nodeId,
            selector: subject,
        });
        await cdp.send('CSS.forcePseudoState', {
            nodeId,
            forcedPseudoClasses: state ? [state] : [],
        });
        const actual = await page.evaluate(
            ({ subject, property, value, edited, source }) => {
                const el = document.querySelector<HTMLElement>(subject)!;
                const link = document.styleSheets[edited]!.ownerNode as HTMLLinkElement;
                const replacement = document.createElement('style');
                replacement.textContent = source;
                link.after(replacement);
                link.disabled = true;
                const old = el.style.cssText;
                el.style.setProperty('transition', 'none', 'important');
                try {
                    const actual = getComputedStyle(el).getPropertyValue(property);
                    el.style.setProperty(property, value, 'important');
                    return actual === getComputedStyle(el).getPropertyValue(property);
                } finally {
                    el.style.cssText = old;
                    link.disabled = false;
                    replacement.remove();
                }
            },
            { subject, property, value, edited, source: applyPatch(authored, withContext.patch) },
        );
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
        if (withContext.effect !== 'unknown')
            assert.equal(
                withContext.effect === 'applies',
                actual,
                JSON.stringify({ selector, property, state, width, withContext }),
            );
        rows.push({
            selector,
            property,
            state,
            width,
            single: single.effect,
            singleContext: singleContext.effect,
            without: without.effect,
            withContext: withContext.effect,
            reason: withContext.effect === 'unknown' ? withContext.reason : undefined,
        });
    }
    const unknown = Object.fromEntries(
        (['single', 'singleContext', 'without', 'withContext'] as const).map((k) => [
            k,
            rows.filter((r) => r[k] === 'unknown').length,
        ]),
    );
    console.log(JSON.stringify({ paths, cases: rows.length, unknown, rows }));
    assert.ok(unknown.withContext! / rows.length < 0.05);
} finally {
    await browser.close();
}
