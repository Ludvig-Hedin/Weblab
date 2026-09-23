import { afterAll, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beginPrivateWriteIntent, createPreparationPublicDirectory, createPrivateWorkingCopy, deleteFileIfUnchanged, deletePreparationPublicDirectory, exportPrivateHandoff, grantLocalRoot, planPrivateHandoff, projectDevEnvironment, pruneSuccessfulBackups, readTextFile, reconcilePrivateWriteIntent, recordPrivateWrite, rejectSymlinkPath, requireGrantedRoot, requirePrivateWorkingRoot, startDevServer, stopDevServer, writeIfUnchanged } from './weblab-local.js';

const root = await mkdtemp(join(tmpdir(), 'weblab-local-safety-'));
const backups = [];
const hash = (value) => createHash('sha256').update(value).digest('hex');

test('project preview gets a narrow environment without app credentials', () => {
    process.env.WEBLAB_TEST_SECRET = 'never forward';
    process.env.CLERK_SECRET_KEY = 'never forward';
    try {
        const env = projectDevEnvironment(root, 31847);
        expect(env.PORT).toBe('31847');
        expect(env.PATH).toContain(join(root, 'node_modules', '.bin'));
        expect(env).not.toHaveProperty('WEBLAB_TEST_SECRET');
        expect(env).not.toHaveProperty('CLERK_SECRET_KEY');
        expect(env).not.toHaveProperty('CONVEX_DEPLOY_KEY');
        expect(Object.keys(env).every((key) => [
            'HOME', 'TMPDIR', 'TMP', 'TEMP', 'USER', 'LOGNAME', 'SHELL',
            'LANG', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES', 'BUN_INSTALL',
            'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'APPDATA',
            'LOCALAPPDATA', 'USERPROFILE', 'PATH', 'PORT',
        ].includes(key))).toBe(true);
    } finally {
        delete process.env.WEBLAB_TEST_SECRET;
        delete process.env.CLERK_SECRET_KEY;
    }
});

test('native folder grant accepts only the selected real path', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'weblab-ungranted-'));
    try {
        await expect(requireGrantedRoot(outside)).rejects.toThrow('ungranted_root');
        const canonicalRoot = await realpath(root);
        expect(await grantLocalRoot(root)).toBe(canonicalRoot);
        expect(await requireGrantedRoot(canonicalRoot)).toBe(canonicalRoot);
        const alias = join(outside, 'alias');
        await symlink(root, alias);
        await expect(requireGrantedRoot(alias)).rejects.toThrow('ungranted_root');
    } finally {
        await rm(outside, { recursive: true, force: true });
    }
});

