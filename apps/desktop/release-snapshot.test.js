import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrivateReleaseSnapshot, createPrivateWorkingCopy, grantLocalRoot,
    planPrivateHandoff, planPrivateRelease, validatePrivateReleaseSnapshot, recordPrivateWrite, writeIfUnchanged } from './weblab-local.js';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const original = 'export default function Page() { return <div>Original</div>; }\n';
const edited = 'export default function Page() { return <div data-weblab-id="editor">Edited</div>; }\n';
const clean = 'export default function Page() { return <div>Edited</div>; }\n';

async function fixture(run) {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'weblab-release-snapshot-')));
    const source = join(dir, 'source'); const base = join(dir, 'copies'); const template = join(dir, 'empty-template');
    try {
        await mkdir(join(source, 'app'), { recursive: true });
        await mkdir(join(source, 'public')); await mkdir(template);
        await writeFile(join(source, 'app/page.tsx'), original);
        await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'fixture', private: true,
            dependencies: { next: '15.0.0', tailwindcss: '4.0.0' } }));
        await writeFile(join(source, 'bun.lock'), 'fixture-lock');
        await writeFile(join(source, '.gitignore'), '.env.local\nprivate-data.txt\n');
        await writeFile(join(source, '.env.local'), 'FIXTURE_SECRET=excluded\n');
        await writeFile(join(source, 'private-data.txt'), 'ignored fixture data');
        await writeFile(join(source, 'secrets.production.json'), '{"token":"fixture-only"}');
        await writeFile(join(source, '.git-credentials'), 'fixture-only');
        await mkdir(join(source, '.next/server/app'), { recursive: true });
        await writeFile(join(source, '.next/server/app/page.js'), 'compiled fixture secret');
        await writeFile(join(source, 'public/logo.png'), Buffer.from([0, 255, 137, 10]));
        const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null',
            '-c', 'core.fsmonitor=false', '-c', 'commit.gpgsign=false', ...args], { cwd: source, stdio: 'pipe' });
        git('init', '-q', '--template=' + template); git('add', '.');
        git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
        await grantLocalRoot(source);
        const copy = await createPrivateWorkingCopy(source, base);
        const root = copy.rootPath;
        await run({ root, base, source, copy });
    } finally { await rm(dir, { recursive: true, force: true }); }
}

async function reviewedEdit(root, base) {
    expect((await writeIfUnchanged(root, 'app/page.tsx', edited, hash(original))).success).toBe(true);
    await recordPrivateWrite(root, 'app/page.tsx', hash(edited), base);
    return planPrivateHandoff(root, base);
}

