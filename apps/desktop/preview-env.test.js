import { expect, test } from 'bun:test';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizePreviewEnv, projectDevEnvironment, readPreviewEnv, updatePreviewEnv } from './weblab-local.js';

test('preview keys reach the preview but never replace app-managed values', () => {
    const root = join(tmpdir(), 'weblab-preview-env-root');
    const env = projectDevEnvironment(root, 31847, null, { NEXT_PUBLIC_API_URL: 'https://test.example', API_TOKEN: 'test' });
    expect(env.NEXT_PUBLIC_API_URL).toBe('https://test.example');
    expect(env.API_TOKEN).toBe('test');
    expect(env.PORT).toBe('31847');
    expect(env.PATH).toContain(join(root, 'node_modules', '.bin'));
    for (const reserved of ['PATH', 'PORT', 'HOME', 'NODE_OPTIONS', 'BUN_INSTALL', 'DYLD_INSERT_LIBRARIES', 'GIT_DIR', 'WEBLAB_ANYTHING', 'node_options']) {
        expect(() => projectDevEnvironment(root, 31847, null, { [reserved]: 'x' })).toThrow('managed by the app');
    }
});

test('preview key names and values are validated', () => {
    expect(normalizePreviewEnv({ A_1: '', _b: 'value with spaces' })).toEqual({ A_1: '', _b: 'value with spaces' });
    for (const bad of [null, [], 'text', { 'a-b': '1' }, { '1A': '1' }, { A: 1 }, { A: 'two\nlines' }, { A: 'x'.repeat(4097) },
        Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`KEY_${index}`, 'x']))]) {
        expect(() => normalizePreviewEnv(bad)).toThrow();
    }
});

test('preview keys are stored privately beside the copy and updated by name', async () => {
    const container = await mkdtemp(join(tmpdir(), 'weblab-preview-env-'));
    try {
        expect(await readPreviewEnv(container)).toEqual({});
        expect(await updatePreviewEnv(container, { set: { B: '2', A: '1' } })).toEqual(['A', 'B']);
        expect((await stat(join(container, 'preview-env.json'))).mode & 0o077).toBe(0);
        expect(await updatePreviewEnv(container, { set: { A: 'changed' }, remove: ['B', 'MISSING'] })).toEqual(['A']);
        expect(await readPreviewEnv(container)).toEqual({ A: 'changed' });
        await expect(updatePreviewEnv(container, { set: { PATH: '/tmp' } })).rejects.toThrow('managed by the app');
        expect(JSON.parse(await readFile(join(container, 'preview-env.json'), 'utf8'))).toEqual({ A: 'changed' });

        // A file other users could read, or one edited into an invalid shape, is refused.
        await chmod(join(container, 'preview-env.json'), 0o644);
        await expect(readPreviewEnv(container)).rejects.toThrow('unsafe');
        await chmod(join(container, 'preview-env.json'), 0o600);
        await writeFile(join(container, 'preview-env.json'), JSON.stringify({ NODE_OPTIONS: '--inspect' }));
        await expect(readPreviewEnv(container)).rejects.toThrow('managed by the app');
    } finally {
        await rm(container, { recursive: true, force: true });
    }
});
