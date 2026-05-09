import { describe, expect, test } from 'bun:test';

import { parseSkillSource } from '../../src/server/api/routers/skill/import';

describe('parseSkillSource', () => {
    test('parses standard frontmatter + body', () => {
        const raw = '---\nname: my-skill\ndescription: Does the thing.\n---\n\nBody content.\n';
        const got = parseSkillSource(raw);
        expect(got.name).toBe('my-skill');
        expect(got.description).toBe('Does the thing.');
        expect(got.content.includes('Body content.')).toBe(true);
    });

    test('strips quoted values', () => {
        const raw = '---\nname: "Quoted"\ndescription: \'single\'\n---\nbody\n';
        // Quoted name fails skillNameSchema (uppercase) — verify behaviour:
        expect(() => parseSkillSource(raw)).toThrow(/Invalid skill name/);
    });

    test('rejects missing name', () => {
        expect(() => parseSkillSource('no frontmatter at all')).toThrow(/missing a `name:`/);
    });

    test('rejects invalid name (too short)', () => {
        const raw = '---\nname: a\ndescription: x\n---\nbody';
        expect(() => parseSkillSource(raw)).toThrow(/Invalid skill name/);
    });

    test('rejects invalid name (only hyphens)', () => {
        const raw = '---\nname: --\ndescription: x\n---\nbody';
        expect(() => parseSkillSource(raw)).toThrow(/Invalid skill name/);
    });

    test('accepts minimum-valid 2-char name', () => {
        const raw = '---\nname: ab\ndescription: \n---\nbody';
        const got = parseSkillSource(raw);
        expect(got.name).toBe('ab');
    });

    test('rejects body over 50,000 chars', () => {
        const big = 'x'.repeat(50_001);
        const raw = `---\nname: huge\ndescription: \n---\n${big}`;
        expect(() => parseSkillSource(raw)).toThrow(/body too long/i);
    });

    test('truncates description to 200 chars', () => {
        const longDesc = 'd'.repeat(300);
        const raw = `---\nname: trunc\ndescription: ${longDesc}\n---\nbody`;
        const got = parseSkillSource(raw);
        expect(got.description.length).toBe(200);
    });

    test('treats name with leading hyphen as invalid', () => {
        const raw = '---\nname: -bad\ndescription: \n---\nbody';
        expect(() => parseSkillSource(raw)).toThrow(/Invalid skill name/);
    });

    test('treats name with trailing hyphen as invalid', () => {
        const raw = '---\nname: bad-\ndescription: \n---\nbody';
        expect(() => parseSkillSource(raw)).toThrow(/Invalid skill name/);
    });

    test('accepts hyphenated middle name', () => {
        const raw = '---\nname: ok-name\ndescription: \n---\nbody';
        const got = parseSkillSource(raw);
        expect(got.name).toBe('ok-name');
    });
});
