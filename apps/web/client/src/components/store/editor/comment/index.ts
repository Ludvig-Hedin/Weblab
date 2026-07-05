import type { ConvexHttpClient } from 'convex/browser';
import { api as convexApi } from '@convex/_generated/api';
import { makeAutoObservable, observable, runInAction } from 'mobx';

import type { EditorEngine } from '../engine';
import type { Id } from '@convex/_generated/dataModel';
import {
    getConvexHttpClient,
    whenConvexAuthReady,
} from '@/components/store/lib/convex-http-client';

// Convex stores comments/replies with `_id` + numeric epoch timestamps; the
// editor was written against the Drizzle shape (`id`, `Date`). Normalise once
// at the store boundary so downstream components keep using the same shape.
type ConvexCommentReplyDoc = {
    _id: string;
    _creationTime: number;
    commentId: string;
    content: string;
    authorId: string;
    authorName: string;
    updatedAt: number;
};

type ConvexCommentDoc = {
    _id: string;
    _creationTime: number;
    projectId: string;
    canvasX: number;
    canvasY: number;
    elementSelector?: string;
    content: string;
    authorId: string;
    authorName: string;
    updatedAt: number;
    resolvedAt?: number;
    replies?: ConvexCommentReplyDoc[];
};

function normalizeReply(doc: ConvexCommentReplyDoc): CommentReply {
    return {
        id: doc._id,
        commentId: doc.commentId,
        content: doc.content,
        authorId: doc.authorId,
        authorName: doc.authorName,
        createdAt: new Date(doc._creationTime),
        updatedAt: new Date(doc.updatedAt),
    };
}

function normalizeComment(doc: ConvexCommentDoc): ProjectComment {
    return {
        id: doc._id,
        projectId: doc.projectId,
        canvasX: doc.canvasX,
        canvasY: doc.canvasY,
        elementSelector: doc.elementSelector ?? null,
        content: doc.content,
        authorId: doc.authorId,
        authorName: doc.authorName,
        createdAt: new Date(doc._creationTime),
        updatedAt: new Date(doc.updatedAt),
        resolvedAt: doc.resolvedAt != null ? new Date(doc.resolvedAt) : null,
        replies: (doc.replies ?? []).map(normalizeReply),
    };
}

export interface ProjectComment {
    id: string;
    projectId: string;
    canvasX: number;
    canvasY: number;
    elementSelector: string | null;
    content: string;
    authorId: string;
    authorName: string;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
    replies: CommentReply[];
}

export interface CommentReply {
    id: string;
    commentId: string;
    content: string;
    authorId: string;
    authorName: string;
    createdAt: Date;
    updatedAt: Date;
}

function parseSeenCommentIds(raw: string): string[] {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

function getTRPCErrorCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null) {
        return undefined;
    }

    const data = 'data' in error ? error.data : undefined;
    if (typeof data !== 'object' || data === null || !('code' in data)) {
        return undefined;
    }

    return typeof data.code === 'string' ? data.code : undefined;
}

/**
 * Convex throws plain `Error('UNAUTHORIZED')` / `Error('FORBIDDEN: ...')` for
 * permission failures, surfaced to the client wrapped in a `ConvexError`
 * whose message includes the original string. Detect either keyword in the
 * message so the comment polling loop disables itself cleanly when a viewer
 * lacks `project.view` access (logged-out preview, expired session) instead
 * of hammering the endpoint every 30s.
 */
function isConvexPermissionError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /\b(UNAUTHORIZED|FORBIDDEN)\b/i.test(message);
}

export class CommentManager {
    comments: ProjectComment[] = [];
    activeCommentId: string | null = null;
    pendingPlacement: { x: number; y: number } | null = null;
    isLoading = false;
    commentsVisible = true;
    seenCommentIds: Set<string> = observable.set<string>();

