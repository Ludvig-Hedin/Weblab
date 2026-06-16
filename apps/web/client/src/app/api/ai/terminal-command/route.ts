import { type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchQuery } from 'convex/nextjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { generateTerminalCommand } from '@weblab/ai';

import type { Id } from '../../../../../convex/_generated/dataModel';
import {
    checkMessageLimit,
    decrementUsage,
    getSupabaseUser,
    incrementUsage,
    reconcileUsageCost,
} from '../../chat/helpers';

const MAX_INSTRUCTION_BYTES = 4 * 1024;
const MAX_CONTEXT_BYTES = 16 * 1024;

const BodySchema = z.object({
    instruction: z.string().min(1),
    projectId: z.string().min(1),
    context: z.string().optional(),
});

function getStringBytes(value: string): number {
    return new TextEncoder().encode(value).length;
}

/**
 * Natural-language → single shell command. Used by the editor terminal's AI
 * input. Mirrors /api/ai/inline-edit's auth + usage-metering shape, but is a
 * one-shot (non-streaming) `generateText` call, so the refund path is a simple
 * try/catch instead of the lazy-stream onError hook.
 */
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
            JSON.stringify({ error: 'Credit limit exceeded.', code: 402, usage: usageCheck.usage }),
            { status: 402, headers: { 'Content-Type': 'application/json' } },
        );
    }

    let body: z.infer<typeof BodySchema>;
    try {
        body = BodySchema.parse(await req.json());
    } catch (error) {
        // Don't echo zod issues — they can leak slices of the rejected input.
        console.warn('[terminal-command] invalid request body', error);
        return new Response(JSON.stringify({ error: 'Invalid request body', code: 400 }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (getStringBytes(body.instruction) > MAX_INSTRUCTION_BYTES) {
        return new Response(JSON.stringify({ error: 'instruction too long', code: 400 }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    // Reject oversized context explicitly (consistent with the instruction
    // check) rather than silently dropping it — a silent drop would translate
    // without the context the caller sent and produce a worse command with no
    // signal why.
    if (body.context && getStringBytes(body.context) > MAX_CONTEXT_BYTES) {
        return new Response(JSON.stringify({ error: 'context too long', code: 400 }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const context = body.context;

    // Verify the caller can access the project BEFORE charging usage or calling
    // the LLM — mirrors chat/route.ts. `projects.get` runs requireCap and throws
    // for non-members, so a non-owner gets 403 instead of free LLM usage.
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

    const traceId = uuidv4();
    const incrementResult = await incrementUsage(req, traceId);
    if (incrementResult && 'limitReached' in incrementResult) {
        return new Response(JSON.stringify({ error: 'Credit limit exceeded.', code: 402 }), {
            status: 402,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        let costUsd: number | undefined;
        const command = await generateTerminalCommand({
            instruction: body.instruction,
            context,
            userId: user.id,
            projectId: body.projectId,
            abortSignal: req.signal,
            onUsage: ({ estimatedCostUsd }) => {
                costUsd = estimatedCostUsd;
            },
        });

        // Reconcile the reserved credit against the real token cost. Awaited
        // (not fire-and-forget) because this non-streaming handler returns right
        // after — a background promise could be dropped when the function
        // freezes. reconcileUsageCost swallows its own errors, so this never
        // throws and adds only one fast mutation round-trip.
        if (costUsd !== undefined) {
            await reconcileUsageCost(incrementResult, costUsd);
        }

        return new Response(JSON.stringify({ command }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'X-Trace-Id': traceId },
        });
    } catch (error) {
        // One-shot call failed (provider 5xx, abort, empty translation) —
        // refund the credit we charged up front so a failed translation
        // doesn't burn usage.
        await decrementUsage(req, incrementResult);
        // Client aborts (component unmount / a superseding request) are routine,
        // not failures — don't log them at error level or return a bogus 500 to
        // a connection that's already gone.
        if ((error as Error)?.name === 'AbortError' || req.signal.aborted) {
            return new Response(null, { status: 499 });
        }
        console.error('Error in terminal-command', error);
        return new Response(JSON.stringify({ error: 'Failed to translate command.', code: 500 }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
