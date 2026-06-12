import { describe, expect, it } from 'bun:test';

import {
    createTestProjectInputSchema,
    getProjectInputSchema,
    healthInputSchema,
    projectStatusSchema,
} from './schemas.js';

describe('tool input schemas', () => {
    it('healthInputSchema accepts empty object', () => {
        expect(healthInputSchema.safeParse({}).success).toBe(true);
    });

    it('getProjectInputSchema requires a non-empty projectId', () => {
        expect(getProjectInputSchema.safeParse({ projectId: 'abc123' }).success).toBe(true);
        expect(getProjectInputSchema.safeParse({ projectId: '' }).success).toBe(false);
        expect(getProjectInputSchema.safeParse({}).success).toBe(false);
    });

    it('createTestProjectInputSchema enforces the confirm gate', () => {
        // Missing confirm → rejected (cannot invoke write path implicitly).
        expect(createTestProjectInputSchema.safeParse({}).success).toBe(false);
        // confirm:false → rejected (must explicitly opt in).
        expect(createTestProjectInputSchema.safeParse({ confirm: false }).success).toBe(false);
        // confirm:true → accepted.
        expect(createTestProjectInputSchema.safeParse({ confirm: true }).success).toBe(true);
        // optional name + valid framework.
        expect(
            createTestProjectInputSchema.safeParse({
                confirm: true,
                name: 'demo',
                framework: 'nextjs',
            }).success,
        ).toBe(true);
        // invalid framework → rejected.
        expect(
            createTestProjectInputSchema.safeParse({ confirm: true, framework: 'svelte' }).success,
        ).toBe(false);
    });
});

describe('response schemas', () => {
    it('projectStatusSchema rejects an invalid provisioning state', () => {
        const ok = projectStatusSchema.safeParse({
            provisioning: 'ready',
            previewUrl: 'https://x.vercel.run',
            sandboxId: 'sb_1',
            provisioningError: null,
            latestDeployment: null,
        });
        expect(ok.success).toBe(true);

        const bad = projectStatusSchema.safeParse({
            provisioning: 'exploded',
            previewUrl: null,
            sandboxId: null,
            provisioningError: null,
            latestDeployment: null,
        });
        expect(bad.success).toBe(false);
    });
});