    private pollingInterval: ReturnType<typeof setInterval> | null = null;
    private currentProjectId: string | null = null;
    private loadPromise: Promise<void> | null = null;
    private commentsUnavailable = false;
    private hasLoggedLoadError = false;
    // Latched by clear(); reset at the top of init(). init() is fired unawaited
    // from EditorEngine.init() and awaits loadComments (auth + network). Without
    // this guard, a clear() landing during that await would still let the
    // continuation call startPolling — registering a 30s interval + a
    // visibilitychange listener on a torn-down manager that nothing stops.
    private disposed = false;
    private convex: ConvexHttpClient = getConvexHttpClient();

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    async init() {
        this.disposed = false;
        const projectId = this.editorEngine.projectId;
        // Set this here (not only in startPolling) so the comment mutations
        // — which refresh the UI via `if (this.currentProjectId) loadComments(...)`
        // — still re-fetch even when polling never starts (e.g. comments
        // briefly unavailable on boot). startPolling re-assigns the same value.
        this.currentProjectId = projectId;
        this.loadSeenIds(projectId);
        await this.loadComments(projectId);
        // Bail if the manager was cleared while loadComments was awaiting.
        if (this.disposed) return;
        if (!this.commentsUnavailable) {
            this.startPolling(projectId);
        }
    }

    // ─── Seen / unread tracking ──────────────────────────────────────────────

    private storageKey(projectId: string) {
        return `weblab_seen_comments_${projectId}`;
    }

    private loadSeenIds(projectId: string) {
        if (typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem(this.storageKey(projectId));
            if (raw) {
                const ids = parseSeenCommentIds(raw);
                ids.forEach((id) => this.seenCommentIds.add(id));
            }
        } catch {
            // ignore parse errors
        }
    }

