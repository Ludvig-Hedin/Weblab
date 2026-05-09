import { type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import type { ChatModel } from '@weblab/models';
import { createInlineEditStream, inferProviderFromModelId } from '@weblab/ai';

import {
    checkMessageLimit,
    decrementUsage,
    getSupabaseUser,
    incrementUsage,
} from '../../chat/helpers';

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

interface InlineEditBody {
    filePath: string;
    language: string;
    before: string;
    selection: string;
    after: string;
    instruction: string;
    projectId: string;
    model?: ChatModel;
    ollamaBaseUrl?: string;
}

export async function POST(req: NextRequest) {
    const user = await getSupabaseUser(req);
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized', code: 401 }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const usageCheck = await checkMessageLimit(req);
    if (usageCheck.exceeded) {
        return new Response(
            JSON.stringify({
                error: 'Credit limit exceeded.',
                code: 402,
                usage: usageCheck.usage,
            }),
            { status: 402, headers: { 'Content-Type': 'application/json' } },
        );
    }

    let body: InlineEditBody;
    try {
        body = (await req.json()) as InlineEditBody;
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON', code: 400 }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (!body.instruction?.trim() || !body.selection?.trim()) {
        return new Response(
            JSON.stringify({ error: 'instruction and selection are required', code: 400 }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
    }

    if (body.model) {
        const provider = inferProviderFromModelId(body.model);
        if (provider !== 'openrouter' && provider !== 'ollama') {
            return new Response(
                JSON.stringify({
                    error: `Provider "${provider}" is not supported for inline-edit on hosted web.`,
                    code: 'cli_provider_routing_not_implemented',
                }),
                { status: 501, headers: { 'Content-Type': 'application/json' } },
            );
        }
    }

    const isLocalModel = typeof body.model === 'string' && body.model.startsWith('ollama/');
    const traceId = uuidv4();

    let usageRecord: {
        usageRecordId: string | undefined;
        rateLimitId: string | undefined;
    } | null = null;

    try {
        if (!isLocalModel) {
            usageRecord = await incrementUsage(req, traceId);
        }

        const stream = createInlineEditStream({
            filePath: body.filePath,
            language: body.language,
            before: body.before ?? '',
            selection: body.selection,
            after: body.after ?? '',
            instruction: body.instruction,
            model: body.model,
            ollamaBaseUrl: sanitizeOllamaBaseUrl(body.ollamaBaseUrl),
            userId: user.id,
            projectId: body.projectId,
            traceId,
            abortSignal: req.signal,
        });

        return stream.toTextStreamResponse({
            headers: {
                'X-Trace-Id': traceId,
            },
        });
    } catch (error) {
        console.error('Error in inline-edit', error);
        if (usageRecord) {
            await decrementUsage(req, usageRecord);
        }
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
                code: 500,
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
}