test('private Git copy keeps original HEAD, index, dirty files and untracked files untouched', async () => {
    const project = await mkdtemp(join(tmpdir(), 'weblab-original-git-'));
    const privateBase = await mkdtemp(join(tmpdir(), 'weblab-private-git-'));
    const git = (...args) => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();
    try {
        git('init', '-q');
        await writeFile(join(project, 'index.html'), '<html>committed</html>');
        git('add', 'index.html');
        git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Initial');
        await writeFile(join(project, 'index.html'), '<html>dirty</html>');
        await writeFile(join(project, 'notes.txt'), 'untracked client note');
        await mkdir(join(project, 'node_modules'));
        await writeFile(join(project, 'node_modules', 'ignored.js'), 'generated dependency');
        const headBefore = git('rev-parse', 'HEAD');
        const indexBefore = await readFile(join(project, '.git', 'index'));

        const sourceRoot = await grantLocalRoot(project);
        const safeBase = await realpath(privateBase);
        const created = await createPrivateWorkingCopy(sourceRoot, safeBase);
        await expect(requirePrivateWorkingRoot(sourceRoot, safeBase))
            .rejects.toThrow('original_git_root_is_read_only');
        expect(await requirePrivateWorkingRoot(created.rootPath, safeBase)).toBe(created.rootPath);
        expect(created).toMatchObject({
            sourceRootPath: sourceRoot,
            reused: false,
            previewNeedsInstall: true,
            excludedPaths: ['node_modules'],
        });
        expect(await readFile(join(created.rootPath, 'index.html'), 'utf8')).toBe('<html>dirty</html>');
        expect(await readFile(join(created.rootPath, 'notes.txt'), 'utf8')).toBe('untracked client note');
        const manifest = JSON.parse(await readFile(join(safeBase, created.copyId, 'baseline.json'), 'utf8'));
        expect(manifest.snapshot).toContainEqual({ path: 'index.html', sha256: hash('<html>dirty</html>') });
        expect(manifest.snapshot).toContainEqual({ path: 'notes.txt', sha256: hash('untracked client note') });
        expect(manifest.baseline.find((file) => file.path === 'index.html')?.content)
            .toBe('<html>dirty</html>');
        await expect(stat(join(created.rootPath, 'node_modules'))).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await readFile(join(created.rootPath, '.git', 'index'))).toEqual(indexBefore);
        expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: created.rootPath, encoding: 'utf8' }).trim())
            .toBe(headBefore);
        expect(git('rev-parse', 'HEAD')).toBe(headBefore);
        expect(await readFile(join(project, '.git', 'index'))).toEqual(indexBefore);
        expect(await readFile(join(project, 'index.html'), 'utf8')).toBe('<html>dirty</html>');

        await writeFile(join(created.rootPath, 'index.html'), '<html>private edit</html>');
        const reused = await createPrivateWorkingCopy(sourceRoot, safeBase);
        expect(reused).toMatchObject({ rootPath: created.rootPath, copyId: created.copyId, reused: true });
        expect(await readFile(join(reused.rootPath, 'index.html'), 'utf8')).toBe('<html>private edit</html>');
        expect(await readFile(join(project, 'index.html'), 'utf8')).toBe('<html>dirty</html>');
        await writeFile(join(project, 'index.html'), '<html>source moved on</html>');
        const refreshed = await createPrivateWorkingCopy(sourceRoot, safeBase);
        expect(refreshed).toMatchObject({ reused: false, priorCopyId: created.copyId });
        expect(refreshed.copyId).not.toBe(created.copyId);
        expect(await readFile(join(refreshed.rootPath, 'index.html'), 'utf8'))
            .toBe('<html>source moved on</html>');
        expect(await readFile(join(created.rootPath, 'index.html'), 'utf8'))
            .toBe('<html>private edit</html>');
        expect((await createPrivateWorkingCopy(sourceRoot, safeBase)).copyId).toBe(refreshed.copyId);
        await rm(join(safeBase, refreshed.copyId, 'baseline.json'));
        await expect(createPrivateWorkingCopy(sourceRoot, safeBase))
            .rejects.toThrow('Existing private working copy is inconsistent');
    } finally {
        await rm(project, { recursive: true, force: true });
        await rm(privateBase, { recursive: true, force: true });
    }
});

test('private Git copy rejects source symlinks without changing the original', async () => {
    const project = await mkdtemp(join(tmpdir(), 'weblab-symlink-git-'));
    const privateBase = await mkdtemp(join(tmpdir(), 'weblab-private-reject-'));
    try {
        execFileSync('git', ['init', '-q'], { cwd: project });
        await writeFile(join(project, 'index.html'), 'source');
        await symlink('index.html', join(project, 'linked.html'));
        await expect(createPrivateWorkingCopy(await grantLocalRoot(project), await realpath(privateBase)))
            .rejects.toThrow('Symlink cannot be copied safely');
        expect(await readFile(join(project, 'index.html'), 'utf8')).toBe('source');
        await rm(join(project, 'linked.html'));
        await writeFile(join(project, '.git', 'index.lock'), 'in progress');
        await expect(createPrivateWorkingCopy(await grantLocalRoot(project), await realpath(privateBase)))
            .rejects.toThrow('.git/index.lock');
        expect((await readdir(privateBase)).sort()).toEqual([]);
    } finally {
        await rm(project, { recursive: true, force: true });
        await rm(privateBase, { recursive: true, force: true });
    }
});

