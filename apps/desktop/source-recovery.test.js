import { afterEach, beforeEach, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
    confirmSourceRelink, createPrivateWorkingCopy, exportPrivateHandoff,
    getSourceLocation, grantLocalRoot, planPrivateHandoff, prepareSourceRelink,
    recordPrivateWrite, requirePrivateWorkingRoot, writeIfUnchanged,
} from './weblab-local.js';

const original = '<h1>Original</h1>\n';
const edited = '<h1>Saved in Weblab</h1>\n';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, {
    cwd, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' },
}).trim();
let fixture;
let source;
let base;
let backups;

beforeEach(async () => {
    fixture = await realpath(await mkdtemp(join(tmpdir(), 'weblab-source-recovery-')));
    source = join(fixture, 'source');
    base = join(fixture, 'private');
    backups = [];
    await mkdir(source);
    await mkdir(base);
    git(source, 'init', '-q');
    await writeFile(join(source, 'page.html'), original);
    git(source, 'add', 'page.html');
    git(source, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Initial');
});
afterEach(async () => {
    for (const backup of backups) if (backup) await rm(backup, { force: true });
    await rm(fixture, { recursive: true, force: true });
});

async function createCopy(root = source) {
    return createPrivateWorkingCopy(await grantLocalRoot(root), base);
}
async function editCopy(copy, before = original, after = edited) {
    const saved = await writeIfUnchanged(copy.rootPath, 'page.html', after, hash(before));
    expect(saved.success).toBe(true);
    backups.push(saved.recoveryPath);
    await recordPrivateWrite(copy.rootPath, 'page.html', saved.hash, base);
}
const manifestPath = (copy) => join(base, copy.copyId, 'baseline.json');

test.runIf(process.platform === 'darwin')('native rename recovery reopens the same edited private copy and preserves its manifest', async () => {
    const copy = await createCopy();
    const baseline = await readFile(manifestPath(copy));
    await editCopy(copy);
    const moved = join(fixture, 'renamed-source');
    await rename(source, moved);
    expect(await getSourceLocation(copy.rootPath, false, base)).toMatchObject({ status: 'missing', sourcePath: source });
    expect(await getSourceLocation(copy.rootPath, true, base)).toMatchObject({ status: 'available', sourcePath: moved });
    const reopened = await createCopy(moved);
    expect(reopened).toMatchObject({ copyId: copy.copyId, rootPath: copy.rootPath, reused: true });
    expect(await readFile(join(reopened.rootPath, 'page.html'), 'utf8')).toBe(edited);
    expect(await readFile(manifestPath(copy))).toEqual(baseline);
    expect(await readFile(join(moved, 'page.html'), 'utf8')).toBe(original);
}, 30000);

test('a missing original does not block saving more private edits', async () => {
    const copy = await createCopy();
    const baseline = await readFile(manifestPath(copy));
    await rm(source, { recursive: true });
    expect(await getSourceLocation(copy.rootPath, false, base)).toMatchObject({ status: 'missing' });
    expect(await requirePrivateWorkingRoot(copy.rootPath, base)).toBe(copy.rootPath);
    await editCopy(copy);
    expect(await readFile(join(copy.rootPath, 'page.html'), 'utf8')).toBe(edited);
    expect(await readFile(manifestPath(copy))).toEqual(baseline);
    await expect(planPrivateHandoff(copy.rootPath, base)).rejects.toThrow('Source folder unavailable');
}, 30000);

test('manual reconnect to changed content keeps private edits and blocks the old export', async () => {
    const copy = await createCopy();
    await editCopy(copy);
    const reviewed = await planPrivateHandoff(copy.rootPath, base);
    expect(reviewed.planToken).toBeTruthy();
    const baseline = await readFile(manifestPath(copy));
    const candidate = join(fixture, 'candidate');
    await cp(source, candidate, { recursive: true });
    await writeFile(join(candidate, 'page.html'), '<h1>Other content</h1>\n');
    const prepared = await prepareSourceRelink(copy.rootPath, candidate, base);
    expect(prepared.sourceChanged).toBe(true);
    expect((await getSourceLocation(copy.rootPath, false, base)).sourcePath).toBe(source);
    expect(await confirmSourceRelink(copy.rootPath, prepared.token, base)).toMatchObject({ sourcePath: candidate, status: 'available' });
    expect(await readFile(join(copy.rootPath, 'page.html'), 'utf8')).toBe(edited);
    expect(await readFile(manifestPath(copy))).toEqual(baseline);
    const blocked = await planPrivateHandoff(copy.rootPath, base);
    expect(blocked).toMatchObject({ sourceChanged: true, planToken: null });
    await expect(exportPrivateHandoff(copy.rootPath, reviewed.planToken, base)).rejects.toThrow('Project files changed since handoff review');
    expect(await readFile(join(source, 'page.html'), 'utf8')).toBe(original);
    expect(await readFile(join(candidate, 'page.html'), 'utf8')).toBe('<h1>Other content</h1>\n');
}, 30000);

test('confirmation of an unchanged candidate still invalidates a reviewed export token', async () => {
    const copy = await createCopy();
    await editCopy(copy);
    const reviewed = await planPrivateHandoff(copy.rootPath, base);
    const candidate = join(fixture, 'same-content');
    await cp(source, candidate, { recursive: true });
    const baseline = await readFile(manifestPath(copy));
    const prepared = await prepareSourceRelink(copy.rootPath, candidate, base);
    expect(prepared.sourceChanged).toBe(false);
    await confirmSourceRelink(copy.rootPath, prepared.token, base);
    await expect(exportPrivateHandoff(copy.rootPath, reviewed.planToken, base)).rejects.toThrow('Project files changed since handoff review');
    const fresh = await planPrivateHandoff(copy.rootPath, base);
    expect(fresh).toMatchObject({ sourceChanged: false, sourceRootPath: candidate });
    expect(fresh.planToken).toBeTruthy();
    expect(fresh.planToken).not.toBe(reviewed.planToken);
    const exported = await exportPrivateHandoff(copy.rootPath, fresh.planToken, base);
    expect(await readFile(exported.patchPath, 'utf8')).toContain('+<h1>Saved in Weblab</h1>');
    expect(await readFile(manifestPath(copy))).toEqual(baseline);
    expect(await readFile(join(source, 'page.html'), 'utf8')).toBe(original);
    expect(await readFile(join(candidate, 'page.html'), 'utf8')).toBe(original);
}, 30000);

test('a moved Git worktree uses its current validated layout for handoff without changing the original', async () => {
    const worktree = join(fixture, 'client');
    git(source, 'worktree', 'add', '-qb', 'client', worktree);
    const copy = await createCopy(worktree);
    await editCopy(copy);
    const baseline = await readFile(manifestPath(copy));
    const moved = join(fixture, 'moved-client');
    git(source, 'worktree', 'move', worktree, moved);
    const pointer = await readFile(join(moved, '.git'));
    const indexPath = resolve(moved, git(moved, 'rev-parse', '--git-path', 'index'));
    const index = await readFile(indexPath);
    const head = git(moved, 'rev-parse', 'HEAD');
    const prepared = await prepareSourceRelink(copy.rootPath, moved, base);
    expect(prepared.sourceChanged).toBe(false);
    await confirmSourceRelink(copy.rootPath, prepared.token, base);
    const plan = await planPrivateHandoff(copy.rootPath, base);
    expect(plan).toMatchObject({ sourceRootPath: moved, sourceChanged: false });
    expect(plan.planToken).toBeTruthy();
    const exported = await exportPrivateHandoff(copy.rootPath, plan.planToken, base);
    expect(await readFile(exported.patchPath, 'utf8')).toContain('+<h1>Saved in Weblab</h1>');
    expect(await readFile(manifestPath(copy))).toEqual(baseline);
    expect(await readFile(join(moved, 'page.html'), 'utf8')).toBe(original);
    expect(await readFile(join(moved, '.git'))).toEqual(pointer);
    expect(await readFile(indexPath)).toEqual(index);
    expect(git(moved, 'rev-parse', 'HEAD')).toBe(head);
}, 30000);
