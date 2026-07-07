import { type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchMutation } from 'convex/nextjs';

import { env } from '@/env';
import { getSupabaseUser } from '../chat/helpers';

// Whisper accepts files up to 25 MB.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO_PREFIXES = ['audio/'];

const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
const OPENROUTER_TRANSCRIPTIONS_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';
// OpenAI uses the bare model name; OpenRouter requires the namespaced form.
const OPENAI_MODEL = 'whisper-1';
const OPENROUTER_MODEL = 'openai/whisper-1';

interface TranscriptionResponse {
    text?: string;
    error?: { message?: string } | string;
}

export async function POST(req: NextRequest) {
    try {
        const user = await getSupabaseUser(req);
        if (!user) {
            return jsonError(401, 'Unauthorized. Please sign in to use voice input.');
        }

        // Fleet-wide rate limit (F-476): the count lives in Convex, not a
        // per-process Map, so the cap holds across all Railway replicas.
        const { getToken } = await auth();
        const convexToken = (await getToken({ template: 'convex' })) ?? undefined;
        const limit = await fetchMutation(
            api.transcribeRateLimit.checkAndRecord,
            {},
            { token: convexToken },
        );
        if (!limit.allowed) {
            return new Response(
                JSON.stringify({
                    error: 'Too many transcription requests. Please slow down.',
                    retryAfterSeconds: limit.retryAfterSeconds,
                }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': String(limit.retryAfterSeconds),
                    },
                },
            );
        }

        const form = await req.formData();
        const file = form.get('file');
        const language = form.get('language');

        if (!(file instanceof Blob)) {
            return jsonError(400, 'Missing audio file.');
        }
        if (file.size === 0) {
            return jsonError(400, 'Audio file is empty.');
        }
        if (file.size > MAX_AUDIO_BYTES) {
            return jsonError(413, 'Audio file too large (max 25 MB).');
        }
        if (file.type && !ALLOWED_AUDIO_PREFIXES.some((p) => file.type.startsWith(p))) {
            return jsonError(415, `Unsupported audio type: ${file.type}`);
        }

        // Prefer OpenAI directly (native Whisper); fall back to OpenRouter.
        const useOpenAI = !!env.OPENAI_API_KEY;
        if (!useOpenAI && !env.OPENROUTER_API_KEY) {
            return jsonError(500, 'Transcription is not configured on the server.');
        }

        const upstream = new FormData();
        // Whisper infers extension from the filename; preserve it when possible.
        const inputName = file instanceof File && file.name ? file.name : 'audio.webm';
        upstream.append('file', file, inputName);
        upstream.append('model', useOpenAI ? OPENAI_MODEL : OPENROUTER_MODEL);
        upstream.append('response_format', 'json');
        // Whisper auto-detects language; only forward an explicit hint when provided.
        if (typeof language === 'string' && language.length > 0) {
            upstream.append('language', language);
        }

        const transcribeUrl = useOpenAI ? OPENAI_TRANSCRIPTIONS_URL : OPENROUTER_TRANSCRIPTIONS_URL;
        const requestHeaders: Record<string, string> = {
            Authorization: `Bearer ${useOpenAI ? env.OPENAI_API_KEY! : env.OPENROUTER_API_KEY}`,
        };
        if (!useOpenAI) {
            requestHeaders['HTTP-Referer'] = 'https://weblab.build';
            requestHeaders['X-Title'] = 'Weblab';
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90_000);

        let response: Response;
        try {
            response = await fetch(transcribeUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: upstream,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            // Log the raw upstream message for ops; never echo provider
            // phrasing back to the client (could leak internal model names
            // or quota detail). Return a fixed, status-bucketed string.
            const upstreamMessage = await safeReadError(response);
            console.error('[transcribe] upstream error', response.status, upstreamMessage);
            const status = response.status >= 500 ? 502 : response.status;
            return jsonError(status, 'Transcription failed. Please try again.');
        }

        const data = (await response.json()) as TranscriptionResponse;
        const text = (data?.text ?? '').trim();

        return new Response(JSON.stringify({ text }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error: unknown) {
        console.error('[transcribe] error', error);
        if (error instanceof Error && error.name === 'AbortError') {
            return jsonError(504, 'Transcription request timed out.');
        }
        // Don't leak internal error details (paths, stack traces, etc.) to clients.
        return jsonError(500, 'An unexpected error occurred during transcription.');
    }
}

function jsonError(status: number, message: string) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

async function safeReadError(response: Response): Promise<string> {
    try {
        const data = (await response.json()) as TranscriptionResponse;
        if (typeof data?.error === 'string') return data.error;
        if (data?.error?.message) return data.error.message;
        return `HTTP ${response.status}`;
    } catch {
        return `HTTP ${response.status}`;
    }
}
