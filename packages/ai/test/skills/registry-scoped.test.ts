import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { invalidateSkillsCache, loadSkillByName, loadSkills } from '../../src/skills/registry';

interface DbSkill {
    id: string;
    userId: string;
    projectId: string | null;
    name: string;
    description: string;
    content: string;
    enabled: boolean;
}

function makeMockCaller(rows: DbSkill[], opts?: { throws?: boolean }) {
    return {
        skills: {
            list: {
                query: async (_input: unknown) => {
                    if (opts?.throws) {
                        throw new Error('forced failure');
                    }
                    return rows;
                },
            },
        },
    };
}

describe('loadSkills with scope', () => {
    let tmpDir: string;
    let prevCwd: string;

    beforeEach(() => {
        // Move to a temp dir so the filesystem walk finds nothing — keeps
        // the embedded set as the only "non-DB" source.
        tmpDir = mkdtempSync(join(tmpdir(), 'weblab-scoped-skills-'));
        prevCwd = process.cwd();
        process.chdir(tmpDir);
        invalidateSkillsCache();
    });

    afterEach(() => {
        process.chdir(prevCwd);
        invalidateSkillsCache();
        try {
            rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // best-effort
        }
    });

    test('returns embedded skills when no scope provided', async () => {
        const skills = await loadSkills();
        expect(skills.length).toBeGreaterThan(0);
        const names = skills.map((s) => s.name);
        expect(names).toContain('seo');
    });

    test('user-global DB skill overrides embedded same-named skill', async () => {
        const caller = makeMockCaller([
            {
                id: '00000000-0000-0000-0000-000000000001',
                userId: 'user-1',
                projectId: null,
                name: 'seo',
                description: 'My custom SEO',
                content: 'CUSTOM SEO BODY',
                enabled: true,
            },
        ]);
        const skills = await loadSkills({ userId: 'user-1', trpcCaller: caller });
        const seo = skills.find((s) => s.name === 'seo');
        expect(seo).toBeDefined();
        expect(seo!.content).toBe('CUSTOM SEO BODY');
        expect(seo!.description).toBe('My custom SEO');
    });

    test('project-scoped DB skill overrides user-global same-named skill', async () => {
        const caller = makeMockCaller([
            {
                id: '00000000-0000-0000-0000-000000000001',
                userId: 'user-1',
                projectId: null,
                name: 'seo',
                description: 'global SEO',
                content: 'GLOBAL',
                enabled: true,
            },
            {
                id: '00000000-0000-0000-0000-000000000002',
                userId: 'user-1',
                projectId: 'project-A',
                name: 'seo',
                description: 'project SEO',
                content: 'PROJECT-A',
                enabled: true,
            },
        ]);
        const skills = await loadSkills({
            userId: 'user-1',
            projectId: 'project-A',
            trpcCaller: caller,
        });
        const seo = skills.find((s) => s.name === 'seo');
        expect(seo).toBeDefined();
        expect(seo!.content).toBe('PROJECT-A');
    });

    test('disabled DB skills are skipped', async () => {
        const caller = makeMockCaller([
            {
                id: '00000000-0000-0000-0000-000000000001',
                userId: 'user-1',
                projectId: null,
                name: 'seo',
                description: 'disabled',
                content: 'SHOULD-NOT-APPEAR',
                enabled: false,
            },
        ]);
        const skills = await loadSkills({ userId: 'user-1', trpcCaller: caller });
        const seo = skills.find((s) => s.name === 'seo');
        // Falls back to embedded (disabled DB row ignored).
        expect(seo).toBeDefined();
        expect(seo!.content).not.toBe('SHOULD-NOT-APPEAR');
    });

    test('falls back to embedded when DB caller throws', async () => {
        const caller = makeMockCaller([], { throws: true });
        const skills = await loadSkills({ userId: 'user-1', trpcCaller: caller });
        // Embedded set still resolves so the chat keeps working.
        expect(skills.length).toBeGreaterThan(0);
        expect(skills.find((s) => s.name === 'seo')).toBeDefined();
    });

    test('per-scope cache isolates users', async () => {
        const callerA = makeMockCaller([
            {
                id: '11111111-1111-1111-1111-111111111111',
                userId: 'user-A',
                projectId: null,
                name: 'a-only',
                description: '',
                content: 'A',
                enabled: true,
            },
        ]);
        const callerB = makeMockCaller([
            {
                id: '22222222-2222-2222-2222-222222222222',
                userId: 'user-B',
                projectId: null,
                name: 'b-only',
                description: '',
                content: 'B',
                enabled: true,
            },
        ]);

        const fromA = await loadSkills({ userId: 'user-A', trpcCaller: callerA });
        const fromB = await loadSkills({ userId: 'user-B', trpcCaller: callerB });

        expect(fromA.find((s) => s.name === 'a-only')).toBeDefined();
        expect(fromA.find((s) => s.name === 'b-only')).toBeUndefined();
        expect(fromB.find((s) => s.name === 'b-only')).toBeDefined();
        expect(fromB.find((s) => s.name === 'a-only')).toBeUndefined();
    });

    test('loadSkillByName respects scope', async () => {
        const caller = makeMockCaller([
            {
                id: '00000000-0000-0000-0000-000000000099',
                userId: 'user-1',
                projectId: null,
                name: 'custom',
                description: '',
                content: 'CUSTOM',
                enabled: true,
            },
        ]);
        const got = await loadSkillByName('custom', { userId: 'user-1', trpcCaller: caller });
        expect(got).not.toBeNull();
        expect(got!.content).toBe('CUSTOM');
    });
});
