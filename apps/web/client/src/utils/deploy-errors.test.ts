import { describe, expect, it } from 'bun:test';

import { parseDeploymentError } from './deploy-errors';

describe('parseDeploymentError', () => {
    it('returns a generic message when given empty input', () => {
        expect(parseDeploymentError('').message).toBe('Deployment failed.');
        expect(parseDeploymentError(null).message).toBe('Deployment failed.');
        expect(parseDeploymentError(undefined).message).toBe('Deployment failed.');
    });

    it('strips ANSI escape codes from the raw log', () => {
        const ansi = '[31merror[0m: something broke';
        const parsed = parseDeploymentError(ansi);
        expect(parsed.rawLog).not.toContain('');
        expect(parsed.rawLog).toContain('something broke');
    });

    it('detects missing env vars', () => {
        const parsed = parseDeploymentError('Missing required environment variable: DATABASE_URL');
        expect(parsed.message).toMatch(/environment variable/i);
        expect(parsed.suggestion).toContain('Environment variables');
    });

    it('detects build script failures', () => {
        const parsed = parseDeploymentError('npm run build failed with exit code 1');
        expect(parsed.message).toBe('Build script failed.');
        expect(parsed.suggestion).toContain('build log');
    });

    it('detects missing modules', () => {
        const parsed = parseDeploymentError("Error: Cannot find module 'react'");
        expect(parsed.message).toContain('package is missing');
    });

    it('detects auth failures from any provider', () => {
        for (const raw of ['401 Unauthorized', 'HTTP 403 Forbidden', 'Invalid API key']) {
            const parsed = parseDeploymentError(raw);
            expect(parsed.message).toContain('rejected your credentials');
            expect(parsed.suggestion).toContain('Reconnect');
        }
    });

    it('detects timeouts and rate limits', () => {
        expect(parseDeploymentError('Build timed out after 600s').message).toContain('timed out');
        expect(parseDeploymentError('429 Too Many Requests').message).toContain('rate limit');
    });

    it('falls back to the first non-empty line when no pattern matches', () => {
        const parsed = parseDeploymentError('\n\nSomething weird happened\nand then more text');
        expect(parsed.message).toBe('Something weird happened');
        expect(parsed.suggestion).toBeUndefined();
    });

    it('truncates very long fallback messages', () => {
        const long = 'x'.repeat(500);
        const parsed = parseDeploymentError(long);
        expect(parsed.message.length).toBeLessThanOrEqual(201);
        expect(parsed.message.endsWith('…')).toBe(true);
    });
});
