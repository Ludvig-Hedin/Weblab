import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeIfUnchanged } from './weblab-local.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const jsx = 'export function Hero() { return <h1 className={styles.title}>Title</h1>; }';
const css = '.title { color: #fff; }';
let root;
let backups;
beforeEach(async () => {
    root = await fsp.realpath(await fsp.mkdtemp(join(tmpdir(), 'weblab-read-dependencies-')));
    backups = [];
    await fsp.writeFile(join(root, 'hero.tsx'), jsx);
    await fsp.writeFile(join(root, 'hero.module.css'), css);
});
afterEach(async () => {
    for (const backup of backups) await fsp.rm(backup, { force: true });
    await fsp.rm(root, { recursive: true, force: true });
});
const dependencies = () => [{ path: 'hero.tsx', sha256: hash(jsx) }];
async function save(pins = dependencies()) {
    const result = await writeIfUnchanged(root, 'hero.module.css', '.title { color: #000; }', hash(css), pins);
    if (result.recoveryPath) backups.push(result.recoveryPath);
    return result;
}

test('saves CSS only while its unchanged JSX read dependency still matches', async () => {
    expect(await save()).toMatchObject({ success: true });
    expect(await fsp.readFile(join(root, 'hero.tsx'), 'utf8')).toBe(jsx);
    expect(await fsp.readFile(join(root, 'hero.module.css'), 'utf8')).toBe('.title { color: #000; }');
});

test('refuses a dependency changed before native admission', async () => {
    await fsp.writeFile(join(root, 'hero.tsx'), jsx + '\n// Changed');
    expect(await save()).toMatchObject({ error: 'write_dependency_changed' });
    expect(await fsp.readFile(join(root, 'hero.module.css'), 'utf8')).toBe(css);
});

test('rechecks disk-only JSX drift after preparing the CSS temporary file', async () => {
    const open = fsp.open;
    let changed = false;
    const spy = spyOn(fsp, 'open').mockImplementation(async (...args) => {
        if (!changed && typeof args[0] === 'string' && args[0].startsWith(join(root, '.weblab-'))) {
            changed = true;
            await fsp.writeFile(join(root, 'hero.tsx'), jsx + '\n// Changed without a watcher event');
        }
        return open(...args);
    });
    try {
        expect(await save()).toMatchObject({ error: 'write_dependency_changed' });
        expect(changed).toBe(true);
        expect(await fsp.readFile(join(root, 'hero.module.css'), 'utf8')).toBe(css);
    } finally { spy.mockRestore(); }
});

test('rejects escaped paths, duplicate targets, extra fields and unbounded dependencies', async () => {
    for (const pins of [
        [{ path: '../escape.tsx', sha256: hash(jsx) }],
        [{ path: 'hero.module.css', sha256: hash(css) }],
        [{ ...dependencies()[0], extra: true }],
        [{ path: 'hero.tsx', sha256: hash(jsx) + '\n' }],
        Array.from({ length: 9 }, () => dependencies()[0]),
    ]) {
        expect((await save(pins)).success).not.toBe(true);
        expect(await fsp.readFile(join(root, 'hero.module.css'), 'utf8')).toBe(css);
    }
});
