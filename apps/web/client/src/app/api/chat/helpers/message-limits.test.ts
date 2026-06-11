import { describe, expect, it } from 'bun:test';

import {
    MAX_MESSAGE_BYTES,
    MAX_MESSAGES,
    MAX_TOTAL_MESSAGE_BYTES,
    validateMessagePayload,
} from './message-limits';

const messageOfBytes = (bytes: number) => ({
    role: 'assistant',
    parts: [{ type: 'text', text: 'x'.repeat(bytes) }],
});

describe('validateMessagePayload', () => {
    it('accepts a normal small conversation', () => {
        expect(validateMessagePayload([messageOfBytes(500), messageOfBytes(2_000)])).toBeNull();
    });

    it('accepts a message carrying a large tool output (e.g. a 30KB SKILL.md body)', () => {
        // Regression: the old 16KB per-message cap rejected the AI SDK's
        // auto-continuation after read_skill, bricking create-with-AI chats
        // with "message exceeds 16384 bytes".
        expect(validateMessagePayload([messageOfBytes(30 * 1024)])).toBeNull();
        expect(validateMessagePayload([messageOfBytes(100 * 1024)])).toBeNull();
    });

    it('rejects a single message over the per-message cap', () => {
        const result = validateMessagePayload([messageOfBytes(MAX_MESSAGE_BYTES + 1)]);
        expect(result).toBe(`message exceeds ${MAX_MESSAGE_BYTES} bytes`);
    });

    it('rejects when the total payload exceeds the aggregate cap', () => {
        const perMessage = MAX_MESSAGE_BYTES - 1024;
        const count = Math.ceil(MAX_TOTAL_MESSAGE_BYTES / perMessage) + 1;
        const messages = Array.from({ length: count }, () => messageOfBytes(perMessage));
        expect(validateMessagePayload(messages)).toBe(
            `total message payload exceeds ${MAX_TOTAL_MESSAGE_BYTES} bytes`,
        );
    });

    it('rejects too many messages', () => {
        const messages = Array.from({ length: MAX_MESSAGES + 1 }, () => messageOfBytes(10));
        expect(validateMessagePayload(messages)).toBe(`too many messages (max ${MAX_MESSAGES})`);
    });
});
