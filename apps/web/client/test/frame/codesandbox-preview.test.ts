import { describe, expect, test } from 'bun:test';

import { isCodeSandboxPreviewUrl } from '@/app/project/[id]/_components/canvas/frame/codesandbox-preview';

describe('isCodeSandboxPreviewUrl', () => {
    test('returns true for csb.app preview urls', () => {
        expect(isCodeSandboxPreviewUrl('https://pqljl7-3000.csb.app/')).toBe(true);
    });

    test('returns false for non-csb preview urls', () => {
        expect(isCodeSandboxPreviewUrl('https://weblab.build/')).toBe(false);
    });

    test('returns false for invalid urls', () => {
        expect(isCodeSandboxPreviewUrl('not-a-url')).toBe(false);
    });
});
