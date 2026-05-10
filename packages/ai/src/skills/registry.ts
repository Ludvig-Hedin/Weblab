import type { Dirent } from 'node:fs';

import type { SkillInfo, SkillScope, SkillSummary } from './types';
import { EMBEDDED_SKILLS } from './embedded';

declare global {
    var __weblabSkillsCache: Map<string, { skills: SkillInfo[]; expiresAt: number }> | undefined;
}

const SKILLS_CACHE_TTL_MS = 60 * 1000;
const SKILLS_CACHE_MAX = 200;

const cacheByScope: Map<string, { skills: SkillInfo[]; expiresAt: number }> = (() => {
    if (globalThis.__weblabSkillsCache) return globalThis.__weblabSkillsCache;
    const fresh = new Map<string, { skills: SkillInfo[]; expiresAt: number }>();
    globalThis.__weblabSkillsCache = fresh;
    return fresh;
})();

// Wrapper around `import()` that survives bundler analysis — Webpack would
// otherwise rewrite the call and break server-only Node imports below. The
// argument is a hardcoded module specifier from this file, never user input.
const _serverImport = new Function('p', 'return import(p)');

function scopeCacheKey(scope: SkillScope | undefined): string {
    if (!scope?.userId) return 'local-only';
    return `${scope.userId}:${scope.projectId ?? 'global'}`;
}

function evictExpired() {
    const now = Date.now();
    for (const [key, entry] of cacheByScope) {
        if (entry.expiresAt < now) cacheByScope.delete(key);
    }
    while (cacheByScope.size > SKILLS_CACHE_MAX) {
        const oldest = cacheByScope.keys().next().value;
        if (!oldest) break;
        cacheByScope.delete(oldest);
    }
}

/**
 * Walk up from `process.cwd()` looking for a parent directory that contains
 * a `skills/` folder. Used in dev so editing a SKILL.md is reflected on the
 * next chat turn without re-running the codegen. Capped at 6 levels.
 */
async function findSkillsRoot(): Promise<string | null> {
    const { existsSync } = await _serverImport('node:fs');
    const { dirname, join, resolve } = await _serverImport('node:path');
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
    const { readFile } = await _serverImport('node:fs/promises');
    const raw = await readFile(skillMdPath, 'utf8');
    const { name, description, body } = parseFrontmatter(raw);
    return {
        name: name?.trim() ?? fallbackName,
        description: description?.trim() ?? '',
        content: body,
        location: skillMdPath,
    };
}

async function safeReaddir(path: string): Promise<Dirent[]> {
    try {
        const { readdirSync } = await _serverImport('node:fs');
        return readdirSync(path, { withFileTypes: true });
    } catch {
        return [];
    }
}

async function loadFromFilesystem(): Promise<SkillInfo[] | null> {
    const root = await findSkillsRoot();
    if (!root) return null;

    const { existsSync } = await _serverImport('node:fs');
    const { join } = await _serverImport('node:path');

    const skillFiles: Array<{ path: string; name: string }> = [];
    const topEntries = await safeReaddir(root);
    for (const entry of topEntries) {
        if (!entry.isDirectory()) continue;
        const dir = join(root, entry.name);
        const skillMd = join(dir, 'SKILL.md');
        if (existsSync(skillMd)) {
            skillFiles.push({ path: skillMd, name: entry.name });
            continue;
        }
        // Nested group dir — scan one level deeper for SKILL.md.
        const inner = await safeReaddir(dir);
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

interface DbSkillRow {
    id: string;
    userId: string;
    projectId: string | null;
    name: string;
    description: string;
    content: string;
    enabled: boolean;
}

interface SkillsCallerLike {
    skills: {
        list: {
            query: (input: {
                projectId?: string;
                scope?: 'all' | 'global' | 'project';
            }) => Promise<DbSkillRow[]>;
        };
    };
}

async function loadFromDb(scope: SkillScope): Promise<SkillInfo[]> {
    if (!scope.userId || !scope.trpcCaller) return [];
    try {
        const caller = scope.trpcCaller as SkillsCallerLike;
        const rows = await caller.skills.list.query({
            ...(scope.projectId ? { projectId: scope.projectId } : {}),
            scope: 'all',
        });
        return rows
            .filter((r) => r.enabled)
            .map((r) => ({
                name: r.name,
                description: r.description,
                content: r.content,
                location: `<db>/${r.projectId ?? 'global'}/${r.name}`,
            }));
    } catch (err) {
        console.warn('[skills] failed to load DB skills, continuing without them', err);
        return [];
    }
}

/**
 * Merge skills from multiple sources by `name`. Higher-priority sources
 * (later in the input list) override same-named entries from earlier
 * sources. The final array is sorted by name.
 */
function mergeByName(...sources: SkillInfo[][]): SkillInfo[] {
    const byName = new Map<string, SkillInfo>();
    for (const source of sources) {
        for (const skill of source) {
            byName.set(skill.name, skill);
        }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Discover Agent Skills.
 *
 * Resolution order (highest-priority overrides same-named lower-priority):
 *  1. DB skill scoped to (userId, projectId) — when scope.projectId set.
 *  2. DB skill scoped to (userId, project_id IS NULL) — user-global.
 *  3. Filesystem walk above process.cwd() — dev hot-iteration.
 *  4. EMBEDDED_SKILLS — built-in baseline, always present.
 *
 * Cached on globalThis with a 60 s TTL keyed by user/project so concurrent
 * users don't poison each other's cache.
 */
export async function loadSkills(scope?: SkillScope): Promise<SkillInfo[]> {
    const key = scopeCacheKey(scope);
    const now = Date.now();
    const cached = cacheByScope.get(key);
    if (cached && cached.expiresAt > now) {
        return cached.skills;
    }

    const fromFs = (await loadFromFilesystem().catch(() => null)) ?? [];
    const fromDb = scope ? await loadFromDb(scope) : [];

    // Split DB rows so project rows beat user-global rows on name collisions.
    const dbGlobal = fromDb.filter((s) => s.location.startsWith('<db>/global/'));
    const dbProject = fromDb.filter((s) => !s.location.startsWith('<db>/global/'));

    const skills = mergeByName(EMBEDDED_SKILLS as SkillInfo[], fromFs, dbGlobal, dbProject);

    evictExpired();
    cacheByScope.set(key, { skills, expiresAt: now + SKILLS_CACHE_TTL_MS });
    return skills;
}

/** Test/dev helper to force a re-scan on the next call. */
export function invalidateSkillsCache(): void {
    cacheByScope.clear();
}

export async function loadSkillSummaries(scope?: SkillScope): Promise<SkillSummary[]> {
    const skills = await loadSkills(scope);
    return skills.map(({ name, description }) => ({ name, description }));
}

export async function loadSkillByName(name: string, scope?: SkillScope): Promise<SkillInfo | null> {
    const skills = await loadSkills(scope);
    return skills.find((s) => s.name === name) ?? null;
}
