import { describe, expect, test } from 'bun:test';

import { sanitizeCommand } from '../../src/agents/terminal-command.ts';

describe('sanitizeCommand', () => {
    test('returns a plain command unchanged', () => {
        expect(sanitizeCommand('bun add three')).toBe('bun add three');
    });

    test('trims surrounding whitespace', () => {
        expect(sanitizeCommand('   ls -la   ')).toBe('ls -la');
    });

    test('strips a single-line fenced block', () => {
        expect(sanitizeCommand('```bash\nbun install\n```')).toBe('bun install');
    });

    test('strips a fenced block with no language', () => {
        expect(sanitizeCommand('```\nnpm run dev\n```')).toBe('npm run dev');
    });

    test('collapses a multi-line fenced block to the first command line', () => {
        expect(sanitizeCommand('```sh\ncd app\nbun dev\n```')).toBe('cd app');
    });

    test('strips a leading "$ " prompt sigil', () => {
        expect(sanitizeCommand('$ git status')).toBe('git status');
    });

    test('strips a leading "# " prompt sigil', () => {
        expect(sanitizeCommand('# whoami')).toBe('whoami');
    });

    test('strips wrapping backticks', () => {
        expect(sanitizeCommand('`echo hi`')).toBe('echo hi');
    });

    test('picks the first non-empty line when not fenced', () => {
        expect(sanitizeCommand('\n\nbun run build\nextra noise')).toBe('bun run build');
    });

    test('returns empty string for empty input', () => {
        expect(sanitizeCommand('')).toBe('');
        expect(sanitizeCommand('   \n  ')).toBe('');
    });

    test('preserves chained commands on one line', () => {
        expect(sanitizeCommand('bun install && bun run dev')).toBe('bun install && bun run dev');
    });

    test('does not strip an inner "#" that is not a prompt sigil', () => {
        // Only a leading "# " (with space) is treated as a sigil; a comment-ish
        // token mid-command stays intact.
        expect(sanitizeCommand('grep "#fff" styles.css')).toBe('grep "#fff" styles.css');
    });
});
