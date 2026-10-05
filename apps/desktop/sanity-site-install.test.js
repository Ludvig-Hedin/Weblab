import { describe, expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assertRetainedSanitySiteReady, beginPrivateWriteIntent, createPrivateReleaseSnapshot,
    createPrivateWorkingCopy, grantLocalRoot, installRetainedSanitySite, planPrivateHandoff,
    planPrivateRelease, resumeRetainedSanitySiteInstall, startDevServer,
    validatePrivateReleaseSnapshot, readVerifiedSanitySiteSource, withCliTurn, writeIfUnchanged, reconcilePrivateWriteIntent, inspectRetainedSanitySiteInstall, journalCliEdits } from './weblab-local.js';
import { PROFILE, captureSite, getRetainedSiteArtifact, discardRetainedSiteArtifact } from './release/sanity-site/index.js';
import { ASSETS_QUERY, COUNT_QUERY, DOCUMENTS_QUERY, MEMBERS_QUERY } from './release/sanity-site/capture.js';
import { originalUrl } from './release/sanity-site/assets.js';
import { postProjection } from './release/sanity-site/contract.js';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255]);
const coordinates = { projectId: 'l45nowfu', dataset: 'production', apiVersion: '2024-10-01' };

async function capture(root, sourceFiles, { title = 'Fixture', image = false, predecessor, imageBytes = png, imageId = 'image-abcdef-1x1-png' } = {}) {
    const ref = imageId;
    const docs = [{ _id: 'post', _type: 'blogPost', _rev: 'rev1', title,
        slug: { current: 'fixture' }, publishedAt: '2026-10-02T12:00:00Z', content: [],
        ...(image ? { heroImage: { _type: 'image', asset: { _type: 'reference', _ref: ref } } } : {}) }];
    const projections = Object.fromEntries(Object.keys(PROFILE.queries).map((name) => [name, []]));
    projections.SITE_SETTINGS_QUERY = null;
    projections.EKOSTAMBYTE_QUERY = null;
    projections.HOME_QUERY = { settings: null, services: [], reviews: [], posts: docs.map((doc) => postProjection(doc, 'home')), eko: null };
    projections.POSTS_QUERY = docs.map((doc) => postProjection(doc, 'list'));
    projections.POST_SLUGS_QUERY = [{ slug: 'fixture' }];
    return captureSite({ sourceFiles, selectedDrafts: [], coordinates,
        scope: { userId: 'fixture-user', projectId: 'fixture-project', branchId: 'fixture-branch', rootPath: root },
        ...(predecessor ? { predecessor } : {}) }, {
        now: () => '2026-10-02T12:00:00Z',
        getJson: async ({ url, method }) => {
            expect(method).toBe('GET');
            const query = url.searchParams.get('query');
            if (query === COUNT_QUERY) return { result: docs.length };
            if (query === DOCUMENTS_QUERY || query === MEMBERS_QUERY) {
                const after = JSON.parse(url.searchParams.get('$after'));
                const page = docs.filter((doc) => doc._id > after);
                return { result: query === DOCUMENTS_QUERY ? page : page.map(({ _id, _type, _rev }) => ({ _id, _type, _rev })) };
            }
            if (query === ASSETS_QUERY) return { result: image ? [{ _id: ref, _type: 'sanity.imageAsset', _rev: 'asset1',
                url: originalUrl(ref, coordinates), mimeType: 'image/png', metadata: { dimensions: { width: 1, height: 1 } } }] : [] };
            const name = Object.keys(PROFILE.queries).find((key) => PROFILE.queries[key] === query);
            if (name === 'POST_BY_SLUG_QUERY') return { result: postProjection(docs[0], 'detail') };
            if (!name) throw new Error('Unexpected fixture query');
            return { result: projections[name] };
        },
        getBytes: async ({ method }) => { expect(method).toBe('GET'); return { bytes: imageBytes, mimeType: 'image/png' }; },
        imageSdk: { version: '2.1.1', buildUrl: (source, chain, coords) => {
            const url = new URL(originalUrl(source.asset._ref, coords));
            const names = { width: 'w', height: 'h', fit: 'fit', auto: 'auto' };
            for (const [key, value] of chain) url.searchParams.set(names[key], String(value));
            return url.href;
        } },
    });
}

