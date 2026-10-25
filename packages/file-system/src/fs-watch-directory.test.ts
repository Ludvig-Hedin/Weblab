import { expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

it('cancels actual ZenFS directory watches across asynchronous setup and delivery', async () => {
    const directory = await mkdtemp(join(import.meta.dir, '.watch-directory-test-'));
    try {
        const build = await Bun.build({
            entrypoints: [join(import.meta.dir, 'fs-watch-directory.fixture.ts')],
            outdir: directory,
            target: 'node',
            packages: 'external',
        });
        if (!build.success) throw new Error(build.logs.map(String).join('\n'));
        const child = Bun.spawn(['node', '--test', join(directory, 'fs-watch-directory.fixture.js')], {
            stdout: 'pipe', stderr: 'pipe',
        });
        const [code, stdout, stderr] = await Promise.all([
            child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
        ]);
        expect({ code, output: code === 0 ? '' : stdout + stderr }).toEqual({ code: 0, output: '' });
    } finally { await rm(directory, { recursive: true, force: true }); }
}, 30_000);
