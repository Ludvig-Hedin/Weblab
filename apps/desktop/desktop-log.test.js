import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatLine, installDesktopLog } from './desktop-log.js';

test('log lines are single-line, bounded and hide sign-in tickets', () => {
    const line = formatLine('error', ['load failed', 'weblab://auth/handoff?ticket=abc123&state=xyz', new Error('boom')],
        new Date('2026-10-05T10:00:00Z'));
    expect(line.startsWith('2026-10-05T10:00:00.000Z error load failed ')).toBe(true);
    expect(line).toContain('ticket=[redacted]&state=[redacted]');
    expect(line).not.toContain('abc123');
    expect(line.trimEnd().includes('\n')).toBe(false);
    expect(formatLine('info', ['x'.repeat(5000)]).length).toBeLessThan(2100);
});

test('console output is mirrored to a private file and rotated once', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'weblab-desktop-log-'));
    const seen = [];
    const target = { log: (...v) => seen.push(v), warn: (...v) => seen.push(v), error: (...v) => seen.push(v) };
    try {
        const file = installDesktopLog(join(directory, 'logs'), target);
        target.log('[main] started');
        target.error('[renderer:error] page.js:1 failed');
        expect(seen.length).toBe(2);
        const text = await readFile(file, 'utf8');
        expect(text).toContain(' info [main] started\n');
        expect(text).toContain(' error [renderer:error] page.js:1 failed\n');
        expect((await stat(file)).mode & 0o077).toBe(0);

        await writeFile(file, 'x'.repeat(1024 * 1024));
        const second = { log() {}, warn() {}, error() {} };
        installDesktopLog(join(directory, 'logs'), second);
        second.warn('after rotation');
        expect((await stat(join(directory, 'logs', 'main.old.log'))).size).toBe(1024 * 1024);
        expect(await readFile(file, 'utf8')).toContain(' warn after rotation\n');
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('an unusable folder leaves console logging untouched', () => {
    const target = { log() {}, warn() {}, error() {} };
    const original = target.log;
    expect(installDesktopLog('/dev/null/not-a-folder', target)).toBe(null);
    expect(target.log).toBe(original);
});
