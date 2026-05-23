import { makeAutoObservable } from 'mobx';

import type { EditorEngine } from '../engine';

// Post-migration: presence (live cursors) ran on Supabase Realtime channels.
// Convex has no drop-in WS channel primitive — port deferred to a follow-up
// PR that builds a presence-table-driven implementation.
//
// This stub keeps the EditorEngine API intact (other modules call `start()`,
// `stop()`, `updateCursor()`) but performs no network work. Single-user
// migration scope makes this safe: there are no remote cursors to broadcast.

export interface RemoteUser {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    cursorX: number | null;
    cursorY: number | null;
    color: string;
}

export class PresenceManager {
    remoteUsers: RemoteUser[] = [];
    currentUserId: string | null = null;

    // member-row.tsx calls this as `presence.isOnline(userId)` — must be a fn,
    // not a boolean. Always true in single-user mode (no remote users).
    isOnline(_userId: string): boolean {
        return true;
    }

    clearCursor(): void {
        // no-op
    }

    constructor(_engine: EditorEngine) {
        makeAutoObservable(this);
    }

    // EditorEngine init lifecycle hook.
    init(): void {
        // no-op — Convex-driven presence will register here in a follow-up PR.
    }

    start(): void {
        // no-op
    }

    stop(): void {
        // no-op
    }

    updateCursor(_x: number | null, _y: number | null): void {
        // no-op
    }

    clear(): void {
        this.remoteUsers = [];
    }
}
