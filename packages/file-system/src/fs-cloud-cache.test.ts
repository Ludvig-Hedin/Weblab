import { expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

it('runs the real ZenFS cloud cache lifecycle in an isolated Node process', async () => {
    // Keep package resolution inside the workspace; always remove this exact temp directory.
    const directory = await mkdtemp(join(import.meta.dir, '.cloud-cache-test-'));
    try {
        const build = await Bun.build({
            entrypoints: [join(import.meta.dir, 'fs-cloud-cache.fixture.ts')],
            outdir: directory,
            target: 'node',
            packages: 'external',
        });
        expect(build.success).toBe(true);
        const child = Bun.spawn(['node', '--test', join(directory, 'fs-cloud-cache.fixture.js')], {
            stdout: 'pipe', stderr: 'pipe',
        });
        const [code, stdout, stderr] = await Promise.all([
            child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
        ]);
        expect({ code, output: code === 0 ? '' : stdout + stderr }).toEqual({ code: 0, output: '' });
    } finally { await rm(directory, { recursive: true, force: true }); }
}, 30_000);
