import React from 'react';
import { useCurrentFrame } from 'remotion';

import { interp } from '../utils/timing';
import { fontStack, palette } from '../utils/tokens';

export type TextStyle = 'display' | 'body' | 'caption';

export type OverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface SafeArea {
    top: number;
    left: number;
    right: number;
    bottom: number;
}

export interface TextOverlayProps {
    text: string;
    /** Scene-local frame at which the text begins to fade in. */
    enter: number;
    /** Scene-local frame at which the text begins to fade out. */
    exit: number;
    style?: TextStyle;
    color?: string;
    children?: React.ReactNode;
    align?: 'left' | 'center' | 'right';
    weight?: number;
    /**
     * Anchor corner / center inside the 1920×1080 viewport. When provided,
     * the overlay positions itself absolutely at the corner using `safeArea`
     * for inset and `maxWidth` for sane wrapping. When omitted, the overlay
     * renders inline (legacy behavior — caller wraps in a positioned div).
     */
    position?: OverlayPosition;
    /** Inset from the viewport edges. Defaults to {60, 80, 80, 60}. */
    safeArea?: SafeArea;
    /** Max width for the overlay text block. Defaults to 760. */
    maxWidth?: number;
}

const sizeFor: Record<TextStyle, { fontSize: number; lineHeight: number; letterSpacing: number }> =
    {
        display: { fontSize: 64, lineHeight: 1.05, letterSpacing: -0.5 },
        body: { fontSize: 22, lineHeight: 1.4, letterSpacing: 0 },
        caption: { fontSize: 14, lineHeight: 1.4, letterSpacing: 0.2 },
    };

const DEFAULT_SAFE_AREA: SafeArea = { top: 60, left: 80, right: 80, bottom: 60 };

const positionStyle = (
    position: OverlayPosition,
    safe: SafeArea,
    maxWidth: number,
): React.CSSProperties => {
    switch (position) {
        case 'top-left':
            return { top: safe.top, left: safe.left, maxWidth, textAlign: 'left' };
        case 'top-right':
            return { top: safe.top, right: safe.right, maxWidth, textAlign: 'right' };
        case 'bottom-left':
            return { bottom: safe.bottom, left: safe.left, maxWidth, textAlign: 'left' };
        case 'bottom-right':
            return { bottom: safe.bottom, right: safe.right, maxWidth, textAlign: 'right' };
        case 'center':
        default:
            return {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                maxWidth,
                textAlign: 'center',
            };
    }
};

export const TextOverlay: React.FC<TextOverlayProps> = ({
    text,
    enter,
    exit,
    style = 'display',
    color = palette.textPrimary,
    align,
    weight = 400,
    position,
    safeArea = DEFAULT_SAFE_AREA,
    maxWidth = 760,
}) => {
    const frame = useCurrentFrame();
    const fadeIn = interp(frame, [enter, enter + 12], [0, 1]);
    const fadeOut = interp(frame, [exit - 10, exit], [1, 0]);
    const opacity = Math.min(fadeIn, fadeOut);

    const lift = interp(frame, [enter, enter + 18], [8, 0]);

    const dims = sizeFor[style];

    const baseStyle: React.CSSProperties = {
        opacity,
        transform:
            `translateY(${lift}px)` + (position === 'center' ? ' translate(-50%, -50%)' : ''),
        color,
        fontFamily: fontStack,
        fontSize: dims.fontSize,
        lineHeight: dims.lineHeight,
        letterSpacing: dims.letterSpacing,
        fontWeight: weight,
        textAlign: align ?? 'left',
        pointerEvents: 'none',
    };

    if (position) {
        const pos = positionStyle(position, safeArea, maxWidth);
        return (
            <div
                style={{
                    position: 'absolute',
                    ...pos,
                    ...baseStyle,
                    // For center, transform is already wired in baseStyle to compose with translateY.
                    ...(position === 'center'
                        ? { transform: `translate(-50%, calc(-50% + ${lift}px))` }
                        : {}),
                    textAlign: align ?? (pos.textAlign as 'left' | 'right' | 'center'),
                }}
            >
                {text}
            </div>
        );
    }

    return (
        <div
            style={{
                ...baseStyle,
                width: '100%',
                textAlign: align ?? 'center',
            }}
        >
            {text}
        </div>
    );
};
