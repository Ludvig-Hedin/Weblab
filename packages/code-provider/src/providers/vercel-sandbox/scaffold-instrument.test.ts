import { describe, expect, test } from 'bun:test';

import {
    instrumentScaffoldJsx,
    NEXT_SCAFFOLD_LAYOUT_SRC,
    NEXT_SCAFFOLD_PAGE_SRC,
} from './scaffold-instrument';

// Root-cause regression for "Cannot delete element — Remove action not found".
// The Vercel scaffolder writes JSX straight to the sandbox, bypassing the
// editor's CodeFileSystem (the only other path that stamps `data-oid`). Without
// an oid in the served DOM, the preload's getRemoveAction returns null and the
// element can't be deleted. These tests lock in that the scaffold now ships
// pre-instrumented.
describe('scaffold JSX instrumentation', () => {
    test('raw scaffold sources have no data-oid (the gap being closed)', () => {
        expect(NEXT_SCAFFOLD_PAGE_SRC).not.toContain('data-oid');
        expect(NEXT_SCAFFOLD_LAYOUT_SRC).not.toContain('data-oid');
    });

    test('instrumented page stamps data-oid on <main> so it is deletable', async () => {
        const out = await instrumentScaffoldJsx(NEXT_SCAFFOLD_PAGE_SRC);
        expect(/<main[^>]*\bdata-oid="[^"]+"/.test(out)).toBe(true);
    });

    test('instrumented layout stamps data-oid on body and preserves the import', async () => {
        const out = await instrumentScaffoldJsx(NEXT_SCAFFOLD_LAYOUT_SRC);
        expect(/<body[^>]*\bdata-oid="[^"]+"/.test(out)).toBe(true);
        expect(out).toContain("import './globals.css'");
        // children expression must survive instrumentation
        expect(out).toContain('{children}');
    });

    test('is idempotent — re-instrumenting preserves the existing oid (safe for boot re-sync)', async () => {
        const once = await instrumentScaffoldJsx(NEXT_SCAFFOLD_PAGE_SRC);
        const twice = await instrumentScaffoldJsx(once);
        const oid1 = /data-oid="([^"]+)"/.exec(once)?.[1];
        const oid2 = /data-oid="([^"]+)"/.exec(twice)?.[1];
        expect(oid1).toBeTruthy();
        expect(oid2).toBe(oid1);
    });

    test('falls back to the raw source when parsing fails (never blocks scaffolding)', async () => {
        const broken = 'export default function Page( {{{ <main';
        expect(await instrumentScaffoldJsx(broken)).toBe(broken);
    });
});
