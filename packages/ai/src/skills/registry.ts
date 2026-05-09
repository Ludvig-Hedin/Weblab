import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { SkillInfo, SkillSummary } from './types';

declare global {
    var __weblabSkillsCache: { skills: SkillInfo[]; expiresAt: number } | undefined;
}

const SKILLS_CACHE_TTL_MS = 60 * 1000;

let warnedMissingSkillsRoot = false;

/**
 * Resolve the root `skills/` directory. Order:
 *  1. `WEBLAB_SKILLS_ROOT` env var — explicit override (use this in
 *     production deployments where only `apps/web/client` is shipped).
 *  2. Walk up from `process.cwd()` looking for a `skills/` sibling. Capped
 *     at 6 levels.
 *
 * Returns null if no candidate exists. Logs a one-shot warning on the first
 * miss so silent prod regressions are visible in logs.
 */
function findSkillsRoot(): string | null {
    const override = process.env.WEBLAB_SKILLS_ROOT;
    if (override) {
        if (existsSync(override)) return override;
        if (!warnedMissingSkillsRoot) {
            console.warn(
                `[skills] WEBLAB_SKILLS_ROOT is set to "${override}" but the directory does not exist`,
            );
            warnedMissingSkillsRoot = true;
        }
        return null;
    }

    let current = resolve(process.cwd());
    for (let i = 0; i < 6; i++) {
        const candidate = join(current, 'skills');
        if (existsSync(candidate)) return candidate;
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
    }

    if (!warnedMissingSkillsRoot) {
        console.warn(
            `[skills] No skills/ directory found above cwd "${process.cwd()}". Set WEBLAB_SKILLS_ROOT to enable Agent Skills in this environment.`,
        );
        warnedMissingSkillsRoot = true;
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

/**
 * Discover skill folders under `<repoRoot>/skills/`. Two layouts supported:
 *   skills/<slug>/SKILL.md           (flat)
 *   skills/<group>/<slug>/SKILL.md   (one level of grouping)
 *
 * Cached on globalThis with a 60s TTL — production chats fire many turns
 * per minute and re-walking the filesystem each time is wasteful. Cache is
 * shared across module re-imports so dev hot-reload doesn't double-scan.
 *
 * Always returns an array (empty when the skills root does not exist).
 */
export async function loadSkills(): Promise<SkillInfo[]> {
    const cached = globalThis.__weblabSkillsCache;
    if (cached && cached.expiresAt > Date.now()) {
        return cached.skills;
    }

    const root = findSkillsRoot();
    if (!root) {
        globalThis.__weblabSkillsCache = {
            skills: [],
            expiresAt: Date.now() + SKILLS_CACHE_TTL_MS,
        };
        return [];
    }

    const skillFiles: Array<{ path: string; name: string }> = [];

    const topEntries = safeReaddir(root, { withFileTypes: true });
    for (const entry of topEntries) {
        if (!entry.isDirectory()) continue;
        const dir = join(root, entry.name);
        const skillMd = join(dir, 'SKILL.md');
        if (existsSync(skillMd)) {
            skillFiles.push({ path: skillMd, name: entry.name });
            continue;
        }
        // Nested group dir — scan one level deeper for SKILL.md.
        const inner = safeReaddir(dir, { withFileTypes: true });
        for (const child of inner) {
            if (!child.isDirectory()) continue;
            const nested = join(dir, child.name, 'SKILL.md');
            if (existsSync(nested)) {
                skillFiles.push({ path: nested, name: `${entry.name}/${child.name}` });
            }
        }
    }

    const skills = await Promise.all(skillFiles.map((f) => readSkillFile(f.path, f.name)));
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

function safeReaddir(path: string, opts: { withFileTypes: true }) {
    try {
        return readdirSync(path, opts);
    } catch {
        return [];
    }
}
