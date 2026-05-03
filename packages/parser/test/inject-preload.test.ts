import { describe, expect, test } from 'bun:test';
import { injectPreloadScriptIntoHtml } from 'src/pipelines/html/inject-preload';

const SCRIPT_SRC = '/weblab-preload-script.js';

describe('injectPreloadScriptIntoHtml', () => {
    test('injects a script tag into the head', () => {
        const out = injectPreloadScriptIntoHtml(
            '<!doctype html><html><head><title>X</title></head><body></body></html>',
            SCRIPT_SRC,
        );
        expect(out).toContain('<script');
        expect(out).toContain('src="/weblab-preload-script.js"');
        // Must appear inside <head>.
        const headIdx = out.indexOf('<head>');
        const scriptIdx = out.indexOf('<script');
        const headEndIdx = out.indexOf('</head>');
        expect(scriptIdx).toBeGreaterThan(headIdx);
        expect(scriptIdx).toBeLessThan(headEndIdx);
    });

    test('is idempotent — second call returns identical output', () => {
        const first = injectPreloadScriptIntoHtml(
            '<!doctype html><html><head></head><body><h1>x</h1></body></html>',
            SCRIPT_SRC,
        );
        const second = injectPreloadScriptIntoHtml(first, SCRIPT_SRC);
        expect(second).toBe(first);
        // Only one <script> tag total.
        expect(first.match(/<script/g)?.length).toBe(1);
    });

    test('handles documents missing an explicit <head> (parse5 synthesizes one)', () => {
        const out = injectPreloadScriptIntoHtml(
            '<!doctype html><html><body><h1>x</h1></body></html>',
            SCRIPT_SRC,
        );
        expect(out).toContain('src="/weblab-preload-script.js"');
    });

    test('preserves existing scripts in the head', () => {
        const out = injectPreloadScriptIntoHtml(
            '<!doctype html><html><head><script src="/app.js"></script></head><body></body></html>',
            SCRIPT_SRC,
        );
        expect(out).toContain('src="/app.js"');
        expect(out).toContain('src="/weblab-preload-script.js"');
    });
});
