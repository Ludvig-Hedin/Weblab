import { describe, expect, it } from 'bun:test';

import { sanitizeReasoningText } from './sanitize-reasoning';

describe('sanitizeReasoningText', () => {
    it('passes normal reasoning through unchanged', () => {
        expect(sanitizeReasoningText('Thinking about layout.\n\nNext: hero section.')).toBe(
            'Thinking about layout.\n\nNext: hero section.',
        );
    });

    it('strips a trailing [REDACTED] provider marker', () => {
        expect(sanitizeReasoningText('Planning the page structure.\n\n[REDACTED]')).toBe(
            'Planning the page structure.',
        );
    });

    it('returns empty string for fully redacted reasoning', () => {
        expect(sanitizeReasoningText('[REDACTED]')).toBe('');
        expect(sanitizeReasoningText('[REDACTED]\n\n[REDACTED]')).toBe('');
    });

    it('collapses the blank gap left by an inline marker', () => {
        expect(sanitizeReasoningText('Start.\n\n[REDACTED]\n\nEnd.')).toBe('Start.\n\nEnd.');
    });
});