test('private copy recovers a dead owner lock but keeps live and unknown locks', async () => {
    const project = await mkdtemp(join(tmpdir(), 'weblab-lock-source-'));
    const privateBase = await mkdtemp(join(tmpdir(), 'weblab-lock-private-'));
    const lockPath = join(privateBase, 'index.lock');
    const nonce = '00000000-0000-4000-8000-000000000000';
    try {
        execFileSync('git', ['init', '-q'], { cwd: project });
        await writeFile(join(project, 'index.html'), 'source');
        const sourceRoot = await grantLocalRoot(project);
        const base = await realpath(privateBase);
        await writeFile(lockPath, JSON.stringify({ pid: process.pid, nonce }), { mode: 0o600 });
        await expect(createPrivateWorkingCopy(sourceRoot, base))
            .rejects.toThrow('Another private copy is in progress');
        expect(await readFile(lockPath, 'utf8')).toContain(String(process.pid));
        await rm(lockPath);
        await writeFile(lockPath, '', { mode: 0o600 });
        await expect(createPrivateWorkingCopy(sourceRoot, base))
            .rejects.toThrow('manual recovery');
        await rm(lockPath);
        await writeFile(lockPath, JSON.stringify({ pid: 2147483647, nonce }), { mode: 0o600 });
        const copy = await createPrivateWorkingCopy(sourceRoot, base);
        expect(copy.reused).toBe(false);
        await expect(stat(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
        await rm(project, { recursive: true, force: true });
        await rm(privateBase, { recursive: true, force: true });
    }
});

test('guarded private mutations reject Git metadata before touching bytes', async () => {
    const project = await mkdtemp(join(tmpdir(), 'weblab-git-metadata-'));
    try {
        execFileSync('git', ['init', '-q'], { cwd: project });
        const config = await readFile(join(project, '.git', 'config'));
        const expected = hash(config);
        expect(await writeIfUnchanged(project, '.git/config', 'unsafe', expected))
            .toEqual({ error: 'git_metadata_read_only' });
        expect(await writeIfUnchanged(project, '.GIT/config', 'unsafe', null))
            .toEqual({ error: 'git_metadata_read_only' });
        expect(await deleteFileIfUnchanged(project, '.git/config', expected))
            .toEqual({ error: 'git_metadata_read_only' });
        expect(await readFile(join(project, '.git', 'config'))).toEqual(config);
    } finally {
        await rm(project, { recursive: true, force: true });
    }
});

test('Weblab-only handoff exports a reviewed patch and refuses unrelated or stale changes', async () => {
    const project = await mkdtemp(join(tmpdir(), 'weblab-handoff-source-'));
    const privateBase = await mkdtemp(join(tmpdir(), 'weblab-handoff-private-'));
    const applyBase = await mkdtemp(join(tmpdir(), 'weblab-handoff-apply-'));
    const git = (...args) => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();
    try {
        git('init', '-q');
        await writeFile(join(project, 'index.html'), '<h1>committed</h1>\n');
        git('add', 'index.html');
        git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Initial');
        await writeFile(join(project, 'index.html'), '<h1>dirty</h1>\n');
        const sourceRoot = await grantLocalRoot(project);
        const base = await realpath(privateBase);
        const copy = await createPrivateWorkingCopy(sourceRoot, base);
        const originalIndex = await readFile(join(project, '.git', 'index'));
        const originalHead = git('rev-parse', 'HEAD');
        const saved = await writeIfUnchanged(
            copy.rootPath, 'index.html', '<h1>Weblab edit</h1>\n', hash('<h1>dirty</h1>\n'),
        );
        expect(saved.success).toBe(true);
        backups.push(saved.recoveryPath);
        await recordPrivateWrite(copy.rootPath, 'index.html', saved.hash, base);
        const added = await writeIfUnchanged(copy.rootPath, 'new.html', '<p>New</p>\n', null);
        expect(added.success).toBe(true);
        await recordPrivateWrite(copy.rootPath, 'new.html', added.hash, base);

        const plan = await planPrivateHandoff(copy.rootPath, base);
        expect(plan.sourceChanged).toBe(false);
        expect(plan.unsupportedChanges).toEqual([]);
        expect(plan.changedFiles).toContainEqual({
            path: 'index.html', original: '<h1>dirty</h1>\n', updated: '<h1>Weblab edit</h1>\n',
        });
        expect(plan.changedFiles).toContainEqual({
            path: 'new.html', original: null, updated: '<p>New</p>\n',
        });
        const exported = await exportPrivateHandoff(copy.rootPath, plan.planToken, base);
        const patch = await readFile(exported.patchPath, 'utf8');
        expect(patch).toContain('diff --git a/index.html b/index.html');
        expect(patch).toContain('diff --git a/new.html b/new.html');
        expect(patch).toContain('-<h1>dirty</h1>');
        expect(patch).toContain('+<h1>Weblab edit</h1>');
        expect(await readFile(join(project, 'index.html'), 'utf8')).toBe('<h1>dirty</h1>\n');
        expect(await readFile(join(project, '.git', 'index'))).toEqual(originalIndex);
        expect(git('rev-parse', 'HEAD')).toBe(originalHead);

        const disposable = join(applyBase, 'project');
        execFileSync('git', ['clone', '--no-hardlinks', '-q', project, disposable]);
        await writeFile(join(disposable, 'index.html'), '<h1>dirty</h1>\n');
        execFileSync('git', ['apply', '--check', exported.patchPath], { cwd: disposable });
        execFileSync('git', ['apply', exported.patchPath], { cwd: disposable });
        expect(await readFile(join(disposable, 'index.html'), 'utf8')).toBe('<h1>Weblab edit</h1>\n');
        expect(await readFile(join(disposable, 'new.html'), 'utf8')).toBe('<p>New</p>\n');

        await writeFile(join(copy.rootPath, 'outside.html'), '<p>External</p>');
        const unrelated = await planPrivateHandoff(copy.rootPath, base);
        expect(unrelated.unsupportedChanges).toContain('outside.html');
        expect(unrelated.planToken).toBeNull();
        await rm(join(copy.rootPath, 'outside.html'));
        const reviewed = await planPrivateHandoff(copy.rootPath, base);
        await writeFile(join(project, 'index.html'), '<h1>source moved on</h1>\n');
        await expect(exportPrivateHandoff(copy.rootPath, reviewed.planToken, base))
            .rejects.toThrow('Project files changed since handoff review');
    } finally {
        await rm(project, { recursive: true, force: true });
        await rm(privateBase, { recursive: true, force: true });
        await rm(applyBase, { recursive: true, force: true });
    }
});

test('durable private intent reconciles crashes before and after guarded write or delete', async () => {
    const project = await mkdtemp(join(tmpdir(), 'weblab-intent-source-'));
    const privateBase = await mkdtemp(join(tmpdir(), 'weblab-intent-private-'));
    try {
        execFileSync('git', ['init', '-q'], { cwd: project });
        await writeFile(join(project, 'index.html'), 'before');
        const sourceRoot = await grantLocalRoot(project);
        const base = await realpath(privateBase);
        const copy = await createPrivateWorkingCopy(sourceRoot, base);

        await beginPrivateWriteIntent(copy.rootPath, 'index.html', hash('before'), hash('after'), base);
        await reconcilePrivateWriteIntent(copy.rootPath, base); // crash before file mutation
        expect((await planPrivateHandoff(copy.rootPath, base)).changedFiles).toEqual([]);

        await beginPrivateWriteIntent(copy.rootPath, 'index.html', hash('before'), hash('after'), base);
        const saved = await writeIfUnchanged(copy.rootPath, 'index.html', 'after', hash('before'));
        expect(saved.success).toBe(true);
        backups.push(saved.recoveryPath);
        // Simulate process death before journal completion. Planning recovers
        // the exact desired bytes from the durable prewrite intent.
        expect((await planPrivateHandoff(copy.rootPath, base)).changedFiles)
            .toContainEqual({ path: 'index.html', original: 'before', updated: 'after' });

        await beginPrivateWriteIntent(copy.rootPath, 'new.html', null, hash('temporary'), base);
        expect((await writeIfUnchanged(copy.rootPath, 'new.html', 'temporary', null)).success).toBe(true);
        await reconcilePrivateWriteIntent(copy.rootPath, base);
        await beginPrivateWriteIntent(copy.rootPath, 'new.html', hash('temporary'), null, base);
        expect((await deleteFileIfUnchanged(copy.rootPath, 'new.html', hash('temporary'))).success).toBe(true);
        const afterDelete = await planPrivateHandoff(copy.rootPath, base);
        expect(afterDelete.changedFiles.map((file) => file.path)).toEqual(['index.html']);

        await beginPrivateWriteIntent(copy.rootPath, 'index.html', hash('after'), hash('next'), base);
        await writeFile(join(copy.rootPath, 'index.html'), 'external');
        await expect(planPrivateHandoff(copy.rootPath, base)).rejects.toThrow('ambiguous');
    } finally {
        await rm(project, { recursive: true, force: true });
        await rm(privateBase, { recursive: true, force: true });
    }
});

test('guarded write preserves the old bytes and file mode, then rejects stale edits', async () => {
    const target = join(root, 'page.txt');
    await writeFile(target, 'original', { mode: 0o640 });
    const originalMode = (await stat(target)).mode & 0o777;
    const first = await writeIfUnchanged(root, 'page.txt', 'weblab edit', hash('original'));
    expect(first.success).toBe(true);
    expect(first.hash).toBe(hash('weblab edit'));
    expect(await readFile(target, 'utf8')).toBe('weblab edit');
    expect(await readFile(first.recoveryPath, 'utf8')).toBe('original');
    expect((await stat(target)).mode & 0o777).toBe(originalMode);
    backups.push(first.recoveryPath);

    await writeFile(target, 'external edit');
    const stale = await writeIfUnchanged(root, 'page.txt', 'lost edit', first.hash);
    expect(stale.conflict).toBe(true);
    expect(stale.hash).toBe(hash('external edit'));
    expect(await readFile(target, 'utf8')).toBe('external edit');
    expect(await readFile(stale.recoveryPath, 'utf8')).toBe('external edit');
    backups.push(stale.recoveryPath);
});

test('guarded creation requires the path to remain absent', async () => {
    const created = await writeIfUnchanged(root, 'new.txt', 'new', null);
    expect(created).toMatchObject({ success: true, hash: hash('new') });
    const conflict = await writeIfUnchanged(root, 'new.txt', 'overwrite', null);
    expect(conflict).toMatchObject({ conflict: true, hash: hash('new') });
    expect(await readFile(join(root, 'new.txt'), 'utf8')).toBe('new');
    backups.push(conflict.recoveryPath);
});

test('guarded delete removes only a recent native-created file and preserves recovery bytes', async () => {
    const path = 'prepared-new.txt';
    const created = await writeIfUnchanged(root, path, 'prepared', null);
    expect(created.success).toBe(true);
    const deleted = await deleteFileIfUnchanged(root, path, created.hash);
    expect(deleted.success).toBe(true);
    await expect(readFile(join(root, path))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(deleted.recoveryPath, 'utf8')).toBe('prepared');
    backups.push(deleted.recoveryPath);

    const retry = await deleteFileIfUnchanged(root, path, created.hash);
    expect(retry.error).toBe('file_not_recently_created_by_weblab');
});

test('guarded delete rejects existing and externally changed files', async () => {
    await writeFile(join(root, 'preexisting.txt'), 'same content');
    expect(await deleteFileIfUnchanged(root, 'preexisting.txt', hash('same content')))
        .toMatchObject({ error: 'file_not_recently_created_by_weblab' });
    expect(await readFile(join(root, 'preexisting.txt'), 'utf8')).toBe('same content');

    const created = await writeIfUnchanged(root, 'externally-changed.txt', 'created', null);
    await writeFile(join(root, 'externally-changed.txt'), 'external edit');
    const conflict = await deleteFileIfUnchanged(root, 'externally-changed.txt', created.hash);
    expect(conflict.conflict).toBe(true);
    expect(await readFile(join(root, 'externally-changed.txt'), 'utf8')).toBe('external edit');
});

test('guarded delete rejects symlink substitution', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'weblab-delete-outside-'));
    try {
        const created = await writeIfUnchanged(root, 'substituted.txt', 'created', null);
        await rm(join(root, 'substituted.txt'));
        await writeFile(join(outside, 'external.txt'), 'outside');
        await symlink(join(outside, 'external.txt'), join(root, 'substituted.txt'));
        const result = await deleteFileIfUnchanged(root, 'substituted.txt', created.hash);
        expect(result.error).toBe('symlink_path');
        expect(await readFile(join(outside, 'external.txt'), 'utf8')).toBe('outside');
    } finally {
        await rm(join(root, 'substituted.txt'), { force: true });
        await rm(outside, { recursive: true, force: true });
    }
});

