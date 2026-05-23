import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
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
    // hsl(hue, 70%, 60%) → rgba — fixed S=0.70, L=0.60
    const h = hue / 360;
    const q = 0.6 + 0.7 - 0.6 * 0.7; // 0.88
    const p = 2 * 0.6 - q; // 0.32
    const ch = (t: number) => {
        const n = ((t % 1) + 1) % 1;
        if (n < 1 / 6) return p + (q - p) * 6 * n;
        if (n < 1 / 2) return q;
        if (n < 2 / 3) return p + (q - p) * (2 / 3 - n) * 6;
        return p;
    };
    const r = Math.round(ch(h + 1 / 3) * 255);
    const g = Math.round(ch(h) * 255);
    const b = Math.round(ch(h - 1 / 3) * 255);
    return `rgba(${r}, ${g}, ${b}, 1)`;
}

function getStringMetadata(metadata: Record<string, unknown>, key: string): string | undefined {
    const value = metadata[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export class PresenceManager {
    /** Presence data for every OTHER user currently in this project. */
    remoteUsers = observable.map<string, RemoteUser>();
    /** The auth userId of the local user. Exposed so components can identify "self". */
    currentUserId: string | null = null;

    private channel: RealtimeChannel | null = null;
    private myPresence: PresencePayload | null = null;
    private lastCursorUpdate = 0;
    private initRunId = 0;
    private static readonly CURSOR_THROTTLE_MS = 50;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable<this, 'channel' | 'myPresence' | 'lastCursorUpdate' | 'initRunId'>(
            this,
            {
                channel: false,
                myPresence: false,
                lastCursorUpdate: false,
                initRunId: false,
            },
        );
    }

    async init() {
        const initRunId = ++this.initRunId;

        // Bug fix #1: Guard against double-init (StrictMode, hot reload).
        // Tear down the old channel before creating a new one.
        if (this.channel) {
            await this.channel.unsubscribe();
            this.channel = null;
        }

        const supabase = createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user || initRunId !== this.initRunId) return;

        runInAction(() => {
            this.currentUserId = user.id;
        });

        const projectId = this.editorEngine.projectId;
        const topic = `presence:${projectId}`;
        await Promise.all(
            supabase
                .getChannels()
                .filter((channel) => channel.topic === `realtime:${topic}`)
                .map((channel) => supabase.removeChannel(channel)),
        );

        if (initRunId !== this.initRunId) return;

        const metadata = user.user_metadata as Record<string, unknown>;

        this.myPresence = {
            userId: user.id,
            displayName:
                getStringMetadata(metadata, 'full_name') ??
                getStringMetadata(metadata, 'name') ??
                user.email ??
                'Unknown',
            avatarUrl: getStringMetadata(metadata, 'avatar_url'),
            cursorX: null,
            cursorY: null,
        };

        // Capture in a local const so TypeScript can narrow the type through the
        // chained .on().subscribe() calls. (this.channel is RealtimeChannel | null,
        // so the compiler can't narrow it on a mutable property.)
        const channel = supabase.channel(topic, {
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
            .subscribe((status) => {
                if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
                    // Bug fix #2 cont'd: re-check both channel and myPresence are still live.
                    if (!this.channel || !this.myPresence) return;
                    void this.channel.track(this.myPresence).catch((err) => {
                        console.warn('[PresenceManager] Failed to track presence:', err);
                    });
                } else if (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR) {
                    // Bug fix #11: log channel errors instead of silently ignoring them.
                    console.warn('[PresenceManager] Realtime channel error for project', projectId);
                } else if (status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT) {
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
        void this.channel.track(this.myPresence).catch((err) => {
            console.warn('[PresenceManager] Failed to clear presence cursor:', err);
        });
    }

    /** Returns true if the given user currently has the project open. */
    isOnline(userId: string): boolean {
        if (userId === this.currentUserId) return true;
        return this.remoteUsers.has(userId);
    }

    clear() {
        if (this.channel) {
            void this.channel.unsubscribe();
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
