import { type NextRequest } from 'next/server';

import type { ChatModel } from '@weblab/models';
import { generateTabCompletion, inferProviderFromModelId } from '@weblab/ai';

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
        body = (await req.json()) as TabCompleteBody;
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
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

    if (body.model) {
        const provider = inferProviderFromModelId(body.model);
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
            model: body.model,
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
                error: error instanceof Error ? error.message : String(error),
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
}
