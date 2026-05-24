import { v } from 'convex/values';

import { action } from './_generated/server';
import { importSkillFromUrl, parseSkillSource } from './lib/skillImport';

// Convex port of the import preview part of
// apps/web/client/src/server/api/routers/skill/index.ts. Network fetches
// must live in an action (queries/mutations cannot use fetch). The actual
// insert is done by `skills.commitImport` once the user accepts the parsed
// payload — splitting the two avoids double-fetching the source URL and
// removes the rate-limit risk against `raw.githubusercontent.com`.

export const previewImport = action({
    args: {
        url: v.optional(v.string()),
        rawContent: v.optional(v.string()),
    },
    handler: async (
        ctx,
        { url, rawContent },
    ): Promise<{
        name: string;
        description: string;
        content: string;
        contentPreview: string;
        contentLength: number;
    }> => {
        // Require authentication. The legitimate caller is the in-app
        // skill-importer UI — signed-in users only. Without this gate, any
        // unauthenticated caller could invoke this action and use Convex
        // egress to fetch + parse skill markdown from the allowlisted hosts.
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('UNAUTHORIZED');

        const hasUrl = Boolean(url);
        const hasRaw = Boolean(rawContent);
        if (hasUrl === hasRaw) {
            throw new Error('BAD_REQUEST: provide exactly one of `url` or `rawContent`.');
        }
        if (rawContent && rawContent.length > 2 * 1024 * 1024) {
            throw new Error('BAD_REQUEST: rawContent too large.');
        }
        const raw = url ? await importSkillFromUrl(url) : (rawContent ?? '');
        const parsed = parseSkillSource(raw);
        return {
            name: parsed.name,
            description: parsed.description,
            content: parsed.content,
            contentPreview: parsed.content.slice(0, 200),
            contentLength: parsed.content.length,
        };
    },
});
