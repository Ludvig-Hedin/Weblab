import { makeAutoObservable, observable, runInAction } from 'mobx';

import type { EditorEngine } from '../engine';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';

export interface RemoteUser {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    cursorX: number | null;
    cursorY: number | null;
    color: string;
}

interface PresencePayload {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    cursorX: number | null;
    cursorY: number | null;
}

/** Deterministic hue from a userId string so each user always gets the same color. */
function getUserColor(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
}

export class PresenceManager {
    /** Presence data for every OTHER user currently in this project. */
    remoteUsers = observable.map<string, RemoteUser>();
    /** The auth userId of the local user. Exposed so components can identify "self". */
    currentUserId: string | null = null;

    private channel: RealtimeChannel | null = null;
    private myPresence: PresencePayload | null = null;
    private lastCursorUpdate = 0;
    private static readonly CURSOR_THROTTLE_MS = 50;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    async init() {
        // Bug fix #1: Guard against double-init (StrictMode, hot reload).
        // Tear down the old channel before creating a new one.
        if (this.channel) {
            this.channel.unsubscribe();
            this.channel = null;
        }

        const supabase = createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        runInAction(() => {
            this.currentUserId = user.id;
        });

        const projectId = this.editorEngine.projectId;

        this.myPresence = {
            userId: user.id,
            displayName:
                user.user_metadata?.full_name ??
                user.user_metadata?.name ??
                user.email ??
                'Unknown',
            avatarUrl: user.user_metadata?.avatar_url ?? undefined,
            cursorX: null,
            cursorY: null,
        };

        // Capture in a local const so TypeScript can narrow the type through the
        // chained .on().subscribe() calls. (this.channel is RealtimeChannel | null,
        // so the compiler can't narrow it on a mutable property.)
        const channel = supabase.channel(`presence:${projectId}`, {
            config: { presence: { key: user.id } },
        });
        this.channel = channel;

        channel
            .on('presence', { event: 'sync' }, () => {
                // Bug fix #2: channel may have been cleared between subscription and callback.
                if (!this.channel) return;
                const state = this.channel.presenceState<PresencePayload>();
                runInAction(() => {
                    this.remoteUsers.clear();
                    for (const [key, presences] of Object.entries(state)) {
                        if (key === user.id) continue; // skip self
                        const presence = presences[0];
                        if (!presence) continue;
                        // Bug fix #12: defensive fallbacks — a stale or buggy client
                        // may send an incomplete payload.
                        this.remoteUsers.set(key, {
                            userId: presence.userId ?? key,
                            displayName: presence.displayName ?? 'Unknown',
                            avatarUrl: presence.avatarUrl,
                            cursorX: presence.cursorX ?? null,
                            cursorY: presence.cursorY ?? null,
                            color: getUserColor(key),
                        });
                    }
                });
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // Bug fix #2 cont'd: re-check both channel and myPresence are still live.
                    if (!this.channel || !this.myPresence) return;
                    await this.channel.track(this.myPresence);
                } else if (status === 'CHANNEL_ERROR') {
                    // Bug fix #11: log channel errors instead of silently ignoring them.
                    console.warn('[PresenceManager] Realtime channel error for project', projectId);
                } else if (status === 'TIMED_OUT') {
                    console.warn(
                        '[PresenceManager] Realtime channel timed out for project',
                        projectId,
                    );
                }
            });
    }

    /**
     * Broadcast the local cursor position (canvas-space coordinates).
     * Self-throttled so we never flood Supabase Realtime.
     */
    updateCursor(canvasX: number, canvasY: number) {
        const now = Date.now();
        if (now - this.lastCursorUpdate < PresenceManager.CURSOR_THROTTLE_MS) return;
        this.lastCursorUpdate = now;

        if (!this.channel || !this.myPresence) return;
        this.myPresence = { ...this.myPresence, cursorX: canvasX, cursorY: canvasY };
        // Fire-and-forget — never await inside a mousemove handler.
        this.channel.track(this.myPresence).catch(() => {
            // Channel may not be ready yet; silently ignore.
        });
    }

    /** Hide our cursor from remote users when the pointer leaves the canvas. */
    clearCursor() {
        if (!this.channel || !this.myPresence) return;
        this.myPresence = { ...this.myPresence, cursorX: null, cursorY: null };
        this.channel.track(this.myPresence).catch(() => {});
    }

    /** Returns true if the given user currently has the project open. */
    isOnline(userId: string): boolean {
        if (userId === this.currentUserId) return true;
        return this.remoteUsers.has(userId);
    }

    clear() {
        if (this.channel) {
            this.channel.unsubscribe();
            this.channel = null;
        }
        runInAction(() => {
            this.remoteUsers.clear();
            this.currentUserId = null;
        });
        this.myPresence = null;
        this.lastCursorUpdate = 0;
    }
}