describe('native release bytes', () => {
    test('explicit release review supports an unchanged project and detects later drift', async () => {
        await fixture(async ({ root, base }) => {
            expect((await planPrivateHandoff(root, base)).planToken).toBeNull();
            const plan = await planPrivateRelease(root, base);
            expect(plan.planToken).toMatch(/^[a-f0-9]{64}$/);
            const frozen = await createPrivateReleaseSnapshot(root, plan.planToken, [], base);
            expect(frozen.files.find((file) => file.path === 'app/page.tsx').bytes.toString()).toBe(original);
            await expect(validatePrivateReleaseSnapshot(root, frozen.copyId, plan.planToken, base)).resolves.toBe(true);
            await writeFile(join(root, 'app/page.tsx'), 'changed outside Weblab');
            await expect(validatePrivateReleaseSnapshot(root, frozen.copyId, plan.planToken, base)).rejects.toThrow('changed');
        });
    }, 30_000);
    test('uses cleaned text and original binary assets, excludes secrets/ignored files and consumes review once', async () => {
        await fixture(async ({ root, base, source }) => {
            const plan = await reviewedEdit(root, base);
            const snapshot = await createPrivateReleaseSnapshot(root, plan.planToken,
                [{ path: 'app/page.tsx', updated: clean }], base);
            const page = snapshot.files.find((file) => file.path === 'app/page.tsx');
            expect(page.bytes.toString()).toBe(clean); expect(page.sha256).toBe(hash(clean));
            expect(snapshot.files.find((file) => file.path === 'public/logo.png').bytes)
                .toEqual(Buffer.from([0, 255, 137, 10]));
            expect(snapshot.files.some((file) => ['.env.local', 'private-data.txt'].includes(file.path))).toBe(false);
            expect(snapshot).not.toHaveProperty('sourceRootPath');
            expect(await readFile(join(source, 'app/page.tsx'), 'utf8')).toBe(original);
            await expect(createPrivateReleaseSnapshot(root, plan.planToken,
                [{ path: 'app/page.tsx', updated: clean }], base)).rejects.toThrow('review');
        });
    }, 30_000);
    test('missing cleaned edits fail without consuming the review', async () => {
        await fixture(async ({ root, base }) => {
            const plan = await reviewedEdit(root, base);
            await expect(createPrivateReleaseSnapshot(root, plan.planToken, [], base)).rejects.toThrow('cleaned');
            await expect(createPrivateReleaseSnapshot(root, plan.planToken, undefined, base)).rejects.toThrow('cleaned');
            expect((await createPrivateReleaseSnapshot(root, plan.planToken,
                [{ path: 'app/page.tsx', updated: clean }], base)).files.length).toBeGreaterThan(0);
        });
    }, 30_000);
    test('external private edits or changed originals invalidate a reviewed release', async () => {
        await fixture(async ({ root, base, source }) => {
            const plan = await reviewedEdit(root, base);
            await writeFile(join(root, 'public/logo.png'), Buffer.from([1, 2, 3]));
            await expect(createPrivateReleaseSnapshot(root, plan.planToken,
                [{ path: 'app/page.tsx', updated: clean }], base)).rejects.toThrow('changed');
            await writeFile(join(root, 'public/logo.png'), Buffer.from([0, 255, 137, 10]));
            await writeFile(join(source, 'app/page.tsx'), 'changed elsewhere');
            await expect(createPrivateReleaseSnapshot(root, plan.planToken,
                [{ path: 'app/page.tsx', updated: clean }], base)).rejects.toThrow('changed');
        });
    }, 30_000);
    test('zero-change initial deployment needs a separate explicit review contract', async () => {
        await fixture(async ({ root, base }) => {
            const plan = await planPrivateHandoff(root, base);
            expect(plan.planToken).toBeNull();
            await expect(createPrivateReleaseSnapshot(root, plan.planToken, [], base)).rejects.toThrow('Review');
        });
    }, 30_000);
});


test('new copies omit original credentials and compiled output, and original secret drift is harmless', async () => {
    await fixture(async ({ root, base, source, copy }) => {
        for (const file of ['.env.local', 'secrets.production.json', '.git-credentials', '.next/server/app/page.js']) {
            await expect(stat(join(root, file))).rejects.toMatchObject({ code: 'ENOENT' });
        }
        const manifest = JSON.parse(await readFile(join(base, copy.copyId, 'baseline.json'), 'utf8'));
        expect(manifest.snapshot.some((file) => file.path.includes('.env') || file.path.startsWith('.next/') || file.path === '.git-credentials')).toBe(false);
        expect(copy.previewNeedsInstall).toBe(false);
        await writeFile(join(source, '.env.local'), 'FIXTURE_SECRET=changed');
        const plan = await planPrivateRelease(root, base);
        expect(plan.sourceChanged).toBe(false);
        await expect(createPrivateReleaseSnapshot(root, plan.planToken, [], base)).resolves.toHaveProperty('files');
        await writeFile(join(root, 'credentials.production.json'), '{}');
        await expect(planPrivateRelease(root, base)).rejects.toThrow('credential');
    });
}, 30_000);

test('instrumentation-only review freezes the clean original without requiring a code change', async () => {
    await fixture(async ({ root, base }) => {
        const instrumented = original.replace('<div>', '<div data-weblab-id="fixture">');
        expect((await writeIfUnchanged(root, 'app/page.tsx', instrumented, hash(original))).success).toBe(true);
        await recordPrivateWrite(root, 'app/page.tsx', hash(instrumented), base);
        const plan = await planPrivateRelease(root, base);
        const frozen = await createPrivateReleaseSnapshot(root, plan.planToken, [{ path: 'app/page.tsx', updated: original }], base);
        expect(frozen.files.find((file) => file.path === 'app/page.tsx').bytes.toString()).toBe(original);
    });
}, 30_000);
