/**
 * Per-conversation memory of the CLI session (Claude Code session id, Codex
 * thread id) so the next chat turn can resume it and send only the new
 * message instead of replaying the whole transcript.
 *
 * A stored session is only reused when nothing happened outside it: same
 * provider, same working copy, and the message right before the new user
 * message is the assistant reply that session produced. Anything else
 * (switched models, regenerated, edited history) falls back to the
 * transcript, which the desktop side also does when a session has vanished.
 */

export type StoredCliSession = {
    provider: string;
    sessionId: string;
    workingDirectory: string;
    lastAssistantMessageId: string;
};

type MessageLike = { id: string; role: string };

const KEY_PREFIX = 'weblab:cli-session:v1:';

export function loadCliSession(conversationId: string): StoredCliSession | null {
    try {
        const raw = window.localStorage.getItem(KEY_PREFIX + conversationId);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<StoredCliSession>;
        if (
            typeof parsed.provider !== 'string' ||
            typeof parsed.sessionId !== 'string' ||
            typeof parsed.workingDirectory !== 'string' ||
            typeof parsed.lastAssistantMessageId !== 'string'
        ) {
            return null;
        }
        return parsed as StoredCliSession;
    } catch {
        return null;
    }
}

export function saveCliSession(conversationId: string, session: StoredCliSession): void {
    try {
        window.localStorage.setItem(KEY_PREFIX + conversationId, JSON.stringify(session));
    } catch {
        // Storage full or blocked: the next turn replays the transcript instead.
    }
}

export function canResumeCliSession(
    stored: StoredCliSession | null,
    current: {
        provider: string;
        workingDirectory: string;
        messages: ReadonlyArray<MessageLike>;
    },
): boolean {
    if (!stored) return false;
    if (stored.provider !== current.provider) return false;
    if (stored.workingDirectory !== current.workingDirectory) return false;
    const { messages } = current;
    const last = messages[messages.length - 1];
    const previous = messages[messages.length - 2];
    return (
        last?.role === 'user' &&
        previous?.role === 'assistant' &&
        previous.id === stored.lastAssistantMessageId
    );
}
