import { describe, expect, it } from 'bun:test';

import { parseErrorLocation, pathMatches } from './parse';

const make = (content: string) => ({
    branchId: 'b',
    branchName: 'main',
    sourceId: 'src',
    type: 'terminal' as const,
    content,
});

describe('parseErrorLocation', () => {
    it('parses TS path(line,col) form', () => {
        const r = parseErrorLocation(make('src/foo.ts(12,5): error TS2322: Bad'));
        expect(r?.filePath).toBe('src/foo.ts');
        expect(r?.line).toBe(12);
        expect(r?.column).toBe(5);
    });

    it('parses path:line:col form with leading ./', () => {
        const r = parseErrorLocation(make('./src/bar.tsx:42:9\nType error: oops'));
        expect(r?.filePath).toBe('./src/bar.tsx');
        expect(r?.line).toBe(42);
        expect(r?.column).toBe(9);
    });

    it('parses path:line form (no column)', () => {
        const r = parseErrorLocation(make('src/baz.ts:7\nFailed'));
        expect(r?.filePath).toBe('src/baz.ts');
        expect(r?.line).toBe(7);
        expect(r?.column).toBeUndefined();
    });

    it('returns null when no location can be parsed', () => {
        expect(parseErrorLocation(make('npm ERR! ENOENT'))).toBeNull();
    });

    it('extracts a short, single-line message', () => {
        const r = parseErrorLocation(make('src/foo.ts(1,1): error: thing went wrong'));
        expect(r).not.toBeNull();
        expect(r!.message.length).toBeGreaterThan(0);
        expect(r!.message.length).toBeLessThanOrEqual(240);
    });

    it('parses Node.js stack-trace at (path:line:col) form', () => {
        const r = parseErrorLocation(
            make('Error: oops\n    at Object.render (/app/src/components/foo.tsx:42:7)\n    at Module._compile'),
        );
        expect(r?.filePath).toBe('/app/src/components/foo.tsx');
        expect(r?.line).toBe(42);
        expect(r?.column).toBe(7);
    });

    it('parses ESLint default reporter multi-line form', () => {
        const r = parseErrorLocation(
            make('/app/src/bar.ts\n  12:5  error  no-unused-vars'),
        );
        expect(r?.filePath).toBe('/app/src/bar.ts');
        expect(r?.line).toBe(12);
        expect(r?.column).toBe(5);
    });

    it('parses absolute path:line:col (Vite/esbuild style)', () => {
        const r = parseErrorLocation(make('/Users/dev/project/src/index.tsx:8:3: error: bad syntax'));
        expect(r?.filePath).toBe('/Users/dev/project/src/index.tsx');
        expect(r?.line).toBe(8);
        expect(r?.column).toBe(3);
    });
});

describe('pathMatches', () => {
    it('matches identical paths', () => expect(pathMatches('src/foo.ts', 'src/foo.ts')).toBe(true));
    it("strips './' prefix", () => expect(pathMatches('./src/foo.ts', 'src/foo.ts')).toBe(true));
    it('is case-insensitive', () => expect(pathMatches('SRC/Foo.TS', 'src/foo.ts')).toBe(true));
    it('matches by suffix', () =>
        expect(pathMatches('apps/web/client/src/foo.ts', 'src/foo.ts')).toBe(true));
    it('rejects unrelated paths', () =>
        expect(pathMatches('src/bar.ts', 'src/foo.ts')).toBe(false));
});
