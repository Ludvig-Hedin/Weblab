import React from 'react';

export interface CursorProps {
    x: number;
    y: number;
    scale?: number;
    opacity?: number;
}

/**
 * macOS-style filled white arrow cursor. Fixed source size 18×18 (rendered
 * via a 20×20 viewBox so the silhouette has 1px of padding for the drop
 * shadow). The cursor TIP is at (3, 2) inside the SVG. (x, y) is the
 * top-left of the cursor — to position the tip at a target T do
 * (T.x - 3, T.y - 2).
 *
 * The 1px y-offset 2px blur shadow keeps the cursor crisp on white
 * frame areas without the painted black outline that read as cartoony in
 * earlier renders.
 */
export const Cursor: React.FC<CursorProps> = ({ x, y, scale = 1, opacity = 1 }) => {
    return (
        <svg
            width={18 * scale}
            height={18 * scale}
            viewBox="0 0 20 20"
            style={{
                position: 'absolute',
                left: x,
                top: y,
                opacity,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
            }}
        >
            <path
                d="M3 2 L3 16 L7 12.4 L9.6 17.6 L11.8 16.7 L9.2 11.6 L14.6 11.6 Z"
                fill="#ffffff"
            />
        </svg>
    );
};
