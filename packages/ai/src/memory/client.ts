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
    // eslint-disable-next-line no-new-func
    const serverImport = new Function('p', 'return import(p)');
    const { default: MemoryClientCtor } = await serverImport('mem0ai');
    const client = new MemoryClientCtor({ apiKey }) as MemoryClient;
    _client = client;
    return client;
}
