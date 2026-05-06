'use client';

import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { toast } from 'sonner';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { createClient } from '@/utils/supabase/client';

function formatRelativeTime(date: Date | string): string {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function getInitials(name: string): string {
    return name
        .split(/[\s@.]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase() ?? '')
        .join('');
}

const POPOVER_WIDTH = 280;
const POPOVER_MAX_HEIGHT = 384; // matches max-h-96
// Place the popover just to the right of the pin.
// Pins are h-8 w-8 centered horizontally (-translate-x-1/2) and shifted up (-translate-y-full),
// so their right edge is at pinX + 16px. We add an 8px gap.
const POPOVER_OFFSET_X = 24;
// Align the top of the popover with the top of the pin (pin is 32px tall, shifted up fully).
const POPOVER_OFFSET_Y = -32;

function clampToViewport(left: number, top: number): { left: number; top: number } {
    const margin = 8;
    return {
        left: Math.min(Math.max(left, margin), window.innerWidth - POPOVER_WIDTH - margin),
        top: Math.min(Math.max(top, margin), window.innerHeight - POPOVER_MAX_HEIGHT - margin),
    };
}

export const CommentPopover = observer(() => {
    const editorEngine = useEditorEngine();
    const { position, scale } = editorEngine.canvas;
    const { activeCommentId, pendingPlacement, comments } = editorEngine.comment;

    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [newCommentText, setNewCommentText] = useState('');
    const [replyText, setReplyText] = useState('');
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const newCommentInputRef = useRef<HTMLTextAreaElement>(null);

    // Fetch current user once per component lifetime. The component only unmounts
    // when both pendingPlacement and activeCommentId are null, so this runs at
    // most once per "comment session" rather than once per pin click.
    useEffect(() => {
        let cancelled = false;
        createClient()
            .auth.getUser()
            .then(({ data }) => {
                if (!cancelled) setCurrentUserId(data.user?.id ?? null);
            })
            .catch((error) => {
                if (!cancelled) {
                    console.error('Failed to fetch current user:', error);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (pendingPlacement && newCommentInputRef.current) {
            newCommentInputRef.current.focus();
        }
    }, [pendingPlacement]);

    useEffect(() => {
        setConfirmDeleteId(null);
        setIsDeleting(false);
    }, [activeCommentId, pendingPlacement]);

    // Close popover on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                editorEngine.comment.setActiveCommentId(null);
                editorEngine.comment.setPendingPlacement(null);
                setNewCommentText('');
                setReplyText('');
                setEditingCommentId(null);
                setConfirmDeleteId(null);
                setIsDeleting(false);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [editorEngine.comment]);

    if (!pendingPlacement && !activeCommentId) {
        return null;
    }

    const activeComment = activeCommentId
        ? (comments.find((c) => c.id === activeCommentId) ?? null)
        : null;

    // Compute screen position
    let rawLeft: number;
    let rawTop: number;

    if (pendingPlacement) {
        rawLeft = pendingPlacement.x * scale + position.x + POPOVER_OFFSET_X;
        rawTop = pendingPlacement.y * scale + position.y + POPOVER_OFFSET_Y;
    } else if (activeComment) {
        rawLeft = activeComment.canvasX * scale + position.x + POPOVER_OFFSET_X;
        rawTop = activeComment.canvasY * scale + position.y + POPOVER_OFFSET_Y;
    } else {
        return null;
    }

    const { left, top } = clampToViewport(rawLeft, rawTop);

    async function handleSubmitNew() {
        const placement = pendingPlacement;
        if (!newCommentText.trim() || isSubmitting || !placement) return;
        setIsSubmitting(true);
        try {
            await editorEngine.comment.createComment({
                projectId: editorEngine.projectId,
                canvasX: placement.x,
                canvasY: placement.y,
                content: newCommentText.trim(),
            });
            setNewCommentText('');
        } catch (error) {
            console.error('Failed to create comment:', error);
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleSubmitReply() {
        if (!replyText.trim() || !activeCommentId || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await editorEngine.comment.createReply(activeCommentId, replyText.trim());
            setReplyText('');
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleSaveEdit() {
        if (!editingText.trim() || !editingCommentId || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await editorEngine.comment.updateComment(editingCommentId, editingText.trim());
            setEditingCommentId(null);
            setEditingText('');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div
            ref={popoverRef}
            className="pointer-events-auto absolute z-50"
            style={{ left, top, width: POPOVER_WIDTH }}
        >
            <div className="border-border bg-background/95 overflow-hidden rounded-xl border shadow-xl backdrop-blur-xl">
                {/* New comment form — inline submit button */}
                {pendingPlacement && !activeComment && (
                    <div className="p-2">
                        <div className="border-border bg-background-secondary flex items-end gap-1.5 rounded-lg border transition-all focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                            <textarea
                                ref={newCommentInputRef}
                                value={newCommentText}
                                onChange={(e) => setNewCommentText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                        e.preventDefault();
                                        handleSubmitNew();
                                    }
                                    if (e.key === 'Escape') {
                                        editorEngine.comment.setPendingPlacement(null);
                                        setNewCommentText('');
                                    }
                                }}
                                placeholder="Add a comment..."
                                rows={2}
                                className="text-foreground-primary placeholder:text-foreground-tertiary min-w-0 flex-1 resize-none bg-transparent px-2.5 pt-2 pb-1.5 text-sm focus:outline-none"
                            />
                            <button
                                onClick={handleSubmitNew}
                                disabled={!newCommentText.trim() || isSubmitting}
                                className="mr-1.5 mb-1.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue-600 text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label="Post comment"
                            >
                                <Icons.ArrowRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Existing comment view */}
                {activeComment && (
                    <div className="flex max-h-96 flex-col overflow-y-auto">
                        {/* Main comment */}
                        <div className="border-border/50 border-b p-3">
                            <div className="flex items-start gap-2">
                                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">
                                    {getInitials(activeComment.authorName)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-1">
                                        <span className="text-foreground-primary truncate text-xs font-semibold">
                                            {activeComment.authorName}
                                        </span>
                                        <span className="text-foreground-tertiary flex-shrink-0 text-[10px]">
                                            {formatRelativeTime(activeComment.createdAt)}
                                        </span>
                                    </div>
                                    {editingCommentId === activeComment.id ? (
                                        <div className="mt-1.5 flex flex-col gap-1.5">
                                            <textarea
                                                value={editingText}
                                                onChange={(e) => setEditingText(e.target.value)}
                                                rows={3}
                                                className="bg-background-secondary border-border text-foreground-primary w-full resize-none rounded-lg border px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                                                autoFocus
                                            />
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 text-xs"
                                                    onClick={() => {
                                                        setEditingCommentId(null);
                                                        setEditingText('');
                                                    }}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    className="h-6 bg-blue-600 text-xs text-white hover:bg-blue-700"
                                                    onClick={handleSaveEdit}
                                                    disabled={isSubmitting}
                                                >
                                                    Save
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-foreground-secondary mt-0.5 text-xs">
                                            {activeComment.content}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="mt-2 flex items-center gap-1.5">
                                <button
                                    onClick={() => {
                                        if (activeComment.resolvedAt) {
                                            editorEngine.comment.unresolveComment(activeComment.id);
                                        } else {
                                            editorEngine.comment.resolveComment(activeComment.id);
                                        }
                                    }}
                                    className={cn(
                                        'flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors',
                                        activeComment.resolvedAt
                                            ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                                            : 'bg-background-secondary text-foreground-tertiary hover:text-foreground-hover',
                                    )}
                                >
                                    <Icons.CheckCircled className="h-3 w-3" />
                                    {activeComment.resolvedAt ? 'Resolved' : 'Resolve'}
                                </button>
                                {currentUserId === activeComment.authorId &&
                                    editingCommentId !== activeComment.id && (
                                        <>
                                            <button
                                                onClick={() => {
                                                    setEditingCommentId(activeComment.id);
                                                    setEditingText(activeComment.content);
                                                }}
                                                className="text-foreground-tertiary hover:text-foreground-hover bg-background-secondary rounded-md px-2 py-0.5 text-[10px] transition-colors"
                                            >
                                                Edit
                                            </button>
                                            {confirmDeleteId === activeComment.id ? (
                                                <span className="flex items-center gap-1">
                                                    <button
                                                        onClick={async () => {
                                                            if (isDeleting) return;
                                                            setIsDeleting(true);
                                                            try {
                                                                await editorEngine.comment.deleteComment(
                                                                    activeComment.id,
                                                                );
                                                                setConfirmDeleteId(null);
                                                            } catch (error) {
                                                                console.error(
                                                                    'Failed to delete comment:',
                                                                    error,
                                                                );
                                                                toast.error(
                                                                    'Failed to delete comment',
                                                                );
                                                            } finally {
                                                                setIsDeleting(false);
                                                            }
                                                        }}
                                                        disabled={isDeleting}
                                                        className="rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        {isDeleting ? 'Deleting...' : 'Confirm'}
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDeleteId(null)}
                                                        className="text-foreground-tertiary hover:text-foreground-hover bg-background-secondary rounded-md px-2 py-0.5 text-[10px] transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() =>
                                                        setConfirmDeleteId(activeComment.id)
                                                    }
                                                    className="bg-background-secondary rounded-md px-2 py-0.5 text-[10px] text-red-400 transition-colors hover:text-red-300"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </>
                                    )}
                            </div>
                        </div>

                        {/* Replies */}
                        {activeComment.replies.length > 0 && (
                            <div className="divide-border/30 flex flex-col divide-y">
                                {activeComment.replies.map((reply) => (
                                    <div key={reply.id} className="px-3 py-2.5">
                                        <div className="flex items-start gap-2">
                                            <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/70 text-[9px] font-semibold text-white">
                                                {getInitials(reply.authorName)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-baseline justify-between gap-1">
                                                    <span className="text-foreground-primary truncate text-[10px] font-semibold">
                                                        {reply.authorName}
                                                    </span>
                                                    <div className="flex flex-shrink-0 items-center gap-1">
                                                        <span className="text-foreground-tertiary text-[10px]">
                                                            {formatRelativeTime(reply.createdAt)}
                                                        </span>
                                                        {currentUserId === reply.authorId && (
                                                            <button
                                                                onClick={() =>
                                                                    editorEngine.comment.deleteReply(
                                                                        reply.id,
                                                                    )
                                                                }
                                                                className="text-foreground-tertiary text-[10px] transition-colors hover:text-red-400"
                                                            >
                                                                <Icons.Trash className="h-3 w-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-foreground-secondary mt-0.5 text-[11px]">
                                                    {reply.content}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Reply input */}
                        <div className="border-border/50 border-t p-3">
                            <div className="flex gap-2">
                                <textarea
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault();
                                            handleSubmitReply();
                                        }
                                    }}
                                    placeholder="Add a reply..."
                                    rows={2}
                                    className="bg-background-secondary border-border text-foreground-primary placeholder:text-foreground-tertiary flex-1 resize-none rounded-lg border px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                                />
                                <Button
                                    size="sm"
                                    aria-label="Send reply"
                                    className="h-7 w-7 self-end bg-blue-600 p-0 text-white hover:bg-blue-700"
                                    onClick={handleSubmitReply}
                                    disabled={!replyText.trim() || isSubmitting}
                                >
                                    <Icons.ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});
