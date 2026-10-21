import { describe, expect, it } from 'bun:test';

import { canResumeCliSession } from './session';

const stored = {
    provider: 'claude-code',
    sessionId: 'sess-1234abcd',
    workingDirectory: '/copies/abc/project',
    lastAssistantMessageId: 'claude-stream-1',
};

const messages = [
    { id: 'u1', role: 'user' },
    { id: 'claude-stream-1', role: 'assistant' },
    { id: 'u2', role: 'user' },
];

describe('canResumeCliSession', () => {
    it('resumes when the previous reply came from the stored session', () => {
        expect(
            canResumeCliSession(stored, {
                provider: 'claude-code',
                workingDirectory: '/copies/abc/project',
                messages,
            }),
        ).toBe(true);
    });

    it('falls back to the transcript after a different model replied', () => {
        expect(
            canResumeCliSession(stored, {
                provider: 'claude-code',
                workingDirectory: '/copies/abc/project',
                messages: [...messages.slice(0, 2), { id: 'cloud-9', role: 'assistant' }, { id: 'u3', role: 'user' }],
            }),
        ).toBe(false);
    });

    it('never resumes across providers or folders', () => {
        expect(
            canResumeCliSession(stored, { provider: 'codex', workingDirectory: '/copies/abc/project', messages }),
        ).toBe(false);
        expect(
            canResumeCliSession(stored, { provider: 'claude-code', workingDirectory: '/other', messages }),
        ).toBe(false);
    });

    it('does not resume without a stored session', () => {
        expect(
            canResumeCliSession(null, { provider: 'claude-code', workingDirectory: '/x', messages }),
        ).toBe(false);
    });
});
