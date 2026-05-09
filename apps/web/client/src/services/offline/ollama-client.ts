'use client';

/**
 * Direct browser-to-Ollama client for offline chat.
 *
 * The server-side `/api/chat` route is unreachable while offline, so when
 * the user has Ollama running locally we bypass the route handler entirely
 * and POST to the local daemon. The `connect-src` CSP entry in
 * `next.config.ts` allows `http://localhost:11434` and `http://127.0.0.1:11434`
 * for this path; outside those origins the browser will block the fetch.
 */
import { OLLAMA_DEFAULT_BASE_URL } from '@weblab/models';

import { isOnline } from './online-status';

interface OllamaMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface OllamaChatRequest {
    baseUrl?: string;
    model: string;
    messages: OllamaMessage[];
    signal?: AbortSignal;
}

export async function isOllamaReachable(baseUrl = OLLAMA_DEFAULT_BASE_URL): Promise<boolean> {
    try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/version`, {
            method: 'GET',
            mode: 'cors',
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Streams a chat completion from a local Ollama daemon. Yields newline-
 * delimited JSON chunks (Ollama's native streaming protocol). Caller is
 * responsible for translating to whatever UI surface they need.
 */
export async function* streamOllamaChat({
    baseUrl = OLLAMA_DEFAULT_BASE_URL,
    model,
    messages,
    signal,
}: OllamaChatRequest): AsyncGenerator<string, void, void> {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages,
            stream: true,
        }),
        signal,
    });

    if (!response.ok || !response.body) {
        throw new Error(`Ollama chat failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                if (!line) continue;
                try {
                    const obj = JSON.parse(line) as { message?: { content?: string } };
                    const chunk = obj.message?.content;
                    if (chunk) yield chunk;
                } catch {
                    /* ignore malformed line */
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * Convenience helper: returns true when the local Ollama daemon should be
 * used in place of the cloud API — i.e. the browser thinks we're offline
 * AND the daemon is reachable on the configured base URL.
 */
export async function shouldUseLocalOllama(baseUrl?: string): Promise<boolean> {
    if (isOnline()) return false;
    return await isOllamaReachable(baseUrl);
}
