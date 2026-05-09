import { TRPCError } from '@trpc/server';

import { skillNameSchema } from './helper';

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
 */
export async function importSkillFromUrl(rawUrl: string): Promise<string> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid URL.' });
    }
    if (url.protocol !== 'https:') {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only https:// URLs are allowed.',
        });
    }
    if (!ALLOWED_HOSTS.has(url.hostname)) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Host "${url.hostname}" is not on the import allowlist. Allowed: ${[
                ...ALLOWED_HOSTS,
            ].join(', ')}.`,
        });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            headers: { 'User-Agent': 'weblab-skill-importer/1.0' },
            signal: controller.signal,
        });
        if (!res.ok) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Fetch failed: ${res.status} ${res.statusText}`,
            });
        }
        const contentLength = Number(res.headers.get('content-length') ?? '0');
        if (contentLength > MAX_BYTES) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Skill file too large (${contentLength} bytes; max ${MAX_BYTES}).`,
            });
        }

        // Cap the body read in case content-length was missing/lying.
        const reader = res.body?.getReader();
        if (!reader) {
            const text = await res.text();
            if (text.length > MAX_BYTES) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Skill file too large.',
                });
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
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Skill file too large.',
                    });
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
        if (err instanceof TRPCError) throw err;
        if ((err as { name?: string }).name === 'AbortError') {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Fetch timed out after ${FETCH_TIMEOUT_MS}ms.`,
            });
        }
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        });
    } finally {
        clearTimeout(timeout);
    }
}

interface ParsedSkill {
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
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
                'SKILL.md missing a `name:` frontmatter field. Add `--- name: my-skill ---` at the top.',
        });
    }
    const nameCheck = skillNameSchema.safeParse(name);
    if (!nameCheck.success) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid skill name "${name}": ${nameCheck.error.issues[0]?.message ?? 'invalid'}`,
        });
    }
    if (body.length > MAX_BODY_LEN) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Skill body too long (${body.length} chars; max ${MAX_BODY_LEN}).`,
        });
    }

    return {
        name,
        description: description.slice(0, 200),
        content: body,
    };
}
