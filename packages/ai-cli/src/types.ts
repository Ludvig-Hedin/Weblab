/**
 * Provider kinds this package's adapters speak. Duplicated as a literal-union
 * (rather than imported from `@weblab/ai`) so the ai-cli package's typecheck
 * stays leaf — importing from `@weblab/ai` would transitively pull TSX modules
 * via re-exports and break `tsc --noEmit`. Keep this in sync with
 * `packages/ai/src/providers/manifest.ts:ProviderKind`.
 */
export type ProviderKind =
    | 'openrouter'
    | 'ollama'
    | 'codex'
    | 'claude-code'
    | 'gemini'
    | 'opencode'
    | 'cursor';

/**
 * One AI SDK v6 UIMessageStreamPart payload, narrowed to the subset we emit
 * from CLI adapters. Kept inline (rather than re-imported from `ai`) so this
 * package stays decoupled from the renderer's AI SDK version.
 */
export type CliStreamPart =
    | { type: 'start'; messageId: string }
    | { type: 'start-step' }
    | { type: 'text-start'; id: string }
    | { type: 'text-delta'; id: string; delta: string }
    | { type: 'text-end'; id: string }
    | { type: 'reasoning-start'; id: string }
    | { type: 'reasoning-delta'; id: string; delta: string }
    | { type: 'reasoning-end'; id: string }
    | { type: 'tool-input-start'; toolCallId: string; toolName: string }
    | { type: 'tool-input-delta'; toolCallId: string; inputTextDelta: string }
    | {
          type: 'tool-input-available';
          toolCallId: string;
          toolName: string;
          input: unknown;
      }
    | {
          type: 'tool-output-available';
          toolCallId: string;
          output: unknown;
      }
    | { type: 'finish-step' }
    | { type: 'finish' }
    | { type: 'error'; errorText: string };

export type CliMessage = {
    role: 'system' | 'user' | 'assistant';
    /** Plain text — adapters that need richer parts (images, tool calls) extend this in-house. */
    content: string;
};

export type CliStreamRequest = {
    streamId: string;
    provider: ProviderKind;
    model: string;
    messages: ReadonlyArray<CliMessage>;
    /** Working directory hint for CLIs that resolve relative paths (Codex, Claude). */
    workingDirectory?: string;
};

export type CliEvent =
    | { streamId: string; kind: 'part'; payload: CliStreamPart }
    | { streamId: string; kind: 'error'; payload: { message: string; code?: string } }
    | { streamId: string; kind: 'finish' };

export type CliEventEmitter = (event: CliEvent) => void;

export interface CliAdapter {
    readonly kind: ProviderKind;
    /**
     * Spawn the CLI, parse its output, and emit `CliEvent`s via `emit`. Resolves
     * when the stream has finished (success or error). The returned `abort`
     * function terminates the underlying process and any pending I/O.
     */
    startStream(args: {
        request: CliStreamRequest;
        emit: CliEventEmitter;
        signal: AbortSignal;
    }): Promise<void>;
}

export type CliAdapterFactory = () => CliAdapter;