test('reviewed public directory creation can roll back only its own empty directory', async () => {
    const project = await mkdtemp(join(tmpdir(), 'weblab-public-directory-'));
    try {
        expect(await createPreparationPublicDirectory(project)).toEqual({ success: true });
        expect((await stat(join(project, 'public'))).isDirectory()).toBe(true);
        expect(await createPreparationPublicDirectory(project))
            .toEqual({ error: 'public_directory_already_exists' });
        await writeFile(join(project, 'public', 'external.txt'), 'keep');
        expect(await deletePreparationPublicDirectory(project))
            .toEqual({ error: 'public_directory_not_empty' });
        expect(await readFile(join(project, 'public', 'external.txt'), 'utf8')).toBe('keep');
        await rm(join(project, 'public', 'external.txt'));
        expect(await deletePreparationPublicDirectory(project)).toEqual({ success: true });
        await expect(stat(join(project, 'public'))).rejects.toMatchObject({ code: 'ENOENT' });
        await mkdir(join(project, 'public'));
        expect(await deletePreparationPublicDirectory(project))
            .toEqual({ error: 'directory_not_recently_created_by_weblab' });
    } finally {
        await rm(project, { recursive: true, force: true });
    }
});

test('backup retention prunes completed writes but keeps unresolved conflicts', async () => {
    const backupRoot = await mkdtemp(join(tmpdir(), 'weblab-backup-retention-'));
    const successful = join(backupRoot, 'successful');
    const unresolved = join(backupRoot, 'unresolved');
    try {
        await mkdir(successful);
        await mkdir(unresolved);
        for (let i = 0; i < 102; i++) {
            await writeFile(join(successful, `${i}.backup`), 'old');
        }
        const conflict = join(unresolved, 'conflict.backup');
        await writeFile(conflict, 'external bytes');
        const newest = join(successful, '101.backup');
        await pruneSuccessfulBackups(successful, newest);
        expect((await readdir(successful)).length).toBe(100);
        expect(await readFile(newest, 'utf8')).toBe('old');
        expect(await readFile(conflict, 'utf8')).toBe('external bytes');
    } finally {
        await rm(backupRoot, { recursive: true, force: true });
    }
});

