import { describe, expect, test } from 'bun:test';

import {
    createParserState,
    finalizeEvents,
    parseLine,
    processLine,
    startEvents,
} from './claude-parser';

describe('parseLine', () => {
    test('returns null for empty / whitespace lines', () => {
        expect(parseLine('')).toBeNull();
        expect(parseLine('   ')).toBeNull();
        expect(parseLine('\n')).toBeNull();
    });

    test('returns null for malformed JSON', () => {
        expect(parseLine('{not json')).toBeNull();
        expect(parseLine('null is not an object but is JSON {')).toBeNull();
    });

    test('parses assistant text frames', () => {
        const line = JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'Hello' }] },
        });
        const parsed = parseLine(line);
        expect(parsed?.type).toBe('assistant');
    });
});

describe('processLine', () => {
    test('emits text-start once, then text-delta per text block', () => {
        const state = createParserState('s1');
        const e1 = processLine(state, {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'Hello ' }] },
        });
        expect(e1.length).toBe(2);
        expect(e1[0]?.kind).toBe('part');
        if (e1[0]?.kind === 'part') expect(e1[0].payload.type).toBe('text-start');
        if (e1[1]?.kind === 'part') {
            expect(e1[1].payload.type).toBe('text-delta');
            if (e1[1].payload.type === 'text-delta') expect(e1[1].payload.delta).toBe('Hello ');
        }

        // Second frame should NOT re-open the text block.
        const e2 = processLine(state, {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'world!' }] },
        });
        expect(e2.length).toBe(1);
        if (e2[0]?.kind === 'part') {
            expect(e2[0].payload.type).toBe('text-delta');
            if (e2[0].payload.type === 'text-delta') expect(e2[0].payload.delta).toBe('world!');
        }
    });

    test('ignores non-assistant frames', () => {
        const state = createParserState('s2');
        const events = processLine(state, { type: 'system', subtype: 'init', session_id: 'x' });
        expect(events.length).toBe(0);
        expect(state.textOpened).toBe(false);
    });

    test('ignores assistant frames with non-text content blocks', () => {
        const state = createParserState('s3');
        const events = processLine(state, {
            type: 'assistant',
            message: {
                content: [{ type: 'tool_use' }, { type: 'thinking' }] as unknown as ReadonlyArray<{
                    type: string;
                    text?: string;
                }>,
            },
        });
        expect(events.length).toBe(0);
    });
});

describe('finalizeEvents', () => {
    test('exit 0 with text → text-end, finish-step, finish, finish event', () => {
        const state = createParserState('s4');
        // Open the text block.
        processLine(state, {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'hi' }] },
        });
        const events = finalizeEvents(state, { exitCode: 0, stderr: '' });
        const partTypes = events
            .filter((e) => e.kind === 'part')
            .map((e) => (e.kind === 'part' ? e.payload.type : null));
        expect(partTypes).toEqual(['text-end', 'finish-step', 'finish']);
        expect(events.at(-1)?.kind).toBe('finish');
    });

    test('exit 0 but no text received → treated as error', () => {
        const state = createParserState('s5');
        const events = finalizeEvents(state, { exitCode: 0, stderr: '' });
        const last = events.at(-1);
        expect(last?.kind).toBe('error');
        if (last?.kind === 'error') {
            expect(last.payload.code).toBe('cli_error');
        }
    });

    test('non-zero exit surfaces stderr in error event', () => {
        const state = createParserState('s6');
        processLine(state, {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'partial' }] },
        });
        const events = finalizeEvents(state, { exitCode: 2, stderr: 'auth failed' });
        const errEvent = events.find((e) => e.kind === 'error');
        expect(errEvent).toBeDefined();
        if (errEvent?.kind === 'error') {
            expect(errEvent.payload.message).toBe('auth failed');
        }
    });
});

describe('startEvents', () => {
    test('emits start + start-step in order', () => {
        const state = createParserState('s7');
        const events = startEvents(state);
        expect(events.length).toBe(2);
        if (events[0]?.kind === 'part') expect(events[0].payload.type).toBe('start');
        if (events[1]?.kind === 'part') expect(events[1].payload.type).toBe('start-step');
    });
});

describe('end-to-end fixture', () => {
    // Recorded NDJSON shape from `claude -p "hello" --output-format stream-json --verbose`.
    const fixture = [
        '{"type":"system","subtype":"init","session_id":"abc"}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"Hi "}]}}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"there!"}]}}',
        '{"type":"result","subtype":"success","is_error":false}',
    ];

    test('produces start, deltas, and clean finish', () => {
        const state = createParserState('e2e');
        const all = [...startEvents(state)];
        for (const line of fixture) {
            const parsed = parseLine(line);
            if (parsed) all.push(...processLine(state, parsed));
        }
        all.push(...finalizeEvents(state, { exitCode: 0, stderr: '' }));

        const partTypes = all
            .filter((e) => e.kind === 'part')
            .map((e) => (e.kind === 'part' ? e.payload.type : null));
        expect(partTypes).toEqual([
            'start',
            'start-step',
            'text-start',
            'text-delta',
            'text-delta',
            'text-end',
            'finish-step',
            'finish',
        ]);

        const deltas = all
            .filter((e) => e.kind === 'part')
            .map((e) =>
                e.kind === 'part' && e.payload.type === 'text-delta' ? e.payload.delta : null,
            )
            .filter((x): x is string => x !== null);
        expect(deltas.join('')).toBe('Hi there!');
    });
});
