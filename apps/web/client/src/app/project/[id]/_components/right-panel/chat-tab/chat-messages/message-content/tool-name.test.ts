import { describe, expect, it } from 'bun:test';

import { getToolNameFromPart } from './tool-name';

describe('getToolNameFromPart', () => {
    it('strips the leading tool- prefix', () => {
        expect(getToolNameFromPart({ type: 'tool-ask_user_question' })).toBe('ask_user_question');
    });

    it('preserves hyphens in the tool name (old split("-")[1] truncated these)', () => {
        expect(getToolNameFromPart({ type: 'tool-search-replace-edit' })).toBe(
            'search-replace-edit',
        );
    });

    it('reads a dynamic-tool name from toolName (old code returned "tool")', () => {
        expect(getToolNameFromPart({ type: 'dynamic-tool', toolName: 'my_tool' })).toBe('my_tool');
        expect(getToolNameFromPart({ type: 'dynamic-tool' })).toBe('');
    });

    it('returns empty string for non-tool parts', () => {
        expect(getToolNameFromPart({ type: 'text' })).toBe('');
        expect(getToolNameFromPart({ type: 'reasoning' })).toBe('');
    });
});
