'use client';

import { useEditorEngine } from '@/components/store/editor';
import { EditorMode } from '@weblab/models';
import { cn } from '@weblab/ui/utils';
import { observer } from 'mobx-react-lite';

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
                        className="absolute pointer-events-auto"
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
                                'flex h-8 w-8 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border-2 text-[11px] font-semibold text-white shadow-lg transition-all duration-150 hover:scale-110',
                                // Active state: white border ring
                                isActive && 'border-white scale-110',
                                // Unread + not active: accent blue pulsing ring
                                isUnread && !isActive && 'border-blue-400',
                                // Read + not active: no border
                                !isUnread && !isActive && 'border-transparent',
                            )}
                            style={{
                                backgroundColor: isResolved ? '#22c55e' : '#3b82f6',
                                // Unread glow
                                boxShadow: isUnread && !isActive
                                    ? '0 0 0 3px rgba(96, 165, 250, 0.45), 0 2px 8px rgba(0,0,0,0.3)'
                                    : '0 2px 8px rgba(0,0,0,0.25)',
                            }}
                        >
                            {getInitials(comment.authorName)}
                        </button>

                        {/* Unread dot indicator */}
                        {isUnread && !isActive && (
                            <span
                                className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-blue-400 border-2 border-background"
                                style={{ transform: 'translate(25%, -25%)' }}
                            />
                        )}
                    </div>
                );
            })}

            {/* Ghost pin for pending placement */}
            {pendingPlacement && (
                <div
                    className="absolute pointer-events-auto"
                    style={{
                        left: pendingPlacement.x * scale + position.x,
                        top: pendingPlacement.y * scale + position.y,
                        zIndex: 60,
                    }}
                >
                    <div className="flex h-8 w-8 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border-2 border-dashed border-blue-400 bg-blue-400/30 shadow-lg">
                        <span className="text-blue-400 text-lg font-bold leading-none">+</span>
                    </div>
                </div>
            )}
        </>
    );
});
