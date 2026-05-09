import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { invalidateSkillsCache, loadSkillByName, loadSkills } from '../../src/skills/registry';

describe('skills/registry', () => {
    let tmpRoot: string;
    let prevCwd: string;

    beforeEach(() => {
        // Create an isolated repo-like layout: <tmp>/skills/<name>/SKILL.md
        // and chdir into it so findSkillsRoot picks our fixtures rather than
        // the real repo's skills/ dir.
        tmpRoot = mkdtempSync(join(tmpdir(), 'weblab-skills-'));
        mkdirSync(join(tmpRoot, 'skills'), { recursive: true });
        prevCwd = process.cwd();
        process.chdir(tmpRoot);
        invalidateSkillsCache();
    });

    afterEach(() => {
        process.chdir(prevCwd);
        invalidateSkillsCache();
        try {
            rmSync(tmpRoot, { recursive: true, force: true });
        } catch {
            // best-effort
        }
    });

    test('loads a flat skill from filesystem', async () => {
        const dir = join(tmpRoot, 'skills', 'my-skill');
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            join(dir, 'SKILL.md'),
            '---\nname: my-skill\ndescription: Does the thing.\n---\n\nBody content.\n',
        );

        const skills = await loadSkills();
        const mine = skills.find((s) => s.name === 'my-skill');
        expect(mine).toBeDefined();
        expect(mine!.description).toBe('Does the thing.');
        expect(mine!.content).toContain('Body content.');
    });

    test('falls back to directory name when frontmatter missing', async () => {
        const dir = join(tmpRoot, 'skills', 'no-frontmatter');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'SKILL.md'), 'Just body, no frontmatter.\n');

        const skills = await loadSkills();
        const found = skills.find((s) => s.name === 'no-frontmatter');
        expect(found).toBeDefined();
        expect(found!.description).toBe('');
    });

    test('strips quoted values in frontmatter', async () => {
        const dir = join(tmpRoot, 'skills', 'quoted');
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            join(dir, 'SKILL.md'),
            '---\nname: "Quoted Name"\ndescription: \'Single quoted desc\'\n---\nbody\n',
        );

        const skills = await loadSkills();
        const found = skills.find((s) => s.name === 'Quoted Name');
        expect(found).toBeDefined();
        expect(found!.description).toBe('Single quoted desc');
    });

    test('discovers nested skills (one level)', async () => {
        const dir = join(tmpRoot, 'skills', 'group', 'inner');
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            join(dir, 'SKILL.md'),
            '---\nname: group/inner\ndescription: Nested skill.\n---\nbody\n',
        );

        const skills = await loadSkills();
        const found = skills.find((s) => s.name === 'group/inner');
        expect(found).toBeDefined();
    });

    test('loadSkillByName returns null for unknown', async () => {
        const dir = join(tmpRoot, 'skills', 'one');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'SKILL.md'), '---\nname: one\ndescription: a\n---\nbody');
        expect(await loadSkillByName('does-not-exist-' + Date.now())).toBeNull();
        const got = await loadSkillByName('one');
        expect(got?.name).toBe('one');
    });

    test('falls back to embedded skills when filesystem walk finds nothing', async () => {
        // chdir to a freshly-made directory with no skills/ ancestor — should
        // fall through to EMBEDDED_SKILLS instead of returning empty.
        const noSkillsDir = mkdtempSync(join(tmpdir(), 'weblab-no-skills-'));
        process.chdir(noSkillsDir);
        invalidateSkillsCache();

        try {
            const skills = await loadSkills();
            expect(skills.length).toBeGreaterThan(0);
            const names = skills.map((s) => s.name);
            // Embedded set ships with these four; if codegen drops any, this
            // is the right place to learn about it.
            expect(names).toContain('seo');
        } finally {
            try {
                rmSync(noSkillsDir, { recursive: true, force: true });
            } catch {
                // best-effort
            }
        }
    });
});