test('native guarded writes reject symlink traversal', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'weblab-local-outside-'));
    try {
        await symlink(outside, join(root, 'link'));
        await expect(rejectSymlinkPath(root, join(root, 'link', 'outside.txt'))).rejects.toThrow('symlink_path');
        const result = await writeIfUnchanged(root, 'link/outside.txt', 'unsafe', null);
        expect(result.error).toBe('symlink_path');
        await expect(readTextFile(root, 'link/outside.txt')).rejects.toThrow('symlink_path');
    } finally {
        await rm(outside, { recursive: true, force: true });
    }
});

test('native reads hash exact UTF-8 bytes and reject binary data', async () => {
    await writeFile(join(root, 'utf8.txt'), 'Hej 🌿');
    expect(await readTextFile(root, 'utf8.txt')).toEqual({
        content: 'Hej 🌿',
        sha256: hash('Hej 🌿'),
    });
    await writeFile(join(root, 'binary.dat'), Buffer.from([0x41, 0x00, 0x42]));
    expect(await readTextFile(root, 'binary.dat')).toEqual({ error: 'binary_file' });
    await writeFile(join(root, 'invalid.txt'), Buffer.from([0xc3, 0x28]));
    expect(await readTextFile(root, 'invalid.txt')).toEqual({ error: 'invalid_utf8' });
});

