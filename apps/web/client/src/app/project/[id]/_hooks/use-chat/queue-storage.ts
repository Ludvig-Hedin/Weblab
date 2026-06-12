import type { QueuedMessage } from '@weblab/models';

const QUEUE_VERSION = 1;
const MAX_PERSISTED = 50;

const key = (conversationId: string) => `weblab:chat:queue:${QUEUE_VERSION}:${conversationId}`;

function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function reviveDates(raw: unknown): QueuedMessage[] {
    if (!Array.isArray(raw)) return [];
    const out: QueuedMessage[] = [];
    for (const entry of raw) {
        if (
            !entry ||
            typeof entry !== 'object' ||
            typeof (entry as QueuedMessage).id !== 'string' ||
            typeof (entry as QueuedMessage).content !== 'string'
        ) {
            continue;
        }
        const e = entry as QueuedMessage;
        out.push({
            ...e,
            timestamp: e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp),
        });
    }
    return out;
}

export function loadQueue(conversationId: string): QueuedMessage[] {
    if (!isBrowser() || !conversationId) return [];
    try {
        const raw = window.localStorage.getItem(key(conversationId));
        if (!raw) return [];
        return reviveDates(JSON.parse(raw));
    } catch {
        return [];
    }
}

export function saveQueue(conversationId: string, queue: QueuedMessage[]): void {
    if (!isBrowser() || !conversationId) return;
    try {
        if (queue.length === 0) {
            window.localStorage.removeItem(key(conversationId));
            return;
        }
        // Keep the head — that's the next message to drain. Drop the tail when over cap.
        const trimmed = queue.length > MAX_PERSISTED ? queue.slice(0, MAX_PERSISTED) : queue;
        window.localStorage.setItem(key(conversationId), JSON.stringify(trimmed));
    } catch {
        // Quota exceeded / private mode — silently no-op.
    }
}

// ---------------------------------------------------------------------------
// In-flight stream persistence
// When the page unloads mid-stream, we save a flag so the next mount knows
// to auto-regenerate the last assistant turn instead of waiting silently.
// ---------------------------------------------------------------------------

const inflightKey = (conversationId: string) =>
    `weblab:chat:inflight:${QUEUE_VERSION}:${conversationId}`;

export function markStreamInFlight(conversationId: string): void {
    if (!isBrowser() || !conversationId) return;
    try {
        window.localStorage.setItem(inflightKey(conversationId), '1');
    } catch {
        // Quota exceeded / private mode — silently no-op.
    }
}

export function clearStreamInFlight(conversationId: string): void {
    if (!isBrowser() || !conversationId) return;
    try {
        window.localStorage.removeItem(inflightKey(conversationId));
    } catch {
        // Ignore.
    }
}

export function wasStreamInFlight(conversationId: string): boolean {
    if (!isBrowser() || !conversationId) return false;
    try {
        return window.localStorage.getItem(inflightKey(conversationId)) === '1';
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Pending-turn persistence
// The chat route does NOT persist an interrupted turn (abort → refund +
// return), so after a reload the DB history ends at the PREVIOUS user
// message. We persist the just-sent user turn alongside the inflight flag so
// recovery can re-send it instead of regenerating an answer to an old
// question. Lifecycle mirrors the inflight flag: saved on send, cleared
// whenever the stream settles while the page is alive.
// ---------------------------------------------------------------------------

export interface PendingTurn {
    content: string;
    type: string;
}

const pendingTurnKey = (conversationId: string) =>
    `weblab:chat:pending-turn:${QUEUE_VERSION}:${conversationId}`;

export function savePendingTurn(conversationId: string, turn: PendingTurn): void {
    if (!isBrowser() || !conversationId) return;
    try {
        window.localStorage.setItem(pendingTurnKey(conversationId), JSON.stringify(turn));
    } catch {
        // Quota exceeded / private mode — silently no-op.
    }
}

export function loadPendingTurn(conversationId: string): PendingTurn | null {
    if (!isBrowser() || !conversationId) return null;
    try {
        const raw = window.localStorage.getItem(pendingTurnKey(conversationId));
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (
            !parsed ||
            typeof parsed !== 'object' ||
            typeof (parsed as PendingTurn).content !== 'string' ||
            typeof (parsed as PendingTurn).type !== 'string'
        ) {
            return null;
        }
        return parsed as PendingTurn;
    } catch {
        return null;
    }
}

export function clearPendingTurn(conversationId: string): void {
    if (!isBrowser() || !conversationId) return;
    try {
        window.localStorage.removeItem(pendingTurnKey(conversationId));
    } catch {
        // Ignore.
    }
}

export function clearQueue(conversationId: string): void {
    if (!isBrowser() || !conversationId) return;
    try {
        window.localStorage.removeItem(key(conversationId));
    } catch {
        // Ignore.
    }
}
