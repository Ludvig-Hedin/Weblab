import { cn } from '@weblab/ui/utils';

import type { EditorView } from '@codemirror/view';

interface FloatingAddToChatButtonProps {
    editor: EditorView;
    selection: { from: number; to: number; text: string };
    onAddToChat: () => void;
    onQuickEdit: () => void;
}

export const FloatingAddToChatButton = ({
    editor,
    selection,
    onAddToChat,
    onQuickEdit,
}: FloatingAddToChatButtonProps) => {
    const getSelectionRect = () => {
        try {
            const coords = editor.coordsAtPos(selection.from);
            const endCoords = editor.coordsAtPos(selection.to);
            if (!coords || !endCoords) return null;
            const editorRect = editor.dom.getBoundingClientRect();
            return {
                top: Math.min(coords.top, endCoords.top) - editorRect.top,
                left: Math.min(coords.left, endCoords.left) - editorRect.left,
                right: Math.max(coords.right, endCoords.right) - editorRect.left,
            };
        } catch {
            return null;
        }
    };

    const selectionRect = getSelectionRect();
    if (!selectionRect) return null;

    const buttonStyle: React.CSSProperties = {
        position: 'absolute',
        top: Math.max(8, selectionRect.top - 38),
        left: selectionRect.left + (selectionRect.right - selectionRect.left) / 2,
        transform: 'translateX(-50%)',
        zIndex: 1000,
        pointerEvents: 'auto',
    };

    return (
        <div style={buttonStyle} onClick={(e) => e.stopPropagation()}>
            <div
                className={cn(
                    'flex rounded-lg border backdrop-blur-lg',
                    'bg-background-primary/90 border-foreground-secondary/20',
                    'shadow-background-secondary/50 shadow-xl',
                )}
            >
                <button
                    onClick={onAddToChat}
                    className="hover:bg-foreground-brand/10 flex items-center gap-1.5 rounded-l-lg px-2.5 py-1.5 transition-colors"
                >
                    <span className="text-mini !font-medium whitespace-nowrap">Add to Chat</span>
                    <span className="text-mini opacity-50">⌘L</span>
                </button>
                <div className="border-foreground-secondary/20 my-1.5 w-px border-l" />
                <button
                    onClick={onQuickEdit}
                    className="hover:bg-foreground-brand/10 flex items-center gap-1.5 rounded-r-lg px-2.5 py-1.5 transition-colors"
                >
                    <span className="text-mini !font-medium whitespace-nowrap">Quick Edit</span>
                    <span className="text-mini opacity-50">⌘K</span>
                </button>
            </div>
        </div>
    );
};
