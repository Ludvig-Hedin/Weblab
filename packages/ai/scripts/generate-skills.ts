#!/usr/bin/env bun
/**
 * Build-time codegen: scan <repoRoot>/skills/ and emit a typed TS module
 * that embeds every SKILL.md so production deployments don't need to ship
 * the skills/ directory or set WEBLAB_SKILLS_ROOT.
 *
 * Run from anywhere via `bun run generate:skills` (wired into the build
 * pipeline via prebuild in apps/web/client/package.json).
 *
 * Output: packages/ai/src/skills/embedded.ts
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

interface EmbeddedSkill {
    name: string;
    description: string;
    content: string;
}

function findRepoRoot(start: string): string | null {
    let current = resolve(start);
    for (let i = 0; i < 8; i++) {
        if (existsSync(join(current, 'skills'))) return current;
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return null;
}

function parseFrontmatter(raw: string): {
    name?: string;
    description?: string;
    body: string;
} {
    const match = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(raw);
    if (!match) return { body: raw };
    const frontmatter = match[1] ?? '';
    const body = match[2] ?? '';
    const out: { name?: string; description?: string } = {};
    for (const line of frontmatter.split('\n')) {
        const kv = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/.exec(line);
        if (!kv) continue;
        const key = kv[1];
        const value = kv[2] ?? '';
        const stripped = value.replace(/^['"]|['"]$/g, '');
        if (key === 'name') out.name = stripped;
        else if (key === 'description') out.description = stripped;
    }
    return { ...out, body };
}

async function discoverSkills(skillsRoot: string): Promise<EmbeddedSkill[]> {
    const out: EmbeddedSkill[] = [];

    const top = readdirSync(skillsRoot, { withFileTypes: true });
    for (const entry of top) {
        if (!entry.isDirectory()) continue;
        const dir = join(skillsRoot, entry.name);
        const skillMd = join(dir, 'SKILL.md');
        if (existsSync(skillMd)) {
            const skill = await readSkill(skillMd, entry.name);
            out.push(skill);
            continue;
        }
        // One level of nesting (skills/<group>/<slug>/SKILL.md).
        let inner: ReturnType<typeof readdirSync>;
        try {
            inner = readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const child of inner) {
            if (!child.isDirectory()) continue;
            const nested = join(dir, child.name, 'SKILL.md');
            if (existsSync(nested)) {
                const skill = await readSkill(nested, `${entry.name}/${child.name}`);
                out.push(skill);
            }
        }
    }

    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
}

async function readSkill(path: string, fallbackName: string): Promise<EmbeddedSkill> {
    const raw = await readFile(path, 'utf8');
    const { name, description, body } = parseFrontmatter(raw);
    return {
        name: name?.trim() || fallbackName,
        description: description?.trim() ?? '',
        content: body,
    };
}

function emit(skills: EmbeddedSkill[]): string {
    const generatedAt = new Date().toISOString();
    const header = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: <repoRoot>/skills/<name>/SKILL.md
 * Regenerate via \`bun run generate:skills\` from packages/ai.
 *
 * Generated at: ${generatedAt}
 * Skill count:  ${skills.length}
 */
import type { SkillInfo } from './types';

export const EMBEDDED_SKILLS: ReadonlyArray<SkillInfo> = ${JSON.stringify(
        skills.map((s) => ({
            name: s.name,
            description: s.description,
            content: s.content,
            location: `<embedded>/${s.name}/SKILL.md`,
        })),
        null,
        4,
    )};
`;
    return header;
}

function emitSummaries(skills: EmbeddedSkill[]): string {
    const generatedAt = new Date().toISOString();
    return `/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: <repoRoot>/skills/<name>/SKILL.md (frontmatter only).
 * Regenerate via \`bun run generate:skills\` from packages/ai.
 *
 * Client-safe: name + description ONLY — no skill bodies — so importing this
 * into the browser bundle (e.g. the Skills settings tab) does NOT ship the full
 * skill content, which can be hundreds of KB across all built-ins.
 *
 * Generated at: ${generatedAt}
 * Skill count:  ${skills.length}
 */
import type { SkillSummary } from './types';

export const EMBEDDED_SKILL_SUMMARIES: ReadonlyArray<SkillSummary> = ${JSON.stringify(
        skills.map((s) => ({ name: s.name, description: s.description })),
        null,
        4,
    )};
`;
}

async function main() {
    const startDir = resolve(import.meta.dir, '..', '..');
    const repoRoot = findRepoRoot(startDir);
    if (!repoRoot) {
        console.error('[generate-skills] Could not find a skills/ directory above', startDir);
        process.exit(1);
    }
    const skillsRoot = join(repoRoot, 'skills');
    const skills = await discoverSkills(skillsRoot);

    const outPath = resolve(import.meta.dir, '..', 'src', 'skills', 'embedded.ts');
    writeFileSync(outPath, emit(skills));

    const summariesPath = resolve(import.meta.dir, '..', 'src', 'skills', 'embedded-summaries.ts');
    writeFileSync(summariesPath, emitSummaries(skills));

    console.log(
        `[generate-skills] Wrote ${skills.length} skills to ${outPath} (+ client-safe summaries): ${skills
            .map((s) => s.name)
            .join(', ')}`,
    );
}

await main();
