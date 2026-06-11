/**
 * Caps on client-supplied LLM input. Without these, any signed-in caller
 * could POST an arbitrarily large `messages` array and drive OpenRouter
 * spend against Weblab's account.
 *
 * The per-message cap must accommodate legitimate large parts: read_skill
 * tool outputs (full SKILL.md bodies run 8–30KB), file context blocks, and
 * clone scrape blobs all ride inside a single message. The original 16KB cap
 * rejected the AI SDK's own auto-continuation request the moment a skill was
 * read — surfacing as "message exceeds 16384 bytes" and a chat stuck on
 * "Reading skill" forever. Abuse is still bounded by the total-payload cap.
 */
export const MAX_MESSAGES = 200;
export const MAX_MESSAGE_BYTES = 512 * 1024;
export const MAX_TOTAL_MESSAGE_BYTES = 4 * 1024 * 1024;

function getSerializedBytes(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** Returns a human-readable rejection reason, or null when the payload is OK. */
export function validateMessagePayload(messages: unknown[]): string | null {
    if (messages.length > MAX_MESSAGES) {
        return `too many messages (max ${MAX_MESSAGES})`;
    }

    let totalBytes = 0;
    for (const message of messages) {
        const messageBytes = getSerializedBytes(message);
        if (messageBytes > MAX_MESSAGE_BYTES) {
            return `message exceeds ${MAX_MESSAGE_BYTES} bytes`;
        }
        totalBytes += messageBytes;
        if (totalBytes > MAX_TOTAL_MESSAGE_BYTES) {
            return `total message payload exceeds ${MAX_TOTAL_MESSAGE_BYTES} bytes`;
        }
    }

    return null;
}