async function fixture(run, options = {}) {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'weblab-sanity-install-')));
    let handle;
    const source = join(dir, 'source'); const base = join(dir, 'copies'); const template = join(dir, 'template');
    try {
        await mkdir(source); await mkdir(template);
        const sourceFiles = Object.entries({ ...PROFILE.approvedSources, ...(options.extraSources ?? {}) }).map(([path, text]) => ({ path, bytes: Buffer.from(text) }));
        for (const file of sourceFiles) {
            await mkdir(dirname(join(source, file.path)), { recursive: true });
            await writeFile(join(source, file.path), file.bytes);
        }
        const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
            '-c', 'commit.gpgsign=false', ...args], { cwd: source, stdio: 'pipe' });
        git('init', '-q', '--template=' + template); git('add', '.');
        git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
        const originalGit = git('status', '--porcelain=v1');
        await grantLocalRoot(source);
        const copy = await createPrivateWorkingCopy(source, base); const root = copy.rootPath;
        handle = await capture(root, sourceFiles, options); const artifact = getRetainedSiteArtifact(handle);
        await run({ source, base, root, copy, handle, artifact, sourceFiles, container: dirname(root) });
        for (const file of sourceFiles) expect(await readFile(join(source, file.path))).toEqual(file.bytes);
        expect(git('status', '--porcelain=v1')).toEqual(originalGit);
    } finally { if (handle) discardRetainedSiteArtifact(handle); await rm(dir, { recursive: true, force: true }); }
}

async function interruptedFixture(context, desired) {
    const { root, base, handle, artifact, container } = context;
    await installRetainedSanitySite(root, handle, base);
    const record = JSON.parse(await readFile(join(container, 'cms-install.json'), 'utf8'));
    const target = artifact.files.find((file) => file.phase === 'disable' && file.beforeSha256 !== null);
    if (!desired) await writeFile(join(root, target.path), Buffer.from(record.beforeBytes[target.path], 'base64'));
    record.status = 'pending'; record.completed = [];
    await writeFile(join(container, 'cms-install.json'), JSON.stringify(record), { mode: 0o600 });
    const journal = JSON.parse(await readFile(join(container, 'write-journal.json'), 'utf8'));
    journal.writes = journal.writes.filter((entry) => entry.path !== target.path);
    journal.intent = { path: target.path, beforeSha256: target.beforeSha256, desiredSha256: target.sha256 };
    await writeFile(join(container, 'write-journal.json'), JSON.stringify(journal), { mode: 0o600 });
    discardRetainedSiteArtifact(handle);
    expect(() => getRetainedSiteArtifact(handle)).toThrow('unavailable');
    return { target, record };
}

