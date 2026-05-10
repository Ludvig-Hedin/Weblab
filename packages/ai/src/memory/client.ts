import type MemoryClient from 'mem0ai';

let _client: MemoryClient | null = null;

/**
 * Returns a lazy singleton MemoryClient.
 * Reads MEM0_API_KEY directly from process.env (same pattern as OpenRouter key in providers.ts).
 * Throws if the key is missing — callers in operations.ts must catch this.
 */
export async function getMemoryClient(): Promise<MemoryClient> {
    if (_client) return _client;
    const apiKey = process.env.MEM0_API_KEY;
    if (!apiKey) {
        throw new Error('MEM0_API_KEY is not set');
    }
    const { default: MemoryClientCtor } = await import('mem0ai');
    _client = new MemoryClientCtor({ apiKey });
    return _client;
}
