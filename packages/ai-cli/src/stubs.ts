import type { CliAdapter, CliEventEmitter, CliStreamRequest, ProviderKind } from './types';

class NotImplementedAdapter implements CliAdapter {
    constructor(public readonly kind: ProviderKind) {}

    async startStream({
        request,
        emit,
    }: {
        request: CliStreamRequest;
        emit: CliEventEmitter;
        signal: AbortSignal;
    }): Promise<void> {
        const { streamId } = request;
        const message = `${this.kind} adapter is not implemented yet — port from reference/t3code`;
        emit({ streamId, kind: 'error', payload: { message, code: 'not_implemented' } });
    }
}

/**
 * Each stub mirrors what the t3code reference does and will be ported in turn:
 *   - Codex   → spawn `codex app-server`, JSON-RPC over stdio
 *   - Gemini  → spawn `gemini -p <prompt>`, parse text output
 *   - OpenCode → manage `opencode serve` lifecycle, HTTP client
 *   - Cursor  → spawn `cursor-agent --print --output-format stream-json`
 *   - Ollama  → HTTP at http://127.0.0.1:11434 (no spawn)
 *
 * Until those land, the stub fast-fails with a clear error so the renderer
 * surfaces "not implemented" to the user instead of hanging.
 */
export const createCodexAdapter = (): CliAdapter => new NotImplementedAdapter('codex');
export const createGeminiAdapter = (): CliAdapter => new NotImplementedAdapter('gemini');
export const createOpenCodeAdapter = (): CliAdapter => new NotImplementedAdapter('opencode');
export const createCursorAdapter = (): CliAdapter => new NotImplementedAdapter('cursor');
export const createOllamaAdapter = (): CliAdapter => new NotImplementedAdapter('ollama');
