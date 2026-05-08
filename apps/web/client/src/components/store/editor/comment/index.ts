import { makeAutoObservable, observable, runInAction } from 'mobx';

import type { EditorEngine } from '../engine';
import { api } from '@/trpc/client';

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

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    async init() {
        const projectId = this.editorEngine.projectId;
        this.loadSeenIds(projectId);
        await this.loadComments(projectId);
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
            const result = await api.comment.comment.list.query({ projectId });
            runInAction(() => {
                this.comments = result as unknown as ProjectComment[];
                this.isLoading = false;
            });
        } catch (error) {
            const code = getTRPCErrorCode(error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            const shouldDisable =
                code === 'UNAUTHORIZED' ||
                code === 'FORBIDDEN' ||
                (code === undefined && message.includes('Unauthorized'));

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
        if (this.commentsUnavailable) {
            return;
        }
        this.currentProjectId = projectId;
        this.stopPolling();
        this.pollingInterval = setInterval(() => {
            void this.loadComments(projectId);
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
            const result = await api.comment.comment.create.mutate(input);
            await this.loadComments(input.projectId);
            const newId = result.id;
            runInAction(() => {
                this.pendingPlacement = null;
                this.markAsSeen(newId); // own comments are immediately "seen"
                this.activeCommentId = newId;
            });
        } catch (error) {
            console.error('Failed to create comment:', error);
        }
    }

    async updateComment(commentId: string, content: string) {
        try {
            await api.comment.comment.update.mutate({ commentId, content });
            if (this.currentProjectId) {
                await this.loadComments(this.currentProjectId);
            }
        } catch (error) {
            console.error('Failed to update comment:', error);
        }
    }

    async deleteComment(commentId: string) {
        try {
            await api.comment.comment.delete.mutate({ commentId });
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
            await api.comment.comment.resolve.mutate({ commentId });
            if (this.currentProjectId) {
                await this.loadComments(this.currentProjectId);
            }
        } catch (error) {
            console.error('Failed to resolve comment:', error);
        }
    }

    async unresolveComment(commentId: string) {
        try {
            await api.comment.comment.unresolve.mutate({ commentId });
            if (this.currentProjectId) {
                await this.loadComments(this.currentProjectId);
            }
        } catch (error) {
            console.error('Failed to unresolve comment:', error);
        }
    }

    async createReply(commentId: string, content: string) {
        try {
            await api.comment.reply.create.mutate({ commentId, content });
            if (this.currentProjectId) {
                await this.loadComments(this.currentProjectId);
            }
        } catch (error) {
            console.error('Failed to create reply:', error);
        }
    }

    async deleteReply(replyId: string) {
        try {
            await api.comment.reply.delete.mutate({ replyId });
            if (this.currentProjectId) {
                await this.loadComments(this.currentProjectId);
            }
        } catch (error) {
            console.error('Failed to delete reply:', error);
        }
    }

    clear() {
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
