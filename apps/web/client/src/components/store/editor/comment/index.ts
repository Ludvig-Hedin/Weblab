import { api } from '@/trpc/client';
import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { EditorEngine } from '../engine';

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

export class CommentManager {
    comments: ProjectComment[] = [];
    activeCommentId: string | null = null;
    pendingPlacement: { x: number; y: number } | null = null;
    isLoading = false;
    commentsVisible = true;
    seenCommentIds: Set<string> = observable.set<string>();

    private pollingInterval: ReturnType<typeof setInterval> | null = null;
    private currentProjectId: string | null = null;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    async init() {
        const projectId = this.editorEngine.projectId;
        this.loadSeenIds(projectId);
        await this.loadComments(projectId);
        this.startPolling(projectId);
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
                const ids: string[] = JSON.parse(raw);
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
        runInAction(() => { this.isLoading = true; });
        try {
            const result = await api.comment.comment.list.query({ projectId });
            runInAction(() => {
                this.comments = result as unknown as ProjectComment[];
                this.isLoading = false;
            });
        } catch (error) {
            console.error('Failed to load comments:', error);
            runInAction(() => { this.isLoading = false; });
        }
    }

    startPolling(projectId: string) {
        this.currentProjectId = projectId;
        this.stopPolling();
        this.pollingInterval = setInterval(() => {
            this.loadComments(projectId);
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
            this.loadComments(this.currentProjectId);
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
            const newId = (result as any).id as string;
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
                runInAction(() => { this.activeCommentId = null; });
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
        this.isLoading = false;
        this.commentsVisible = true;
        this.seenCommentIds.clear();
    }
}