describe('native retained website installation', () => {
    for (const desired of [false, true]) test(`durable recovery accepts exact ${desired ? 'desired' : 'before'} bytes and reconciles the retained intent`, async () => {
        await fixture(async (context) => {
            await interruptedFixture(context, desired);
            await expect(assertRetainedSanitySiteReady(context.root, context.base)).rejects.toThrow('recovery');
            await expect(resumeRetainedSanitySiteInstall(context.root, context.base)).resolves.toHaveProperty('status', 'complete');
            for (const file of context.artifact.files) expect(hash(await readFile(join(context.root, file.path)))).toBe(file.sha256);
            expect((await assertRetainedSanitySiteReady(context.root, context.base)).install.completed.length).toBe(context.artifact.files.length);
        });
    }, 30_000);

    test('third values pause the whole install and retain original bytes and assets', async () => {
        await fixture(async (context) => {
            const { target, record } = await interruptedFixture(context, true);
            await writeFile(join(context.root, target.path), 'User recovery bytes');
            await expect(resumeRetainedSanitySiteInstall(context.root, context.base)).rejects.toThrow();
            expect(await readFile(join(context.root, target.path), 'utf8')).toBe('User recovery bytes');
            const paused = JSON.parse(await readFile(join(context.container, 'cms-install.json'), 'utf8'));
            expect(paused.status).toBe('conflicted'); expect(paused.beforeBytes).toEqual(record.beforeBytes);
            for (const file of context.artifact.files.filter((entry) => entry.kind === 'asset')) {
                expect(await readFile(join(context.root, file.path))).toEqual(file.bytes);
            }
            await expect(planPrivateRelease(context.root, context.base)).rejects.toThrow('recovery');
        }, { image: true });
    }, 30_000);

    test('pending durable setup blocks preview and unrelated source writes', async () => {
        await fixture(async (context) => {
            const { target } = await interruptedFixture(context, false);
            expect((await startDevServer(context.root, null, 39999, () => null)).error).toContain('recovery');
            await expect(beginPrivateWriteIntent(context.root, target.path, target.beforeSha256, target.sha256, context.base)).rejects.toThrow('recovery');
        });
    }, 30_000);

    test('a pending install published between the CLI precheck and lease admission cannot launch an AI turn', async () => {
        await fixture(async ({ root, base, handle, container }) => {
            await installRetainedSanitySite(root, handle, base);
            const record = JSON.parse(await readFile(join(container, 'cms-install.json'), 'utf8'));
            const fsPromises = require('node:fs/promises');
            const link = fsPromises.link.bind(fsPromises);
            let raced = false;
            let ran = false;
            const leaseRace = spyOn(fsPromises, 'link').mockImplementation(async (source, destination) => {
                await link(source, destination);
                if (destination === join(container, 'write-journal.lock') && !raced) {
                    raced = true;
                    await writeFile(join(container, 'cms-install.json'), JSON.stringify({ ...record, status: 'pending' }), { mode: 0o600 });
                }
            });
            try {
                await expect(withCliTurn(root, async () => { ran = true; }, base)).rejects.toThrow('recovery');
                expect(raced).toBe(true); expect(ran).toBe(false);
                await expect(readFile(join(container, 'cli-cleanup.json'))).rejects.toMatchObject({ code: 'ENOENT' });
                await expect(readFile(join(container, 'write-journal.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
            } finally { leaseRace.mockRestore(); }
        });
    }, 30_000);

    test('source drift and arbitrary artifact inputs cannot begin a pending installation', async () => {
        await fixture(async ({ root, base, handle, artifact, container }) => {
            await expect(installRetainedSanitySite(root, artifact, base)).rejects.toThrow();
            const untouched = Object.keys(artifact.sourceHashes).find((path) => !artifact.files.some((file) => file.path === path));
            await writeFile(join(root, untouched), 'Changed source');
            await expect(installRetainedSanitySite(root, handle, base)).rejects.toThrow('changed');
            await expect(readFile(join(container, 'cms-install.json'))).rejects.toMatchObject({ code: 'ENOENT' });
        });
    }, 30_000);

    test('a crash after original-baseline creation can retry with a different captured asset set', async () => {
        await fixture(async ({ root, base, handle, artifact, sourceFiles, container }) => {
            const fsPromises = require('node:fs/promises');
            const rename = fsPromises.rename.bind(fsPromises);
            const interruption = spyOn(fsPromises, 'rename').mockImplementation(async (source, destination) => {
                if (destination === join(container, 'cms-install.json')) throw new Error('Simulated interruption before active marker');
                return rename(source, destination);
            });
            try { await expect(installRetainedSanitySite(root, handle, base)).rejects.toThrow('Simulated interruption'); }
            finally { interruption.mockRestore(); }
            const baselineBytes = await readFile(join(container, 'cms-install-baseline.json'));
            const baseline = JSON.parse(baselineBytes);
            expect(baseline.version).toBe(2);
            expect(Object.values(baseline.originals).every((bytes) => bytes !== null)).toBe(true);
            await expect(readFile(join(container, 'cms-install.json'))).rejects.toMatchObject({ code: 'ENOENT' });
            for (const file of sourceFiles) expect(await readFile(join(root, file.path))).toEqual(file.bytes);
            const nextHandle = await capture(root, sourceFiles, { image: true, imageBytes: Buffer.from([...png, 42]), imageId: 'image-fedcba-1x1-png' });
            try {
                const next = getRetainedSiteArtifact(nextHandle);
                const oldAsset = artifact.files.find((file) => file.kind === 'asset');
                const newAsset = next.files.find((file) => file.kind === 'asset');
                expect(newAsset.path).not.toBe(oldAsset.path);
                await expect(installRetainedSanitySite(root, nextHandle, base)).resolves.toHaveProperty('status', 'complete');
                expect(await readFile(join(container, 'cms-install-baseline.json'))).toEqual(baselineBytes);
                await expect(readFile(join(root, oldAsset.path))).rejects.toMatchObject({ code: 'ENOENT' });
                expect(await readFile(join(root, newAsset.path))).toEqual(newAsset.bytes);
                expect((await assertRetainedSanitySiteReady(root, base)).artifact.manifestHash).toBe(next.manifestHash);
            } finally { discardRetainedSiteArtifact(nextHandle); }
        }, { image: true });
    }, 30_000);

    test('a second capture uses verified original source, pins its predecessor and keeps old assets outside the new release', async () => {
        await fixture(async ({ root, base, handle, artifact, sourceFiles, container }) => {
            await installRetainedSanitySite(root, handle, base);
            const firstReceipt = await readFile(join(container, 'cms-install.json'));
            const baseline = await readFile(join(container, 'cms-install-baseline.json'));
            const sourceView = await readVerifiedSanitySiteSource(root, base);
            expect(sourceView.sourceFiles).toEqual([...sourceFiles].sort((a, b) => a.path.localeCompare(b.path)));
            const nextHandle = await capture(root, sourceView.sourceFiles, { title: 'Second captured title', predecessor: sourceView.predecessor });
            try {
                const next = getRetainedSiteArtifact(nextHandle);
                const priorTargets = new Map(artifact.files.map((file) => [file.path, file.sha256]));
                for (const file of next.files) if (priorTargets.has(file.path)) expect(file.beforeSha256).toBe(priorTargets.get(file.path));
                await installRetainedSanitySite(root, nextHandle, base);
                expect(await readFile(join(container, `cms-install-${artifact.manifestHash}.json`))).toEqual(firstReceipt);
                expect(await readFile(join(container, 'cms-install-baseline.json'))).toEqual(baseline);
                const oldAsset = artifact.files.find((file) => file.kind === 'asset');
                expect(await readFile(join(root, oldAsset.path))).toEqual(oldAsset.bytes);
                const plan = await planPrivateRelease(root, base);
                expect(plan.unsupportedChanges).toEqual([]); expect(plan.binaryFiles).toEqual([]);
                const snapshot = await createPrivateReleaseSnapshot(root, plan.planToken,
                    plan.changedFiles.map((file) => ({ path: file.path, updated: file.updated })), base);
                expect(snapshot.files.some((file) => file.path === oldAsset.path)).toBe(false);
                expect(snapshot.files.some((file) => file.bytes.toString().includes('Second captured title'))).toBe(true);
                await expect(installRetainedSanitySite(root, handle, base)).rejects.toThrow('outdated');
                const currentReceipt = await readFile(join(container, 'cms-install.json'));
                expect((await assertRetainedSanitySiteReady(root, base)).artifact.manifestHash).toBe(next.manifestHash);
                expect(await readFile(join(container, 'cms-install.json'))).toEqual(currentReceipt);
            } finally { discardRetainedSiteArtifact(nextHandle); }
        }, { image: true });
    }, 30_000);

    test('orphan baseline reuse preserves original-present assets across a different capture asset set', async () => {
        const originalAssetPath = `public/weblab-frozen-sanity/${hash(png)}.png`;
        await fixture(async ({ root, base, handle, sourceFiles, container }) => {
            const fsPromises = require('node:fs/promises');
            const rename = fsPromises.rename.bind(fsPromises);
            const interruption = spyOn(fsPromises, 'rename').mockImplementation(async (source, destination) => {
                if (destination === join(container, 'cms-install.json')) throw new Error('Simulated original-present asset interruption');
                return rename(source, destination);
            });
            try { await expect(installRetainedSanitySite(root, handle, base)).rejects.toThrow('interruption'); }
            finally { interruption.mockRestore(); }
            const baselineBytes = await readFile(join(container, 'cms-install-baseline.json'));
            const baseline = JSON.parse(baselineBytes);
            expect(baseline.originals[originalAssetPath]).toBe(png.toString('base64'));
            expect(Object.values(baseline.originals).every((bytes) => bytes !== null)).toBe(true);
            expect(Object.keys(baseline.originals)).toEqual(Object.keys(baseline.originals).sort((a, b) => a.localeCompare(b)));
            const nextHandle = await capture(root, sourceFiles, { image: true, imageBytes: Buffer.from([...png, 42]), imageId: 'image-fedcba-1x1-png' });
            try {
                await expect(installRetainedSanitySite(root, nextHandle, base)).resolves.toHaveProperty('status', 'complete');
                expect(await readFile(join(container, 'cms-install-baseline.json'))).toEqual(baselineBytes);
                expect(await readFile(join(root, originalAssetPath))).toEqual(png);
                const view = await readVerifiedSanitySiteSource(root, base);
                expect(view.sourceFiles).toEqual([...sourceFiles].sort((a, b) => a.path.localeCompare(b.path)));
                expect((await inspectRetainedSanitySiteInstall(root, base)).status).toBe('complete');
            } finally { discardRetainedSiteArtifact(nextHandle); }
        }, { image: true, extraSources: { [originalAssetPath]: png } });
    }, 30_000);

    test('journaled ordinary source edits require a successor capture before preview and release reopen', async () => {
        const path = 'src/components/editable-heading.tsx';
        const before = 'export const heading = "Original heading";\n';
        const updated = 'export const heading = "Saved heading";\n';
        await fixture(async ({ root, base, handle, container }) => {
            await installRetainedSanitySite(root, handle, base);
            const baseline = await readFile(join(container, 'cms-install-baseline.json'));
            expect((await beginPrivateWriteIntent(root, path, hash(before), hash(updated), base)).success).toBe(true);
            expect((await writeIfUnchanged(root, path, updated, hash(before))).success).toBe(true);
            await reconcilePrivateWriteIntent(root, base);
            const receipt = await readFile(join(container, 'cms-install.json'));
            expect(await inspectRetainedSanitySiteInstall(root, base)).toMatchObject({ status: 'complete', needsPreparation: true });
            expect(await readFile(join(container, 'cms-install.json'))).toEqual(receipt);
            await expect(assertRetainedSanitySiteReady(root, base)).rejects.toThrow('changed');
            expect((await startDevServer(root, null, 39999, () => null)).error).toContain('changed');
            await expect(planPrivateRelease(root, base)).rejects.toThrow('changed');
            const view = await readVerifiedSanitySiteSource(root, base);
            expect(view.sourceFiles.find((file) => file.path === path).bytes.toString()).toBe(updated);
            const nextHandle = await capture(root, view.sourceFiles, { predecessor: view.predecessor });
            try {
                await expect(installRetainedSanitySite(root, nextHandle, base)).resolves.toHaveProperty('status', 'complete');
                expect((await assertRetainedSanitySiteReady(root, base)).artifact.sourceHashes[path]).toBe(hash(updated));
                expect(await inspectRetainedSanitySiteInstall(root, base)).not.toHaveProperty('needsPreparation');
                expect(await readFile(join(container, 'cms-install-baseline.json'))).toEqual(baseline);
                const plan = await planPrivateRelease(root, base);
                expect(plan.unsupportedChanges).toEqual([]);
                const snapshot = await createPrivateReleaseSnapshot(root, plan.planToken,
                    plan.changedFiles.map((file) => ({ path: file.path, updated: file.updated })), base);
                expect(snapshot.files.find((file) => file.path === path).bytes.toString()).toBe(updated);
            } finally { discardRetainedSiteArtifact(nextHandle); }
        }, { extraSources: { [path]: before } });
    }, 30_000);

    test('unrecorded ordinary edits and changed fixed adapters cannot use successor recapture admission', async () => {
        const path = 'src/components/editable-heading.tsx';
        const before = 'export const heading = "Original heading";\n';
        await fixture(async ({ root, base, handle, artifact }) => {
            await installRetainedSanitySite(root, handle, base);
            await writeFile(join(root, path), 'export const heading = "Unrecorded";\n');
            await expect(readVerifiedSanitySiteSource(root, base)).rejects.toThrow('exact saved edit');
            await expect(inspectRetainedSanitySiteInstall(root, base)).rejects.toThrow('exact saved edit');
            await writeFile(join(root, path), before);
            const adapter = artifact.files.find((file) => file.phase === 'adapter');
            const modified = 'export const replacement = true;\n';
            expect((await beginPrivateWriteIntent(root, adapter.path, adapter.sha256, hash(modified), base)).success).toBe(true);
            expect((await writeIfUnchanged(root, adapter.path, modified, adapter.sha256)).success).toBe(true);
            await reconcilePrivateWriteIntent(root, base);
            await expect(readVerifiedSanitySiteSource(root, base)).rejects.toThrow();
            await expect(assertRetainedSanitySiteReady(root, base)).rejects.toThrow();
            await expect(inspectRetainedSanitySiteInstall(root, base)).rejects.toThrow();
        }, { extraSources: { [path]: before } });
    }, 30_000);

    test('saved ordinary additions and deletions recapture with exact source membership', async () => {
        const deletedPath = 'src/components/old-heading.tsx';
        const addedPath = 'src/components/new-heading.tsx';
        const content = 'export const heading = "New heading";\n';
        await fixture(async ({ root, base, handle }) => {
            await installRetainedSanitySite(root, handle, base);
            expect((await beginPrivateWriteIntent(root, addedPath, null, hash(content), base)).success).toBe(true);
            expect((await writeIfUnchanged(root, addedPath, content, null)).success).toBe(true);
            await reconcilePrivateWriteIntent(root, base);
            await rm(join(root, deletedPath));
            expect((await journalCliEdits(root, [deletedPath], base)).recorded).toEqual([deletedPath]);
            expect(await inspectRetainedSanitySiteInstall(root, base)).toMatchObject({ status: 'complete', needsPreparation: true });
            await expect(planPrivateRelease(root, base)).rejects.toThrow();
            const view = await readVerifiedSanitySiteSource(root, base);
            expect(view.sourceFiles.some((file) => file.path === deletedPath)).toBe(false);
            expect(view.sourceFiles.find((file) => file.path === addedPath).bytes.toString()).toBe(content);
            const nextHandle = await capture(root, view.sourceFiles, { predecessor: view.predecessor });
            try {
                await installRetainedSanitySite(root, nextHandle, base);
                expect(await inspectRetainedSanitySiteInstall(root, base)).not.toHaveProperty('needsPreparation');
                const plan = await planPrivateRelease(root, base);
                expect(plan.changedFiles).toContainEqual({ path: deletedPath, original: 'export const old = true;\n', updated: null });
                expect(plan.changedFiles).toContainEqual({ path: addedPath, original: null, updated: content });
            } finally { discardRetainedSiteArtifact(nextHandle); }
        }, { extraSources: { [deletedPath]: 'export const old = true;\n' } });
    }, 30_000);

    test('read-only inspection rejects physical third values without altering recovery records', async () => {
        await fixture(async (context) => {
            const { root, base, container } = context;
            const { target } = await interruptedFixture(context, false);
            await writeFile(join(root, target.path), 'Third value');
            const retained = await readFile(join(container, 'cms-install.json'));
            const journal = await readFile(join(container, 'write-journal.json'));
            await expect(inspectRetainedSanitySiteInstall(root, base)).rejects.toThrow();
            expect(await readFile(join(container, 'cms-install.json'))).toEqual(retained);
            expect(await readFile(join(container, 'write-journal.json'))).toEqual(journal);
            expect(await readFile(join(root, target.path), 'utf8')).toBe('Third value');
        });
    }, 30_000);

    test('a completed target restored to its original bytes cannot preview or release as complete', async () => {
        await fixture(async ({ root, base, handle, artifact, container }) => {
            await installRetainedSanitySite(root, handle, base);
            const receipt = await readFile(join(container, 'cms-install.json'));
            const retained = JSON.parse(receipt);
            const target = artifact.files.find((file) => file.beforeSha256 !== null && file.beforeSha256 !== file.sha256);
            await writeFile(join(root, target.path), Buffer.from(retained.beforeBytes[target.path], 'base64'));
            await expect(inspectRetainedSanitySiteInstall(root, base)).rejects.toThrow('changed');
            await expect(assertRetainedSanitySiteReady(root, base)).rejects.toThrow('changed');
            expect((await startDevServer(root, null, 39999, () => null)).error).toContain('changed');
            await expect(planPrivateRelease(root, base)).rejects.toThrow('changed');
            expect(await readFile(join(container, 'cms-install.json'))).toEqual(receipt);
        });
    }, 30_000);

    test('synchronous cancellation during source staging preserves durable pending recovery', async () => {
        await fixture(async ({ root, base, handle, sourceFiles, container }) => {
            const fsPromises = require('node:fs/promises');
            const open = fsPromises.open.bind(fsPromises);
            let active = true;
            const cancellation = spyOn(fsPromises, 'open').mockImplementation(async (path, ...options) => {
                const file = await open(path, ...options);
                if (String(path).startsWith(root + '/') && String(path).includes('/.weblab-')) active = false;
                return file;
            });
            const assertActive = () => { if (!active) throw new Error('Preparation was cancelled'); };
            try {
                await expect(installRetainedSanitySite(root, handle, base, { assertCurrent: async () => {}, assertActive })).rejects.toThrow('cancelled');
            } finally { cancellation.mockRestore(); }
            for (const file of sourceFiles) expect(await readFile(join(root, file.path))).toEqual(file.bytes);
            expect((await inspectRetainedSanitySiteInstall(root, base)).status).toBe('pending');
            const journal = await readFile(join(container, 'write-journal.json'));
            await expect(resumeRetainedSanitySiteInstall(root, base, { assertActive })).rejects.toThrow('cancelled');
            expect(await readFile(join(container, 'write-journal.json'))).toEqual(journal);
            active = true;
            await expect(resumeRetainedSanitySiteInstall(root, base, { assertActive })).resolves.toHaveProperty('status', 'complete');
        });
    }, 30_000);

    test('a newly journaled addition after capture changes membership and cannot replace the prior completed receipt', async () => {
        await fixture(async ({ root, base, handle, container }) => {
            await installRetainedSanitySite(root, handle, base);
            const view = await readVerifiedSanitySiteSource(root, base);
            const nextHandle = await capture(root, view.sourceFiles, { predecessor: view.predecessor });
            try {
                const path = 'src/components/newer-file.tsx';
                const content = 'export const later = true;\n';
                expect((await beginPrivateWriteIntent(root, path, null, hash(content), base)).success).toBe(true);
                expect((await writeIfUnchanged(root, path, content, null)).success).toBe(true);
                await reconcilePrivateWriteIntent(root, base);
                const receipt = await readFile(join(container, 'cms-install.json'));
                await expect(installRetainedSanitySite(root, nextHandle, base)).rejects.toThrow('membership');
                expect(await readFile(join(container, 'cms-install.json'))).toEqual(receipt);
                expect(await readFile(join(root, path), 'utf8')).toBe(content);
            } finally { discardRetainedSiteArtifact(nextHandle); }
        });
    }, 30_000);

    test('authorization loss after a durable intent retains pending bytes and read-only inspection can identify recovery', async () => {
        await fixture(async ({ root, base, handle, artifact, sourceFiles, container }) => {
            const assertCurrent = async (pins) => {
                expect(pins.scope.rootPath).toBe(root); expect(pins.manifestHash).toBe(artifact.manifestHash);
                const journal = JSON.parse(await readFile(join(container, 'write-journal.json'), 'utf8'));
                if (journal.intent) throw new Error('Current connection authorization was revoked');
            };
            await expect(installRetainedSanitySite(root, handle, base, { assertCurrent })).rejects.toThrow('revoked');
            const retained = await readFile(join(container, 'cms-install.json'));
            const journal = await readFile(join(container, 'write-journal.json'));
            expect(JSON.parse(retained).status).toBe('pending'); expect(JSON.parse(journal).intent).toBeDefined();
            for (const file of sourceFiles) expect(await readFile(join(root, file.path))).toEqual(file.bytes);
            const inspected = await inspectRetainedSanitySiteInstall(root, base);
            expect(inspected).toEqual({ status: 'pending', scope: artifact.scope, manifestHash: artifact.manifestHash,
                captureId: artifact.captureId, contentHash: artifact.contentHash, draftHash: artifact.draftHash });
            expect(inspected).not.toHaveProperty('files'); expect(inspected).not.toHaveProperty('artifact');
            expect(await readFile(join(container, 'cms-install.json'))).toEqual(retained);
            expect(await readFile(join(container, 'write-journal.json'))).toEqual(journal);
            await expect(resumeRetainedSanitySiteInstall(root, base, { assertCurrent: async () => { throw new Error('Still revoked'); } })).rejects.toThrow('Still revoked');
            expect(await readFile(join(container, 'write-journal.json'))).toEqual(journal);
            await expect(resumeRetainedSanitySiteInstall(root, base, { assertCurrent: async () => {} })).resolves.toHaveProperty('status', 'complete');
            expect((await inspectRetainedSanitySiteInstall(root, base)).status).toBe('complete');
        });
    }, 30_000);

    test('a retained marker changed during an awaited guard pauses before the source CAS write', async () => {
        await fixture(async ({ root, base, handle, sourceFiles, container }) => {
            let changed = false;
            const assertCurrent = async () => {
                const journal = JSON.parse(await readFile(join(container, 'write-journal.json'), 'utf8'));
                if (journal.intent && !changed) {
                    changed = true;
                    const file = join(container, 'cms-install.json');
                    const record = JSON.parse(await readFile(file, 'utf8'));
                    await writeFile(file, JSON.stringify({ ...record, recoveryNotice: 'Changed during guard' }), { mode: 0o600 });
                }
            };
            await expect(installRetainedSanitySite(root, handle, base, { assertCurrent })).rejects.toThrow('changed while authorization');
            expect(changed).toBe(true);
            for (const file of sourceFiles) expect(await readFile(join(root, file.path))).toEqual(file.bytes);
            expect((await inspectRetainedSanitySiteInstall(root, base)).status).toBe('pending');
        });
    }, 30_000);

    test('explicit retained-byte recovery stays gated across cancellation and needs a fresh successor capture', async () => {
        await fixture(async (context) => {
            const { root, base, container } = context;
            const { target } = await interruptedFixture(context, false);
            let guards = 0;
            await expect(resumeRetainedSanitySiteInstall(root, base, {
                requiresPreparation: true,
                assertCurrent: async () => { if (++guards === 2) throw new Error('Recovery was cancelled'); },
            })).rejects.toThrow('cancelled');
            const paused = JSON.parse(await readFile(join(container, 'cms-install.json'), 'utf8'));
            expect(paused.status).toBe('pending'); expect(paused.requiresPreparation).toBe(true);
            expect(hash(await readFile(join(root, target.path)))).toBe(target.beforeSha256);
            await resumeRetainedSanitySiteInstall(root, base, { assertCurrent: async () => {} });
            expect(await inspectRetainedSanitySiteInstall(root, base)).toMatchObject({ status: 'complete', needsPreparation: true });
            await expect(assertRetainedSanitySiteReady(root, base)).rejects.toThrow('fresh reviewed');
            expect((await startDevServer(root, null, 39999, () => null)).error).toContain('fresh reviewed');
            await expect(planPrivateRelease(root, base)).rejects.toThrow('fresh reviewed');
            const view = await readVerifiedSanitySiteSource(root, base);
            const nextHandle = await capture(root, view.sourceFiles, { title: 'Freshly reviewed version', predecessor: view.predecessor });
            try {
                await installRetainedSanitySite(root, nextHandle, base, { assertCurrent: async () => {} });
                expect(await inspectRetainedSanitySiteInstall(root, base)).not.toHaveProperty('needsPreparation');
                const completed = JSON.parse(await readFile(join(container, 'cms-install.json'), 'utf8'));
                expect(completed).not.toHaveProperty('requiresPreparation');
                expect(completed).not.toHaveProperty('preparationSuccessor');
                expect((await assertRetainedSanitySiteReady(root, base)).artifact.manifestHash).toBe(getRetainedSiteArtifact(nextHandle).manifestHash);
                expect((await planPrivateRelease(root, base)).unsupportedChanges).toEqual([]);
            } finally { discardRetainedSiteArtifact(nextHandle); }
        });
    }, 30_000);

    test('explicit recovery of a cancelled successor cannot use its former permission to clear the gate', async () => {
        await fixture(async (context) => {
            const { root, base, container } = context;
            await interruptedFixture(context, false);
            await resumeRetainedSanitySiteInstall(root, base, { requiresPreparation: true });
            const view = await readVerifiedSanitySiteSource(root, base);
            const nextHandle = await capture(root, view.sourceFiles, { predecessor: view.predecessor });
            try {
                const next = getRetainedSiteArtifact(nextHandle);
                const assertCurrent = async () => {
                    const marker = JSON.parse(await readFile(join(container, 'cms-install.json'), 'utf8'));
                    if (marker.manifestHash === next.manifestHash) throw new Error('Successor connection became stale');
                };
                await expect(installRetainedSanitySite(root, nextHandle, base, { assertCurrent })).rejects.toThrow('stale');
                const pending = JSON.parse(await readFile(join(container, 'cms-install.json'), 'utf8'));
                expect(pending.status).toBe('pending');
                expect(pending.requiresPreparation).toBe(true); expect(pending.preparationSuccessor).toBe(true);
                await resumeRetainedSanitySiteInstall(root, base, { requiresPreparation: true, assertCurrent: async () => {} });
                const recovered = JSON.parse(await readFile(join(container, 'cms-install.json'), 'utf8'));
                expect(recovered.status).toBe('complete'); expect(recovered.requiresPreparation).toBe(true);
                expect(recovered).not.toHaveProperty('preparationSuccessor');
                expect(await inspectRetainedSanitySiteInstall(root, base)).toMatchObject({ status: 'complete', needsPreparation: true });
                await expect(assertRetainedSanitySiteReady(root, base)).rejects.toThrow('fresh reviewed');
            } finally { discardRetainedSiteArtifact(nextHandle); }
        });
    }, 30_000);

    test('only completed owned images enter release snapshots, and ordinary Git review still refuses them', async () => {
        await fixture(async ({ root, base, handle, artifact }) => {
            await installRetainedSanitySite(root, handle, base);
            const asset = artifact.files.find((entry) => entry.kind === 'asset'); expect(asset).toBeDefined();
            expect((await planPrivateHandoff(root, base)).unsupportedChanges).toContain(asset.path);
            const plan = await planPrivateRelease(root, base);
            expect(plan.unsupportedChanges).toEqual([]); expect(plan.binaryFiles).toContainEqual({ path: asset.path, sha256: asset.sha256, size: asset.bytes.length });
            const cleaned = plan.changedFiles.map((file) => ({ path: file.path, updated: file.updated }));
            await expect(createPrivateReleaseSnapshot(root, plan.planToken, [...cleaned, { path: asset.path, updated: 'renderer bytes' }], base)).rejects.toThrow('cleaned');
            const data = cleaned.find((file) => file.path.includes('weblab-frozen')) ?? cleaned[0];
            await expect(createPrivateReleaseSnapshot(root, plan.planToken,
                cleaned.map((file) => file.path === data.path ? { ...file, updated: 'renderer runtime replacement' } : file), base)).rejects.toThrow('release cleanup');
            const frozen = await createPrivateReleaseSnapshot(root, plan.planToken, cleaned, base);
            expect(frozen.files.find((file) => file.path === asset.path).bytes).toEqual(asset.bytes);
            await writeFile(join(root, asset.path), Buffer.from([0, 1, 2]));
            await expect(validatePrivateReleaseSnapshot(root, frozen.copyId, plan.planToken, base)).rejects.toThrow();
            await expect(planPrivateRelease(root, base)).rejects.toThrow();
        }, { image: true });
    }, 30_000);
});
