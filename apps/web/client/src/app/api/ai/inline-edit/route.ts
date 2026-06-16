import { type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchQuery } from 'convex/nextjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import type { ChatModel } from '@weblab/models';
import { createInlineEditStream, inferProviderFromModelId } from '@weblab/ai';

import type { Id } from '../../../../../convex/_generated/dataModel';
import {
    checkMessageLimit,
    decrementUsage,
    getSupabaseUser,
    incrementUsage,
    reconcileUsageCost,
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

const MAX_FILE_PATH_LENGTH = 512;
const MAX_LANGUAGE_LENGTH = 64;
const MAX_INSTRUCTION_BYTES = 16 * 1024;
const MAX_CODE_SEGMENT_BYTES = 256 * 1024;
const MAX_TOTAL_BODY_BYTES = 768 * 1024;

const InlineEditBodySchema = z.object({
    filePath: z.string().min(1).max(MAX_FILE_PATH_LENGTH),
    language: z.string().max(MAX_LANGUAGE_LENGTH).default(''),
    before: z.string().default(''),
    selection: z.string().min(1),
    after: z.string().default(''),
    instruction: z.string().min(1),
    projectId: z.string().min(1),
    model: z.string().optional(),
    ollamaBaseUrl: z.string().optional(),
});

function getStringBytes(value: string): number {
    return new TextEncoder().encode(value).length;
}

function validateInlineEditPayload(body: InlineEditBody): string | null {
    if (getStringBytes(body.instruction) > MAX_INSTRUCTION_BYTES) {
        return `instruction exceeds ${MAX_INSTRUCTION_BYTES} bytes`;
    }
    for (const [label, value] of [
        ['before', body.before],
        ['selection', body.selection],
        ['after', body.after],
    ] as const) {
        if (getStringBytes(value) > MAX_CODE_SEGMENT_BYTES) {
            return `${label} exceeds ${MAX_CODE_SEGMENT_BYTES} bytes`;
        }
    }
    const totalBytes =
        getStringBytes(body.before) +
        getStringBytes(body.selection) +
        getStringBytes(body.after) +
        getStringBytes(body.instruction);
    if (totalBytes > MAX_TOTAL_BODY_BYTES) {
        return `inline edit payload exceeds ${MAX_TOTAL_BODY_BYTES} bytes`;
    }
    return null;
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
        body = InlineEditBodySchema.parse(await req.json()) as InlineEditBody;
    } catch (error) {
        // Mirror /api/chat: don't echo zod issue messages — they describe the
        // shape of the rejected input and can leak slices of it. Log full
        // detail server-side; return a fixed 400 to the client.
        console.warn('[inline-edit] invalid request body', error);
        return new Response(JSON.stringify({ error: 'Invalid request body', code: 400 }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (!body.instruction?.trim() || !body.selection?.trim()) {
        return new Response(
            JSON.stringify({
                error: 'instruction and selection are required',
                code: 400,
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
    }
    const payloadError = validateInlineEditPayload(body);
    if (payloadError) {
        return new Response(JSON.stringify({ error: payloadError, code: 400 }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Require a non-empty projectId. The interface declares it as `string`
    // but there's no zod schema enforcement, so an empty value silently
    // bypassed the ownership check below and the request still incremented
    // usage + ran the LLM with no project scope.
    if (!body.projectId || body.projectId.length === 0) {
        return new Response(JSON.stringify({ error: 'projectId required', code: 400 }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Verify the caller can access body.projectId BEFORE incrementing usage or
    // streaming — mirrors chat/route.ts. body.projectId is client-controlled and
    // flows into the stream's telemetry/trace scope; `projects.get` runs
    // requireCap('project.view') and throws for non-members, so a non-owner gets
    // 403 instead of silently attributing usage/traces to a project they don't own.
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

    // Refund the up-front usage charge at most once. The stream is returned
    // lazily, so a mid-stream failure (provider 5xx, network drop, abort) fires
    // AFTER this handler's try/catch has exited and can't be caught here — the
    // `onError` hook below handles that case. The guard prevents a double-refund
    // if both the synchronous catch and the async onError ever run.
    let refunded = false;
    const refundOnce = async (): Promise<void> => {
        if (refunded || !usageRecord) {
            return;
        }
        refunded = true;
        await decrementUsage(req, usageRecord);
    };

    try {
        if (!isLocalModel) {
            const incrementResult = await incrementUsage(req, traceId);
            if (incrementResult && 'limitReached' in incrementResult) {
                // PRO bucket exhausted under concurrency — refuse before
                // streaming. The increment mutation rolled back, nothing to refund.
                return new Response(
                    JSON.stringify({ error: 'Credit limit exceeded.', code: 402 }),
                    { status: 402, headers: { 'Content-Type': 'application/json' } },
                );
            }
            usageRecord = incrementResult;
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
            // Mid-stream failure: refund the charged usage and log. Without this
            // a failed inline edit silently burned a paid credit (the lazy
            // stream errors after the try block exits).
            onError: (error) => {
                console.error('inline-edit stream error', error);
                void refundOnce();
            },
            // AI SDK routes client aborts to onAbort, not onError. Refund the
            // up-front charge so a cancelled inline edit doesn't burn a credit.
            onAbort: () => {
                void refundOnce();
            },
            // Stream finished successfully — reconcile the reserved credit
            // against the real token cost. Fires after this handler returned the
            // lazy stream, so the reconcile happens here. A refunded request
            // (error/abort) leaves no record, so reconcile is a safe no-op.
            onUsage: ({ estimatedCostUsd }) => {
                if (refunded) return;
                void reconcileUsageCost(usageRecord, estimatedCostUsd);
            },
        });

        return stream.toTextStreamResponse({
            headers: {
                'X-Trace-Id': traceId,
            },
        });
    } catch (error) {
        console.error('Error in inline-edit', error);
        await refundOnce();
        return new Response(
            JSON.stringify({
                error: 'An unexpected error occurred during inline edit.',
                code: 500,
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
}
