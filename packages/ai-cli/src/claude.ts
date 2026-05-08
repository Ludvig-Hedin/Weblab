// NOTE: This is the typed reference implementation. The Electron main process
// is plain CommonJS today and cannot `require()` TypeScript directly, so the
// runtime mirror lives in `apps/desktop/cli/claude.js`. When the desktop app
// gains a TS build step, switch the runtime to import from this module.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import type { CliAdapter, CliEventEmitter, CliMessage, CliStreamRequest } from './types';

/**
 * Format the chat history into a single prompt for the Claude Code CLI.
 *
 * The CLI accepts a prompt via `-p <prompt>` or stdin. We use stdin so the
 * prompt can contain arbitrary characters without shell-escape concerns.
 *
 * For multi-turn history, we prepend a structured transcript and let Claude
 * answer the latest user message. This is intentionally simple — richer tool
 * use / file context comes in a follow-up.
 */
function buildPrompt(messages: ReadonlyArray<CliMessage>): string {
    if (messages.length === 0) return '';
    const chunks: string[] = [];
    for (const msg of messages) {
        if (msg.role === 'system') {
            chunks.push(`SYSTEM: ${msg.content}`);
        } else if (msg.role === 'user') {
            chunks.push(`USER: ${msg.content}`);
        } else {
            chunks.push(`ASSISTANT: ${msg.content}`);
        }
    }
    return chunks.join('\n\n');
}

type ClaudeStreamLine =
    | { type: 'system'; subtype?: string; session_id?: string }
    | {
          type: 'assistant';
          message?: {
              content?: ReadonlyArray<{ type: string; text?: string }>;
          };
      }
    | { type: 'result'; subtype?: 'success' | 'error'; is_error?: boolean }
    | { type: string; [key: string]: unknown };

function parseLine(line: string): ClaudeStreamLine | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
        return JSON.parse(trimmed) as ClaudeStreamLine;
    } catch {
        return null;
    }
}

export class ClaudeAdapter implements CliAdapter {
    readonly kind = 'claude-code' as const;

    async startStream({
        request,
        emit,
        signal,
    }: {
        request: CliStreamRequest;
        emit: CliEventEmitter;
        signal: AbortSignal;
    }): Promise<void> {
        const { streamId, model, messages, workingDirectory } = request;
        const prompt = buildPrompt(messages);

        const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', model];

        let child: ReturnType<typeof spawn>;
        try {
            child = spawn('claude', args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: workingDirectory,
                shell: process.platform === 'win32',
            });
        } catch (cause) {
            emit({
                streamId,
                kind: 'error',
                payload: {
                    message: `Failed to spawn claude: ${(cause as Error).message}`,
                    code: 'spawn_failed',
                },
            });
            return;
        }

        const onAbort = () => {
            try {
                child.kill('SIGTERM');
            } catch {
                // ignore
            }
        };
        signal.addEventListener('abort', onAbort, { once: true });

        child.on('error', (err) => {
            emit({
                streamId,
                kind: 'error',
                payload: {
                    message: `Failed to spawn claude: ${err.message}`,
                    code: 'spawn_failed',
                },
            });
        });

        const messageId = `claude-${streamId}`;
        const textBlockId = `${messageId}-text`;
        let textOpened = false;
        let receivedAny = false;

        emit({ streamId, kind: 'part', payload: { type: 'start', messageId } });
        emit({ streamId, kind: 'part', payload: { type: 'start-step' } });

        // Pipe the prompt in via stdin then close — the CLI reads until EOF.
        child.stdin?.write(prompt);
        child.stdin?.end();

        const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });
        rl.on('line', (line) => {
            const parsed = parseLine(line);
            if (!parsed) return;
            if (parsed.type === 'assistant') {
                const content = parsed.message?.content ?? [];
                for (const block of content) {
                    if (block.type === 'text' && typeof block.text === 'string') {
                        if (!textOpened) {
                            textOpened = true;
                            emit({
                                streamId,
                                kind: 'part',
                                payload: { type: 'text-start', id: textBlockId },
                            });
                        }
                        receivedAny = true;
                        emit({
                            streamId,
                            kind: 'part',
                            payload: {
                                type: 'text-delta',
                                id: textBlockId,
                                delta: block.text,
                            },
                        });
                    }
                }
            }
        });

        let stderrBuf = '';
        child.stderr?.on('data', (b: Buffer) => {
            stderrBuf += b.toString();
        });

        await new Promise<void>((resolve) => {
            let savedExitCode: number | null = null;
            let childExited = false;

            child.on('exit', (code) => {
                savedExitCode = code;
                childExited = true;
            });

            const finalize = (code: number | null) => {
                if (textOpened) {
                    emit({
                        streamId,
                        kind: 'part',
                        payload: { type: 'text-end', id: textBlockId },
                    });
                }
                emit({ streamId, kind: 'part', payload: { type: 'finish-step' } });

                if (code === 0 && receivedAny) {
                    emit({ streamId, kind: 'part', payload: { type: 'finish' } });
                    emit({ streamId, kind: 'finish' });
                } else {
                    const detail = stderrBuf.trim() || `claude exited with code ${code}`;
                    emit({
                        streamId,
                        kind: 'part',
                        payload: { type: 'error', errorText: detail },
                    });
                    emit({
                        streamId,
                        kind: 'error',
                        payload: { message: detail, code: 'cli_error' },
                    });
                }
                signal.removeEventListener('abort', onAbort);
                resolve();
            };

            rl.on('close', () => {
                if (childExited) {
                    finalize(savedExitCode);
                } else {
                    child.once('exit', (code) => finalize(code));
                }
            });
        });
    }
}

export const createClaudeAdapter = (): CliAdapter => new ClaudeAdapter();
