import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import type { EditorView } from '@codemirror/view';

interface FloatingAddToChatButtonProps {
    editor: EditorView;
    selection: { from: number; to: number; text: string };
    onAddToChat: () => void;
}

export const FloatingAddToChatButton = ({
    editor,
    selection,
    onAddToChat,
}: FloatingAddToChatButtonProps) => {
    // Get the bounding rectangle of the selection
    const getSelectionRect = () => {
        try {
            const coords = editor.coordsAtPos(selection.from);
            const endCoords = editor.coordsAtPos(selection.to);

            if (!coords || !endCoords) return null;

            const editorElement = editor.dom;
            const editorRect = editorElement.getBoundingClientRect();

            return {
                top: Math.min(coords.top, endCoords.top) - editorRect.top,
                left: Math.min(coords.left, endCoords.left) - editorRect.left,
                right: Math.max(coords.right, endCoords.right) - editorRect.left,
                bottom: Math.max(coords.bottom, endCoords.bottom) - editorRect.top,
            };
        } catch (error) {
            console.error('Error getting selection coordinates:', error);
            return null;
        }
    };

    const selectionRect = getSelectionRect();

    if (!selectionRect) return null;

    // Position the button above the selection with some margin
    const buttonStyle: React.CSSProperties = {
        position: 'absolute',
        top: Math.max(8, selectionRect.top - 42), // 42px is approximate button height + margin
        left: selectionRect.left + (selectionRect.right - selectionRect.left) / 2,
        transform: 'translateX(-50%)',
        zIndex: 1000, // High z-index to ensure it's on top
        pointerEvents: 'auto',
    };

    return (
        <div style={buttonStyle} onClick={(e) => e.stopPropagation()}>
            <div
                className={cn(
                    'rounded-lg backdrop-blur-lg',
                    'shadow-background-secondary/50 shadow-xl',
                    'bg-background-primary/85 dark:bg-primary/20 border-foreground-secondary/20 hover:border-foreground-secondary/50',
                    'relative flex border',
                )}
            >
                <button
                    onClick={onAddToChat}
                    className="hover:text-foreground-primary flex w-full flex-row items-center gap-2 rounded-md px-2.5 py-1.5"
                >
                    <span className="text-mini !font-medium whitespace-nowrap">Add to Chat</span>
                    <span className="text-mini ml-1 opacity-60">⌘L</span>
                </button>
            </div>
        </div>
    );
};
