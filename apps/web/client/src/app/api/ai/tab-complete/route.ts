import { type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchQuery } from 'convex/nextjs';
import { z } from 'zod';

import type { ChatModel } from '@weblab/models';
import { generateTabCompletion, inferProviderFromModelId } from '@weblab/ai';
import { AUTO_MODEL_ID, DEFAULT_TAB_COMPLETE_MODEL } from '@weblab/models';

import type { Id } from '@convex/_generated/dataModel';
import { checkMessageLimit, getSupabaseUser, incrementUsage } from '../../chat/helpers';

const ALLOWED_OLLAMA_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function sanitizeOllamaBaseUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
        if (!ALLOWED_OLLAMA_HOSTNAMES.has(parsed.hostname.toLowerCase())) return undefined;
        return url;
    } catch {
        return undefined;
    }
}

interface TabCompleteBody {
    filePath: string;
    language: string;
    prefix: string;
    suffix: string;
    projectId: string;
    model?: ChatModel;
    ollamaBaseUrl?: string;
}

const MAX_FILE_PATH_LENGTH = 512;
const MAX_LANGUAGE_LENGTH = 64;
const MAX_CODE_CONTEXT_BYTES = 256 * 1024;
const MAX_TOTAL_BODY_BYTES = 512 * 1024;

const TabCompleteBodySchema = z.object({
    filePath: z.string().min(1).max(MAX_FILE_PATH_LENGTH),
    language: z.string().max(MAX_LANGUAGE_LENGTH).default(''),
    prefix: z.string().default(''),
    suffix: z.string().default(''),
    projectId: z.string().min(1),
    model: z.string().optional(),
    ollamaBaseUrl: z.string().optional(),
});

function getStringBytes(value: string): number {
    return new TextEncoder().encode(value).length;
}

function validateTabCompletePayload(body: TabCompleteBody): string | null {
    for (const [label, value] of [
        ['prefix', body.prefix],
        ['suffix', body.suffix],
    ] as const) {
        if (getStringBytes(value) > MAX_CODE_CONTEXT_BYTES) {
            return `${label} exceeds ${MAX_CODE_CONTEXT_BYTES} bytes`;
        }
    }
    const totalBytes = getStringBytes(body.prefix) + getStringBytes(body.suffix);
    if (totalBytes > MAX_TOTAL_BODY_BYTES) {
        return `tab completion payload exceeds ${MAX_TOTAL_BODY_BYTES} bytes`;
    }
    return null;
}

const SKIP_PATH_PATTERNS = [/\/node_modules\//, /\/\.next\//, /\/dist\//, /\/\.weblab\//];

export async function POST(req: NextRequest) {
    const user = await getSupabaseUser(req);
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const usageCheck = await checkMessageLimit(req);
    if (usageCheck.exceeded) {
        // 429 lets the extension distinguish "no completion suggested" (200,
        // empty body) from "rate-limited / over quota" so it can back off
        // instead of retrying every keystroke.
        return new Response(JSON.stringify({ error: 'usage_limit', code: 'usage_limit' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    let body: TabCompleteBody;
    try {
        body = TabCompleteBodySchema.parse(await req.json()) as TabCompleteBody;
    } catch (error) {
        const message = error instanceof z.ZodError ? error.issues[0]?.message : 'Invalid JSON';
        return new Response(JSON.stringify({ error: message ?? 'Invalid request body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (SKIP_PATH_PATTERNS.some((re) => re.test(body.filePath ?? ''))) {
        return new Response(JSON.stringify({ completion: '' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const payloadError = validateTabCompletePayload(body);
    if (payloadError) {
        return new Response(JSON.stringify({ error: payloadError, code: 400 }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Verify the caller can access body.projectId BEFORE generating or
    // metering. Mirrors chat/route.ts and inline-edit/route.ts — body.projectId
    // flows into telemetry/trace scope; without this gate any signed-in user
    // could pollute another tenant's project traces/usage attribution and
    // burn LLM tokens billed against the Weblab account.
    if (!body.projectId || body.projectId.length === 0) {
        return new Response(JSON.stringify({ error: 'projectId required', code: 400 }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    {
        const { getToken } = await auth();
        const token = (await getToken({ template: 'convex' })) ?? undefined;
        try {
            await fetchQuery(
                api.projects.get,
                { projectId: body.projectId as Id<'projects'> },
                { token },
            );
        } catch {
            return new Response(JSON.stringify({ error: 'Forbidden', code: 403 }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    const completionModel = body.model === AUTO_MODEL_ID ? DEFAULT_TAB_COMPLETE_MODEL : body.model;

    if (completionModel) {
        const provider = inferProviderFromModelId(completionModel);
        if (provider !== 'openrouter' && provider !== 'ollama') {
            return new Response(JSON.stringify({ completion: '' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    try {
        // Honor client-side aborts so cancelled keystrokes don't burn tokens.
        const completion = await generateTabCompletion({
            filePath: body.filePath,
            language: body.language,
            prefix: body.prefix ?? '',
            suffix: body.suffix ?? '',
            model: completionModel,
            ollamaBaseUrl: sanitizeOllamaBaseUrl(body.ollamaBaseUrl),
            userId: user.id,
            projectId: body.projectId,
            abortSignal: req.signal,
        });
        // Meter after generation so aborted/failed requests don't count.
        // Fire-and-forget: tab completions are best-effort; don't block the
        // response. Log metering failures so silent telemetry drift is at
        // least visible in server logs.
        void incrementUsage(req).catch((err) => {
            console.error('[tab-complete] meter increment failed', err);
        });
        return new Response(JSON.stringify({ completion }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        // Aborted on the client → silently return nothing.
        if (error instanceof Error && error.name === 'AbortError') {
            return new Response(JSON.stringify({ completion: '' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        console.error('Error in tab-complete', error);
        return new Response(
            JSON.stringify({
                error: 'An unexpected error occurred during tab completion.',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
}
