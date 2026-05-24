import { skillNameSchema } from './skillHelpers';

const ALLOWED_HOSTS = new Set<string>([
    'raw.githubusercontent.com',
    'gist.githubusercontent.com',
    'agentskills.io',
    'www.agentskills.io',
]);

const MAX_BYTES = 1 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_LEN = 50_000;

/**
 * Fetch a SKILL.md from a remote URL with strict allowlist + size + timeout
 * caps. SSRF protection: only `https:` and a small set of trusted hosts.
 *
 * Convex port of apps/web/client/src/server/api/routers/skill/import.ts.
 * Errors are thrown as plain Error with `BAD_REQUEST: ` prefix so callers
 * can map them to the right tRPC code at the boundary.
 */
export async function importSkillFromUrl(rawUrl: string): Promise<string> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new Error('BAD_REQUEST: Invalid URL.');
    }
    if (url.protocol !== 'https:') {
        throw new Error('BAD_REQUEST: Only https:// URLs are allowed.');
    }
    if (!ALLOWED_HOSTS.has(url.hostname)) {
        throw new Error(
            `BAD_REQUEST: Host "${url.hostname}" is not on the import allowlist. Allowed: ${[
                ...ALLOWED_HOSTS,
            ].join(', ')}.`,
        );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: 'GET',
            redirect: 'error',
            headers: { 'User-Agent': 'weblab-skill-importer/1.0' },
            signal: controller.signal,
        });
        if (!res.ok) {
            throw new Error(`BAD_REQUEST: Fetch failed: ${res.status} ${res.statusText}`);
        }
        const contentLength = Number(res.headers.get('content-length') ?? '0');
        if (contentLength > MAX_BYTES) {
            throw new Error(
                `BAD_REQUEST: Skill file too large (${contentLength} bytes; max ${MAX_BYTES}).`,
            );
        }

        // Cap the body read in case content-length was missing/lying.
        const reader = res.body?.getReader();
        if (!reader) {
            const text = await res.text();
            if (text.length > MAX_BYTES) {
                throw new Error('BAD_REQUEST: Skill file too large.');
            }
            return text;
        }
        const chunks: Uint8Array[] = [];
        let total = 0;
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
                total += value.length;
                if (total > MAX_BYTES) {
                    throw new Error('BAD_REQUEST: Skill file too large.');
                }
                chunks.push(value);
            }
        }
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
            merged.set(c, offset);
            offset += c.length;
        }
        return new TextDecoder('utf-8').decode(merged);
    } catch (err) {
        if (err instanceof Error && err.message.startsWith('BAD_REQUEST')) throw err;
        if ((err as { name?: string }).name === 'AbortError') {
            throw new Error(`BAD_REQUEST: Fetch timed out after ${FETCH_TIMEOUT_MS}ms.`);
        }
        throw new Error(
            `BAD_REQUEST: Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        );
    } finally {
        clearTimeout(timeout);
    }
}

export interface ParsedSkill {
    name: string;
    description: string;
    content: string;
}

/**
 * Parse a raw SKILL.md string into a normalized record. Mirrors the
 * frontmatter parser in `packages/ai/src/skills/registry.ts` exactly so a
 * skill imported here behaves the same as one loaded from filesystem.
 */
export function parseSkillSource(raw: string): ParsedSkill {
    const match = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(raw);
    let name = '';
    let description = '';
    let body = raw;
    if (match) {
        const frontmatter = match[1] ?? '';
        body = match[2] ?? '';
        for (const line of frontmatter.split('\n')) {
            const kv = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/.exec(line);
            if (!kv) continue;
            const key = kv[1];
            const value = (kv[2] ?? '').replace(/^['"]|['"]$/g, '');
            if (key === 'name') name = value.trim();
            else if (key === 'description') description = value.trim();
        }
    }

    if (!name) {
        throw new Error(
            'BAD_REQUEST: SKILL.md missing a `name:` frontmatter field. Add `--- name: my-skill ---` at the top.',
        );
    }
    const nameCheck = skillNameSchema.safeParse(name);
    if (!nameCheck.success) {
        throw new Error(
            `BAD_REQUEST: Invalid skill name "${name}": ${nameCheck.error.issues[0]?.message ?? 'invalid'}`,
        );
    }
    if (body.length > MAX_BODY_LEN) {
        throw new Error(
            `BAD_REQUEST: Skill body too long (${body.length} chars; max ${MAX_BODY_LEN}).`,
        );
    }

    return {
        name,
        description: description.slice(0, 200),
        content: body,
    };
}
