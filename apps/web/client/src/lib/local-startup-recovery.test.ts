import { describe, expect, it } from 'vitest';

import {
    localStartupIssue,
    startupDiagnosisBranch,
    startupRecoveryPrompt,
} from './local-startup-recovery';

describe('local startup recovery', () => {
    it('recognizes the reported macOS binding failure and a mismatched port', () => {
        expect(localStartupIssue('library load disallowed by system policy')).toBe('nativeBinding');
        expect(localStartupIssue('Dev server did not bind port 4102')).toBe('port');
        expect(localStartupIssue('Local preview port 4102 is occupied')).toBe('port');
    });

    it('keeps raw startup output out of the CLI prompt', () => {
        const prompt = startupRecoveryPrompt(
            localStartupIssue('Cannot find module secret-module'),
            false,
            'branch-1',
        );
        expect(prompt).toContain('required dependency');
        expect(prompt).not.toContain('secret-module');
        expect(prompt).toContain('private working copy');
        expect(prompt).toContain('Wait for my approval');
        expect(startupDiagnosisBranch(prompt)).toBe('branch-1');
        expect(startupDiagnosisBranch('A regular message')).toBeNull();
    });
});
