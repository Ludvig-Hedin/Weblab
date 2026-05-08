import MemoryClient from 'mem0ai';

let _client: MemoryClient | null = null;

/**
 * Returns a lazy singleton MemoryClient.
 * Reads MEM0_API_KEY directly from process.env (same pattern as OpenRouter key in providers.ts).
 * Throws if the key is missing — callers in operations.ts must catch this.
 */
export function getMemoryClient(): MemoryClient {
    if (_client) return _client;
    const apiKey = process.env.MEM0_API_KEY;
    if (!apiKey) {
        throw new Error('MEM0_API_KEY is not set');
    }
    _client = new MemoryClient({ apiKey });
    return _client;
}
