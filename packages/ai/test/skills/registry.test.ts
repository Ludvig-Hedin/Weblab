import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { invalidateSkillsCache, loadSkillByName, loadSkills } from '../../src/skills/registry';

describe('skills/registry', () => {
    let root: string;
    let prevEnv: string | undefined;

    beforeEach(() => {
        prevEnv = process.env.WEBLAB_SKILLS_ROOT;
        const tmp = mkdtempSync(join(tmpdir(), 'weblab-skills-'));
        root = join(tmp, 'skills');
        mkdirSync(root, { recursive: true });
        process.env.WEBLAB_SKILLS_ROOT = root;
        invalidateSkillsCache();
    });

    afterEach(() => {
        if (prevEnv === undefined) delete process.env.WEBLAB_SKILLS_ROOT;
        else process.env.WEBLAB_SKILLS_ROOT = prevEnv;
        invalidateSkillsCache();
        try {
            rmSync(root, { recursive: true, force: true });
        } catch {
            // best-effort
        }
    });

    test('loads a flat skill', async () => {
        const dir = join(root, 'my-skill');
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            join(dir, 'SKILL.md'),
            '---\nname: my-skill\ndescription: Does the thing.\n---\n\nBody content.\n',
        );

        const skills = await loadSkills();
        expect(skills).toHaveLength(1);
        expect(skills[0]!.name).toBe('my-skill');
        expect(skills[0]!.description).toBe('Does the thing.');
        expect(skills[0]!.content).toContain('Body content.');
    });

    test('falls back to directory name when frontmatter missing', async () => {
        const dir = join(root, 'no-frontmatter');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'SKILL.md'), 'Just body, no frontmatter.\n');

        const skills = await loadSkills();
        expect(skills).toHaveLength(1);
        expect(skills[0]!.name).toBe('no-frontmatter');
        expect(skills[0]!.description).toBe('');
    });

    test('strips quoted values in frontmatter', async () => {
        const dir = join(root, 'quoted');
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            join(dir, 'SKILL.md'),
            '---\nname: "Quoted Name"\ndescription: \'Single quoted desc\'\n---\nbody\n',
        );

        const skills = await loadSkills();
        expect(skills).toHaveLength(1);
        expect(skills[0]!.name).toBe('Quoted Name');
        expect(skills[0]!.description).toBe('Single quoted desc');
    });

    test('discovers nested skills (one level)', async () => {
        const dir = join(root, 'group', 'inner');
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            join(dir, 'SKILL.md'),
            '---\nname: group/inner\ndescription: Nested skill.\n---\nbody\n',
        );

        const skills = await loadSkills();
        expect(skills).toHaveLength(1);
        expect(skills[0]!.name).toBe('group/inner');
    });

    test('loadSkillByName returns null for unknown', async () => {
        const dir = join(root, 'one');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'SKILL.md'), '---\nname: one\ndescription: a\n---\nbody');
        expect(await loadSkillByName('does-not-exist')).toBeNull();
        const got = await loadSkillByName('one');
        expect(got?.name).toBe('one');
    });

    test('returns empty array when skills root does not exist', async () => {
        process.env.WEBLAB_SKILLS_ROOT = join(root, 'definitely-missing-' + Date.now());
        invalidateSkillsCache();
        const skills = await loadSkills();
        expect(skills).toEqual([]);
    });
});
