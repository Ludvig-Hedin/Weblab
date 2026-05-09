/**
 * Pure parser for Claude Code CLI's `--output-format stream-json --verbose`
 * line stream. Extracted from the adapter so it's testable without spawning
 * a child process. Feeds NDJSON lines in, emits AI SDK v6 UIMessageStreamPart
 * payloads out via a small state machine.
 *
 * Stream line shapes we recognize (others are ignored):
 *   {"type":"system","subtype":"init","session_id":"…"}
 *   {"type":"assistant","message":{"content":[{"type":"text","text":"…"}]}}
 *   {"type":"result","subtype":"success","is_error":false}
 */

import type { CliEvent, CliStreamPart } from './types';

export type ClaudeStreamLine =
    | { type: 'system'; subtype?: string; session_id?: string }
    | {
          type: 'assistant';
          message?: {
              content?: ReadonlyArray<{ type: string; text?: string }>;
          };
      }
    | { type: 'result'; subtype?: 'success' | 'error'; is_error?: boolean }
    | { type: string; [key: string]: unknown };

export function parseLine(line: string): ClaudeStreamLine | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
        return JSON.parse(trimmed) as ClaudeStreamLine;
    } catch {
        return null;
    }
}

export type ClaudeParserState = {
    streamId: string;
    messageId: string;
    textBlockId: string;
    textOpened: boolean;
    receivedAny: boolean;
};

export function createParserState(streamId: string): ClaudeParserState {
    const messageId = `claude-${streamId}`;
    return {
        streamId,
        messageId,
        textBlockId: `${messageId}-text`,
        textOpened: false,
        receivedAny: false,
    };
}

export function startEvents(state: ClaudeParserState): CliEvent[] {
    return [
        {
            streamId: state.streamId,
            kind: 'part',
            payload: { type: 'start', messageId: state.messageId },
        },
        { streamId: state.streamId, kind: 'part', payload: { type: 'start-step' } },
    ];
}

/**
 * Process one parsed line. Mutates state and returns CliEvents to emit.
 * No-ops for line shapes that don't carry text content.
 */
export function processLine(state: ClaudeParserState, parsed: ClaudeStreamLine): CliEvent[] {
    if (parsed.type !== 'assistant') return [];
    const content =
        (parsed as Extract<ClaudeStreamLine, { type: 'assistant' }>).message?.content ?? [];
    const events: CliEvent[] = [];
    for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string') {
            if (!state.textOpened) {
                state.textOpened = true;
                events.push({
                    streamId: state.streamId,
                    kind: 'part',
                    payload: { type: 'text-start', id: state.textBlockId },
                });
            }
            state.receivedAny = true;
            events.push({
                streamId: state.streamId,
                kind: 'part',
                payload: { type: 'text-delta', id: state.textBlockId, delta: block.text },
            });
        }
    }
    return events;
}

/**
 * Flush terminal events when the child exits. Keeps the success vs error
 * decision colocated with the parser so the adapter is just plumbing.
 */
export function finalizeEvents(
    state: ClaudeParserState,
    args: { exitCode: number | null; stderr: string },
): CliEvent[] {
    const events: CliEvent[] = [];
    if (state.textOpened) {
        events.push({
            streamId: state.streamId,
            kind: 'part',
            payload: { type: 'text-end', id: state.textBlockId },
        });
    }
    events.push({ streamId: state.streamId, kind: 'part', payload: { type: 'finish-step' } });

    if (args.exitCode === 0 && state.receivedAny) {
        events.push({ streamId: state.streamId, kind: 'part', payload: { type: 'finish' } });
        events.push({ streamId: state.streamId, kind: 'finish' });
    } else {
        const detail = args.stderr.trim() || `claude exited with code ${args.exitCode}`;
        const errPart: CliStreamPart = { type: 'error', errorText: detail };
        events.push({ streamId: state.streamId, kind: 'part', payload: errPart });
        events.push({
            streamId: state.streamId,
            kind: 'error',
            payload: { message: detail, code: 'cli_error' },
        });
    }
    return events;
}
