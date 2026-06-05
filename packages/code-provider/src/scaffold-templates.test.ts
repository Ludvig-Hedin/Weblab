import { describe, expect, test } from 'bun:test';

import { getStaticHtmlScaffoldFiles, STATIC_HTML_SCAFFOLD_PORT } from './scaffold-templates';

describe('scaffold templates', () => {
    test('static-html scaffold is a coherent, bootable file set', () => {
        const files = getStaticHtmlScaffoldFiles();
        const byPath = new Map(files.map((f) => [f.path, f.content]));

        // Required files for a `serve` static-HTML project + the weblab runtime.
        for (const p of [
            'package.json',
            'index.html',
            'styles.css',
            'public/_weblab/interactions.json',
            'public/_weblab/interactions-initial.css',
        ]) {
            expect(byPath.has(p)).toBe(true);
        }

        const pkg = JSON.parse(byPath.get('package.json')!) as {
            scripts: { dev: string };
            dependencies: Record<string, string>;
        };
        // Dev script must bind the port the frame URL is built from.
        expect(pkg.scripts.dev).toContain(String(STATIC_HTML_SCAFFOLD_PORT));
        expect(pkg.dependencies.serve).toBeDefined();

        // interactions.json must be valid JSON so the IX runtime gets a 200.
        expect(() => {
            JSON.parse(byPath.get('public/_weblab/interactions.json')!);
        }).not.toThrow();

        // index.html needs an editable root for the canvas.
        expect(byPath.get('index.html')).toContain('<main></main>');
    });
});
