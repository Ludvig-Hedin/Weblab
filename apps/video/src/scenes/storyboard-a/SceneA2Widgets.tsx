import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { TextOverlay } from '../../components/TextOverlay';
import { cubicBezier } from '../../utils/paths';
import { interp, sceneSpring } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * Storyboard A — Scene 2 (0:03–0:10, frames 180–600, scene length 420).
 *
 * Two tiny widgets float in: a tidy "canvas" card on the left and an "AI
 * teammate" chat bubble on the right. Cursor drifts between them on a
 * Bezier path. On-screen line: "Design tool, meet AI."
 */

const SCENE_LENGTH = 420;

const CanvasWidget: React.FC<{ progress: number }> = ({ progress }) => {
    const translateY = (1 - progress) * 24;
    return (
        <div
            style={{
                opacity: progress,
                transform: `translateY(${translateY}px)`,
                width: 360,
                background: palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: 14,
                padding: 22,
                fontFamily: fontStack,
            }}
        >
            <div
                style={{
                    fontSize: 11,
                    color: palette.textMuted,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    marginBottom: 14,
                }}
            >
                Canvas
            </div>
            <div
                style={{
                    height: 130,
                    borderRadius: 10,
                    background: palette.background,
                    border: `1px solid ${palette.border}`,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}
            >
                <div
                    style={{
                        height: 12,
                        width: '70%',
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.10)',
                    }}
                />
                <div
                    style={{
                        height: 8,
                        width: '50%',
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.06)',
                    }}
                />
                <div
                    style={{
                        marginTop: 'auto',
                        height: 22,
                        width: 92,
                        borderRadius: 6,
                        background: 'rgba(0,129,222,0.45)',
                    }}
                />
            </div>
        </div>
    );
};

const ChatWidget: React.FC<{ progress: number }> = ({ progress }) => {
    const translateY = (1 - progress) * 24;
    return (
        <div
            style={{
                opacity: progress,
                transform: `translateY(${translateY}px)`,
                width: 360,
                background: palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: 14,
                padding: 22,
                fontFamily: fontStack,
            }}
        >
            <div
                style={{
                    fontSize: 11,
                    color: palette.textMuted,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    marginBottom: 14,
                }}
            >
                AI teammate
            </div>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}
            >
                <div
                    style={{
                        alignSelf: 'flex-start',
                        background: palette.surfaceElevated,
                        border: `1px solid ${palette.border}`,
                        borderRadius: 10,
                        padding: '8px 12px',
                        color: palette.textPrimary,
                        fontSize: 13,
                        maxWidth: '85%',
                    }}
                >
                    Make this hero softer
                </div>
                <div
                    style={{
                        alignSelf: 'flex-end',
                        background: 'rgba(146,14,255,0.16)',
                        border: '1px solid rgba(146,14,255,0.45)',
                        borderRadius: 10,
                        padding: '8px 12px',
                        color: palette.textPrimary,
                        fontSize: 13,
                        maxWidth: '85%',
                    }}
                >
                    Updated the canvas.
                </div>
            </div>
        </div>
    );
};

export const SceneA2Widgets: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Widgets land at scene start.
    const leftProgress = sceneSpring(frame, fps, 'landing');
    const rightProgress = sceneSpring(Math.max(0, frame - 8), fps, 'landing');

    // Cursor drifts left → right on a Bezier path.
    const driftStart = 70;
    const driftLength = 220;
    const t = Math.max(0, Math.min(1, (frame - driftStart) / driftLength));
    const cursorPath = cubicBezier(
        { x: 540, y: 600 },
        { x: 760, y: 460 },
        { x: 1160, y: 660 },
        { x: 1380, y: 540 },
        t,
    );

    // Headline opacity for the on-screen line.
    const overlayEnter = interp(frame, [40, 80], [0, 1]);
    const overlayExit = interp(frame, [SCENE_LENGTH - 40, SCENE_LENGTH - 8], [1, 0]);
    const headlineOpacity = Math.min(overlayEnter, overlayExit);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                fontFamily: fontStack,
            }}
        >
            {/* Headline */}
            <div
                style={{
                    position: 'absolute',
                    top: 140,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    opacity: headlineOpacity,
                }}
            >
                <div style={{ width: 900 }}>
                    <TextOverlay
                        text="Design tool, meet AI."
                        enter={20}
                        exit={SCENE_LENGTH - 20}
                        style="display"
                    />
                </div>
            </div>

            {/* Two widgets */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 200,
                }}
            >
                <CanvasWidget progress={leftProgress} />
                <ChatWidget progress={rightProgress} />
            </div>

            {/* Cursor + ripple */}
            <Cursor x={cursorPath.x} y={cursorPath.y} />
            <ClickRipple at={120} x={620} y={580} />
        </AbsoluteFill>
    );
};
