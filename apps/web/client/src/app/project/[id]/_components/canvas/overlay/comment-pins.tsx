'use client';

import { observer } from 'mobx-react-lite';

import { EditorMode } from '@weblab/models';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

function getInitials(name: string): string {
    return name
        .split(/[\s@.]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase() ?? '')
        .join('');
}

export const CommentPins = observer(() => {
    const editorEngine = useEditorEngine();
    const { position, scale } = editorEngine.canvas;
    const { comments, activeCommentId, pendingPlacement, commentsVisible } = editorEngine.comment;

    if (editorEngine.state.editorMode === EditorMode.PREVIEW) {
        return null;
    }

    if (!commentsVisible) {
        return null;
    }

    return (
        <>
            {/* Existing comment pins */}
            {comments.map((comment) => {
                const left = comment.canvasX * scale + position.x;
                const top = comment.canvasY * scale + position.y;
                const isActive = comment.id === activeCommentId;
                const isResolved = comment.resolvedAt != null;
                const isUnread = editorEngine.comment.isUnread(comment.id);

                return (
                    <div
                        key={comment.id}
                        className="pointer-events-auto absolute"
                        style={{ left, top, zIndex: isActive ? 50 : 40 }}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                editorEngine.comment.setActiveCommentId(
                                    isActive ? null : comment.id,
                                );
                            }}
                            title={comment.content}
                            className={cn(
                                'text-microPlus flex h-8 w-8 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border-2 font-semibold text-white shadow-lg transition-all duration-150 hover:scale-110',
                                // Active state: white border ring
                                isActive && 'scale-110 border-white',
                                // Unread + not active: accent brand ring
                                isUnread && !isActive && 'border-foreground-brand',
                                // Read + not active: no border
                                !isUnread && !isActive && 'border-transparent',
                                // Resolved = success token, otherwise brand
                                isResolved ? 'bg-foreground-success' : 'bg-foreground-brand',
                            )}
                            style={{
                                // Unread glow
                                boxShadow:
                                    isUnread && !isActive
                                        ? '0 0 0 3px hsl(var(--foreground-brand) / 0.45), 0 2px 8px rgba(0,0,0,0.3)'
                                        : '0 2px 8px rgba(0,0,0,0.25)',
                            }}
                        >
                            {getInitials(comment.authorName)}
                        </button>

                        {/* Unread dot indicator */}
                        {isUnread && !isActive && (
                            <span
                                className="border-background bg-foreground-brand absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2"
                                style={{ transform: 'translate(25%, -25%)' }}
                            />
                        )}
                    </div>
                );
            })}

            {/* Ghost pin for pending placement */}
            {pendingPlacement && (
                <div
                    className="pointer-events-auto absolute"
                    style={{
                        left: pendingPlacement.x * scale + position.x,
                        top: pendingPlacement.y * scale + position.y,
                        zIndex: 60,
                    }}
                >
                    <div className="border-foreground-brand bg-foreground-brand/30 flex h-8 w-8 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border-2 border-dashed shadow-lg">
                        <span className="text-large text-foreground-brand leading-none font-bold">
                            +
                        </span>
                    </div>
                </div>
            )}
        </>
    );
});
