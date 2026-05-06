'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import { EditorAttributes } from '@weblab/constants';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

type CommentFilter = 'open' | 'resolved';

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

export const CommentsTab = observer(() => {
    const editorEngine = useEditorEngine();
    const [filter, setFilter] = useState<CommentFilter>('open');
    const comments = editorEngine.comment.comments;

    const filtered = comments.filter((c) =>
        filter === 'open' ? c.resolvedAt == null : c.resolvedAt != null,
    );

    function flyToComment(commentId: string, canvasX: number, canvasY: number) {
        const scale = editorEngine.canvas.scale;
        const canvasEl = document.getElementById(EditorAttributes.CANVAS_CONTAINER_ID);
        const viewportEl = canvasEl?.parentElement;
        const rect = viewportEl?.getBoundingClientRect();
        const cw = rect ? rect.width : window.innerWidth;
        const ch = rect ? rect.height : window.innerHeight;
        editorEngine.canvas.position = {
            x: cw / 2 - canvasX * scale,
            y: ch / 2 - canvasY * scale,
        };
        editorEngine.comment.setActiveCommentId(commentId);
    }

    return (
        <div className="flex h-full flex-col overflow-hidden">
            {/* Filter */}
            <div className="border-border flex gap-1 border-b px-3 py-2">
                <button
                    onClick={() => setFilter('open')}
                    className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        filter === 'open'
                            ? 'bg-background-tertiary text-foreground-primary'
                            : 'text-foreground-tertiary hover:text-foreground-hover',
                    )}
                >
                    Open
                </button>
                <button
                    onClick={() => setFilter('resolved')}
                    className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        filter === 'resolved'
                            ? 'bg-background-tertiary text-foreground-primary'
                            : 'text-foreground-tertiary hover:text-foreground-hover',
                    )}
                >
                    Resolved
                </button>
            </div>

            {/* List */}
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
                {editorEngine.comment.isLoading && filtered.length === 0 ? (
                    <div className="text-foreground-tertiary flex flex-1 items-center justify-center text-xs">
                        Loading...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-foreground-tertiary flex flex-1 items-center justify-center text-xs">
                        {filter === 'open' ? 'No open comments' : 'No resolved comments'}
                    </div>
                ) : (
                    filtered.map((comment) => (
                        <button
                            key={comment.id}
                            onClick={() =>
                                flyToComment(comment.id, comment.canvasX, comment.canvasY)
                            }
                            className={cn(
                                'hover:border-border hover:bg-background-secondary flex w-full flex-col gap-1.5 rounded-lg border border-transparent p-3 text-left transition-colors',
                                editorEngine.comment.activeCommentId === comment.id &&
                                    'border-border bg-background-secondary',
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">
                                    {getInitials(comment.authorName)}
                                </div>
                                <span className="text-foreground-primary flex-1 truncate text-xs font-medium">
                                    {comment.authorName}
                                </span>
                                <span className="text-foreground-tertiary text-[10px]">
                                    {formatRelativeTime(comment.createdAt)}
                                </span>
                            </div>
                            <p className="text-foreground-secondary line-clamp-2 text-xs">
                                {comment.content}
                            </p>
                            {comment.replies.length > 0 && (
                                <div className="text-foreground-tertiary flex items-center gap-1 text-[10px]">
                                    <Icons.ChatBubble className="h-3 w-3" />
                                    <span>
                                        {comment.replies.length}{' '}
                                        {comment.replies.length === 1 ? 'reply' : 'replies'}
                                    </span>
                                </div>
                            )}
                        </button>
                    ))
                )}
            </div>
        </div>
    );
});
