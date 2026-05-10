import React from 'react';

import { fontStack, palette } from '../utils/tokens';

export type CanvasBreakpoint = 'desktop' | 'tablet' | 'mobile';

const dimsFor: Record<CanvasBreakpoint, { width: number; label: string }> = {
    desktop: { width: 1280, label: '1280' },
    tablet: { width: 820, label: '820' },
    mobile: { width: 390, label: '390' },
};

export interface CanvasMockProps {
    /** What's rendered inside the website frame. */
    children?: React.ReactNode;
    /** Active breakpoint pill / frame width. */
    breakpoint?: CanvasBreakpoint;
    /** Show the breakpoint pill above the frame. */
    showBreakpointPill?: boolean;
    /** Override the frame label (default: "Home — desktop / 1280"). */
    frameLabel?: string;
    /** Override frame width (px) — used when interpolating breakpoint changes. */
    frameWidth?: number;
    /** @deprecated alias for `frameLabel`. Kept so older scenes still type-check. */
    title?: string;
    /** @deprecated alias — rendering is now handled internally. */
    breakpointPill?: React.ReactNode;
}

/**
 * Real Weblab canvas: dark surface with a centered "browser frame" containing
 * the website. Above the frame is a small breakpoint label/pill (Desktop /
 * Tablet / Mobile). The frame's inside is white and shows real-looking
 * website content.
 */
export const CanvasMock: React.FC<CanvasMockProps> = ({
    children,
    breakpoint = 'desktop',
    showBreakpointPill = true,
    frameLabel,
    frameWidth,
    title,
    // breakpointPill kept only for back-compat; intentionally unused.
}) => {
    const resolvedLabel = frameLabel ?? title;
    const dims = dimsFor[breakpoint];
    const width = frameWidth ?? dims.width;
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                background: palette.background,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                padding: '32px 24px',
                fontFamily: fontStack,
                position: 'relative',
            }}
        >
            <div
                style={{
                    width: width,
                    maxWidth: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    minHeight: 0,
                }}
            >
                {showBreakpointPill && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 10,
                            paddingLeft: 4,
                            paddingRight: 4,
                        }}
                    >
                        <div
                            style={{
                                fontSize: 11,
                                color: palette.textSecondary,
                                letterSpacing: 0.1,
                                fontWeight: 500,
                            }}
                        >
                            {resolvedLabel ?? `Home · ${breakpoint} · ${dims.label}px`}
                        </div>
                        <div
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: 10.5,
                                color: palette.textMuted,
                            }}
                        >
                            <div
                                style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: 999,
                                    background: '#22c55e',
                                }}
                            />
                            Live preview
                        </div>
                    </div>
                )}
                <div
                    style={{
                        flex: 1,
                        background: '#ffffff',
                        border: `1px solid ${palette.border}`,
                        borderRadius: 12,
                        overflow: 'hidden',
                        position: 'relative',
                        boxShadow: '0 24px 60px -20px rgba(0,0,0,0.55)',
                        minHeight: 0,
                    }}
                >
                    {children}
                </div>
            </div>
        </div>
    );
};