test('starting a project with missing dependencies does not install or run scripts', async () => {
    const project = await mkdtemp(join(tmpdir(), 'weblab-local-uninstalled-'));
    try {
        await writeFile(join(project, 'package.json'), JSON.stringify({
            scripts: { dev: 'node dev.js', postinstall: 'node postinstall.js' },
            dependencies: { example: '1.0.0' },
        }));
        const result = await startDevServer(project, null, 31847, () => null);
        expect(result.error).toContain('Install them in this project folder');
    } finally {
        await rm(project, { recursive: true, force: true });
    }
});

test('explicit static preview serves site files but denies project secrets and symlinks', async () => {
    const project = await mkdtemp(join(tmpdir(), 'weblab-static-preview-'));
    const outside = await mkdtemp(join(tmpdir(), 'weblab-static-outside-'));
    try {
        await writeFile(join(project, 'index.html'), '<html>Site</html>');
        await writeFile(join(project, 'about.html'), '<html>About</html>');
        await writeFile(join(project, 'site.css'), 'body { color: red; }');
        await writeFile(join(project, '.env'), 'SECRET=private');
        await writeFile(join(outside, 'outside.css'), 'outside');
        await symlink(join(outside, 'outside.css'), join(project, 'linked.css'));
        const started = await startDevServer(project, null, null, () => null);
        expect(started.error).toBeUndefined();
        const origin = `http://127.0.0.1:${started.port}`;
        expect(await (await fetch(origin)).text()).toBe('<html>Site</html>');
        expect(await (await fetch(`${origin}/about`)).text()).toBe('<html>About</html>');
        expect((await fetch(`${origin}/site.css`)).headers.get('content-type'))
            .toBe('text/css; charset=utf-8');
        await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'static' }));
        for (const path of ['/.env', '/package.json', '/linked.css']) {
            expect((await fetch(`${origin}${path}`)).status).toBe(404);
        }
        expect((await fetch(origin, { headers: { Host: 'untrusted.example' } })).status).toBe(403);
        expect(await stopDevServer(project)).toEqual({ success: true });
        const restarted = await startDevServer(project, null, started.port, () => null);
        expect(restarted.error).toBeUndefined();
        expect(await (await fetch(`http://127.0.0.1:${restarted.port}`)).text())
            .toBe('<html>Site</html>');
    } finally {
        await stopDevServer(project);
        await rm(project, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
    }
});

afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(join(tmpdir(), `weblab-local-grants-${process.pid}.json`), { force: true });
    for (const backup of backups) {
        if (backup) await rm(backup, { force: true });
    }
});
