import React, { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@weblab/ui/utils';

export function useResizable({
    defaultWidth = 240,
    minWidth = 200,
    maxWidth = 600,
    side = 'left',
    forceWidth,
    onWidthChange,
}: {
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    side?: 'left' | 'right';
    forceWidth?: number;
    onWidthChange?: (width: number) => void;
}) {
    const [width, setWidth] = useState(defaultWidth);
    const [isAnimating, setIsAnimating] = useState(false);
    const isDragging = useRef(false);
    const startPos = useRef(0);
    const startWidth = useRef(0);

    // Effect to handle forced width changes
    useEffect(() => {
        if (forceWidth !== undefined) {
            setIsAnimating(true);
            setWidth(forceWidth);
            // Reset animating after transition completes
            const timer = setTimeout(() => setIsAnimating(false), 300);
            return () => clearTimeout(timer);
        }
    }, [forceWidth]);

    useEffect(() => {
        onWidthChange?.(width);
    }, [onWidthChange, width]);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            isDragging.current = true;
            startPos.current = e.clientX;
            startWidth.current = width;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        },
        [width],
    );

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!isDragging.current) return;

            const delta = e.clientX - startPos.current;
            let newWidth =
                side === 'left' ? startWidth.current + delta : startWidth.current - delta;
            newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
            setWidth(newWidth);
        },
        [side, minWidth, maxWidth],
    );

    const handleMouseUp = useCallback(() => {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    return { width, handleMouseDown, isAnimating };
}

// Simplified component using the hook
interface ResizablePanelProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    side?: 'left' | 'right';
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    forceWidth?: number;
    onWidthChange?: (width: number) => void;
    className?: string;
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
    children,
    side = 'left',
    defaultWidth = 240,
    minWidth = 200,
    maxWidth = 600,
    forceWidth,
    onWidthChange,
    className,
    ...props
}) => {
    const { width, handleMouseDown, isAnimating } = useResizable({
        defaultWidth,
        minWidth,
        maxWidth,
        side,
        forceWidth,
        onWidthChange,
    });

    return (
        <div
            style={{ width: `${width}px` }}
            className={cn(
                'relative h-full min-w-0 overflow-hidden',
                isAnimating && 'transition-[width] duration-300 ease-in-out',
                side === 'left' ? 'left-0' : 'right-0',
                className,
            )}
            {...props}
            data-oid="797c2f87db"
        >
            <div className="h-full w-full min-w-0 overflow-hidden" data-oid="ec1cae9878">
                {children}
            </div>
            <div
                className={cn(
                    'hover:bg-border/50 group/panel-hover:bg-border/30 absolute top-0 h-full w-1 cursor-col-resize transition-all',
                    side === 'left' ? 'right-0' : 'left-0',
                )}
                onMouseDown={handleMouseDown}
                data-oid="0022747cc2"
            />
        </div>
    );
};