    private saveSeenIds(projectId: string) {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(
                this.storageKey(projectId),
                JSON.stringify(Array.from(this.seenCommentIds)),
            );
        } catch {
            // ignore storage errors
        }
    }

    markAsSeen(commentId: string) {
        this.seenCommentIds.add(commentId);
        if (this.currentProjectId) {
            this.saveSeenIds(this.currentProjectId);
        }
    }

    markAllAsSeen() {
        this.comments.forEach((c) => this.seenCommentIds.add(c.id));
        if (this.currentProjectId) {
            this.saveSeenIds(this.currentProjectId);
        }
    }

    isUnread(commentId: string): boolean {
        return !this.seenCommentIds.has(commentId);
    }

    get unreadCount(): number {
        return this.comments.filter((c) => this.isUnread(c.id)).length;
    }

    // ─── Visibility toggle ───────────────────────────────────────────────────

    toggleCommentsVisible() {
        this.commentsVisible = !this.commentsVisible;
    }

    // ─── Polling ─────────────────────────────────────────────────────────────

    async loadComments(projectId: string) {
        if (this.commentsUnavailable) {
            return;
        }

        if (this.loadPromise) {
            return this.loadPromise;
        }

        this.loadPromise = this.loadCommentsOnce(projectId).finally(() => {
            this.loadPromise = null;
        });
        return this.loadPromise;
    }

    private async loadCommentsOnce(projectId: string) {
        runInAction(() => {
            this.isLoading = true;
        });
        try {
            // Wait for the Clerk token to attach to the shared client before the
            // first protected query — otherwise this races the auth bridge on
            // editor mount, gets UNAUTHORIZED, and permanently disables comments.
            await whenConvexAuthReady();
            const convexProjectId = projectId as Id<'projects'>;
            const result = (await this.convex.query(convexApi.comments.list, {
                projectId: convexProjectId,
            })) as ConvexCommentDoc[];
            const normalized = result.map(normalizeComment);
            runInAction(() => {
                this.comments = normalized;
                this.isLoading = false;
            });
        } catch (error) {
            // tRPC-shaped code is still checked for backwards-compat with any
            // legacy thrown error, but Convex throws plain `Error` instances
            // whose message includes the marker — the secondary check covers
            // those.
            const code = getTRPCErrorCode(error);
            const shouldDisable =
                code === 'UNAUTHORIZED' ||
                code === 'FORBIDDEN' ||
                (code === undefined && isConvexPermissionError(error));

            if (shouldDisable) {
                this.commentsUnavailable = true;
                this.stopPolling();
            }

            if (!this.hasLoggedLoadError) {
                console.error('Failed to load comments:', error);
                this.hasLoggedLoadError = true;
            }
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    startPolling(projectId: string) {
        if (this.commentsUnavailable || this.disposed) {
            return;
        }
        this.currentProjectId = projectId;
        this.stopPolling();
        this.pollingInterval = setInterval(() => {
            if (!this.currentProjectId) return;
            void this.loadComments(this.currentProjectId);
        }, 30_000);
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.onVisibilityChange);
        }
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.onVisibilityChange);
        }
    }

    private onVisibilityChange = () => {
        if (document.visibilityState === 'visible' && this.currentProjectId) {
            void this.loadComments(this.currentProjectId);
        }
    };

    // ─── State setters ───────────────────────────────────────────────────────

    setActiveCommentId(id: string | null) {
        this.activeCommentId = id;
        if (id !== null) {
            this.markAsSeen(id);
        }
    }

    setPendingPlacement(coords: { x: number; y: number } | null) {
        this.pendingPlacement = coords;
        if (coords !== null) {
            this.activeCommentId = null;
        }
    }

    // ─── CRUD ────────────────────────────────────────────────────────────────

    async createComment(input: {
        projectId: string;
        canvasX: number;
        canvasY: number;
        content: string;
        elementSelector?: string;
    }) {
        try {
            const result = (await this.convex.mutation(convexApi.comments.create, {
                projectId: input.projectId as Id<'projects'>,
                canvasX: input.canvasX,
                canvasY: input.canvasY,
                content: input.content,
                elementSelector: input.elementSelector,
            })) as ConvexCommentDoc;
            await this.loadComments(input.projectId);
            const newId = result._id;
            runInAction(() => {
                this.pendingPlacement = null;
                this.markAsSeen(newId); // own comments are immediately "seen"
                this.activeCommentId = newId;
            });
        } catch (error) {
            console.error('Failed to create comment:', error);
            throw error;
        }
    }

    async updateComment(commentId: string, content: string) {
        try {
            await this.convex.mutation(convexApi.comments.update, {
                commentId: commentId as Id<'projectComments'>,
                content,
            });
            if (this.currentProjectId) {
                await this.loadComments(this.currentProjectId);
            }
        } catch (error) {
            console.error('Failed to update comment:', error);
            throw error;
        }
    }

    async deleteComment(commentId: string) {
        try {
            await this.convex.mutation(convexApi.comments.remove, {
                commentId: commentId as Id<'projectComments'>,
            });
            if (this.activeCommentId === commentId) {
                runInAction(() => {
                    this.activeCommentId = null;
                });
            }
            if (this.currentProjectId) {
                await this.loadComments(this.currentProjectId);
            }
        } catch (error) {
            console.error('Failed to delete comment:', error);
            throw error;
        }
    }

    async resolveComment(commentId: string) {
        try {
            await this.convex.mutation(convexApi.comments.resolve, {
                commentId: commentId as Id<'projectComments'>,
            });
            if (this.currentProjectId) {
                await this.loadComments(this.currentProjectId);
            }
        } catch (error) {
            console.error('Failed to resolve comment:', error);
            throw error;
        }
    }

    async unresolveComment(commentId: string) {
        try {
            await this.convex.mutation(convexApi.comments.unresolve, {
                commentId: commentId as Id<'projectComments'>,
            });
            if (this.currentProjectId) {
                await this.loadComments(this.currentProjectId);
            }
        } catch (error) {
            console.error('Failed to unresolve comment:', error);
            throw error;
        }
    }

    async createReply(commentId: string, content: string) {
        try {
            await this.convex.mutation(convexApi.commentReplies.create, {
                commentId: commentId as Id<'projectComments'>,
                content,
            });
            if (this.currentProjectId) {
                await this.loadComments(this.currentProjectId);
            }
        } catch (error) {
            console.error('Failed to create reply:', error);
            throw error;
        }
    }

    async deleteReply(replyId: string) {
        try {
            await this.convex.mutation(convexApi.commentReplies.remove, {
                replyId: replyId as Id<'commentReplies'>,
            });
            if (this.currentProjectId) {
                await this.loadComments(this.currentProjectId);
            }
        } catch (error) {
            console.error('Failed to delete reply:', error);
            throw error;
        }
    }

    clear() {
        this.disposed = true;
        if (this.currentProjectId) {
            this.saveSeenIds(this.currentProjectId);
        }
        this.stopPolling();
        this.comments = [];
        this.activeCommentId = null;
        this.pendingPlacement = null;
        this.currentProjectId = null;
        this.loadPromise = null;
        this.commentsUnavailable = false;
        this.hasLoggedLoadError = false;
        this.isLoading = false;
        this.commentsVisible = true;
        this.seenCommentIds.clear();
    }
}
