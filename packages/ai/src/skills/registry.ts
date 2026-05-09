import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { SkillInfo, SkillSummary } from './types';
import { EMBEDDED_SKILLS } from './embedded';

declare global {
    var __weblabSkillsCache: { skills: SkillInfo[]; expiresAt: number } | undefined;
}

const SKILLS_CACHE_TTL_MS = 60 * 1000;

/**
 * Walk up from `process.cwd()` looking for a parent directory that contains
 * a `skills/` folder. Used in dev so editing a SKILL.md is reflected on the
 * next chat turn without re-running the codegen. Capped at 6 levels.
 */
function findSkillsRoot(): string | null {
    let current = resolve(process.cwd());
    for (let i = 0; i < 6; i++) {
        const candidate = join(current, 'skills');
        if (existsSync(candidate)) return candidate;
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return null;
}

/**
 * Parse YAML-ish frontmatter (`---` delimited) for a SKILL.md. We only
 * extract `name` and `description` — anything else is ignored. Returns the
 * stripped body alongside the parsed fields.
 */
function parseFrontmatter(raw: string): { name?: string; description?: string; body: string } {
    const match = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(raw);
    if (!match) {
        return { body: raw };
    }
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

async function readSkillFile(skillMdPath: string, fallbackName: string): Promise<SkillInfo> {
    const raw = await readFile(skillMdPath, 'utf8');
    const { name, description, body } = parseFrontmatter(raw);
    return {
        name: name?.trim() ?? fallbackName,
        description: description?.trim() ?? '',
        content: body,
        location: skillMdPath,
    };
}

async function loadFromFilesystem(): Promise<SkillInfo[] | null> {
    const root = findSkillsRoot();
    if (!root) return null;

    const skillFiles: Array<{ path: string; name: string }> = [];
    const topEntries = safeReaddir(root);
    for (const entry of topEntries) {
        if (!entry.isDirectory()) continue;
        const dir = join(root, entry.name);
        const skillMd = join(dir, 'SKILL.md');
        if (existsSync(skillMd)) {
            skillFiles.push({ path: skillMd, name: entry.name });
            continue;
        }
        // Nested group dir — scan one level deeper for SKILL.md.
        const inner = safeReaddir(dir);
        for (const child of inner) {
            if (!child.isDirectory()) continue;
            const nested = join(dir, child.name, 'SKILL.md');
            if (existsSync(nested)) {
                skillFiles.push({ path: nested, name: `${entry.name}/${child.name}` });
            }
        }
    }
    if (skillFiles.length === 0) return null;
    return Promise.all(skillFiles.map((f) => readSkillFile(f.path, f.name)));
}

/**
 * Discover Agent Skills.
 *
 * Resolution order:
 *  1. Filesystem walk above `process.cwd()` for a `skills/` directory.
 *     Used during local development so editing a SKILL.md is picked up
 *     on the next chat turn without re-running codegen.
 *  2. Compiled-in `EMBEDDED_SKILLS` produced by `bun run generate:skills`.
 *     This is the production fallback — Railway / any host that doesn't
 *     ship `skills/` outside the app bundle still gets the full set.
 *
 * Cached on globalThis with a 60s TTL so production chats don't re-walk
 * the filesystem on every turn.
 */
export async function loadSkills(): Promise<SkillInfo[]> {
    const cached = globalThis.__weblabSkillsCache;
    if (cached && cached.expiresAt > Date.now()) {
        return cached.skills;
    }

    const fromFs = await loadFromFilesystem().catch(() => null);
    const skills = fromFs ?? (EMBEDDED_SKILLS as SkillInfo[]);
    globalThis.__weblabSkillsCache = {
        skills,
        expiresAt: Date.now() + SKILLS_CACHE_TTL_MS,
    };
    return skills;
}

/** Test/dev helper to force a re-scan on the next call. */
export function invalidateSkillsCache(): void {
    globalThis.__weblabSkillsCache = undefined;
}

export async function loadSkillSummaries(): Promise<SkillSummary[]> {
    const skills = await loadSkills();
    return skills.map(({ name, description }) => ({ name, description }));
}

export async function loadSkillByName(name: string): Promise<SkillInfo | null> {
    const skills = await loadSkills();
    return skills.find((s) => s.name === name) ?? null;
}

function safeReaddir(path: string) {
    try {
        return readdirSync(path, { withFileTypes: true });
    } catch {
        return [];
    }
}
