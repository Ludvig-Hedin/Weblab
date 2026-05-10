import React from 'react';
import { Code2, MessageSquare } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

const LINE = 'Builders asked for less friction.';

/**
 * Beat 2 — 900 frames. Cross-fade from Beat 1's black. Slow type-on, then
 * a small editor + chat-panel widget glows once.
 */
export const SceneE2Builders: React.FC = () => {
    const frame = useCurrentFrame();

    // Cross-fade in from Beat 1.
    const introFade = interp(frame, [0, 60], [0, 1]);

    // Slow type-on, lands by ~frame 360.
    const charsPerFrame = LINE.length / 360;
    const visibleCount = Math.min(LINE.length, Math.floor(frame * charsPerFrame));
    const visible = LINE.slice(0, visibleCount);
    const isDone = visibleCount >= LINE.length;
    const blinkVisible = isDone && Math.floor((frame - 360) / 18) % 2 === 0;

    // Soft pad-style halo (cooler tone this time).
    const haloOpacity = interp(frame, [60, 360], [0, 0.18]);

    // Editor / chat widget glow toward end of the beat.
    const widgetEnter = interp(frame, [600, 720], [0, 1]);
    const widgetGlow = interp(frame, [680, 760], [0, 1]);
    const widgetGlowOut = interp(frame, [760, 840], [1, 0]);
    const widgetGlowOpacity = Math.min(widgetGlow, widgetGlowOut);
    const widgetLift = interp(frame, [600, 720], [10, 0]);

    // Outro fade for cross-dissolve into Beat 3.
    const outroFade = interp(frame, [840, 900], [1, 0]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fontStack,
                opacity: introFade * outroFade,
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    width: 640,
                    height: 640,
                    borderRadius: '50%',
                    background: 'rgba(0,129,222,0.22)',
                    filter: 'blur(120px)',
                    opacity: haloOpacity,
                }}
            />
            <div
                style={{
                    position: 'relative',
                    fontSize: 64,
                    fontWeight: 400,
                    letterSpacing: -0.5,
                    color: palette.textPrimary,
                    textAlign: 'center',
                    maxWidth: 1200,
                    lineHeight: 1.1,
                }}
            >
                {visible}
                <span
                    style={{
                        display: 'inline-block',
                        width: 3,
                        height: 60,
                        verticalAlign: 'middle',
                        background: palette.textPrimary,
                        marginLeft: 6,
                        opacity: isDone ? (blinkVisible ? 1 : 0) : 1,
                    }}
                />
            </div>
            {/* Tiny editor + chat panel hint, bottom-left this time. */}
            <div
                style={{
                    position: 'absolute',
                    left: 160,
                    bottom: 160,
                    opacity: widgetEnter,
                    transform: `translateY(${widgetLift}px)`,
                }}
            >
                <div
                    style={{
                        position: 'relative',
                        width: 200,
                        height: 116,
                        background: palette.surface,
                        border: `1px solid ${palette.border}`,
                        borderRadius: 12,
                        padding: 12,
                        display: 'flex',
                        gap: 10,
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            inset: -10,
                            borderRadius: 16,
                            background: `rgba(83,184,255,${0.35 * widgetGlowOpacity})`,
                            filter: 'blur(18px)',
                            pointerEvents: 'none',
                        }}
                    />
                    <div
                        style={{
                            width: 92,
                            height: '100%',
                            borderRadius: 8,
                            background: palette.surfaceElevated,
                            border: `1px solid ${palette.borderSubtle}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Code2 size={24} color={palette.blueSoft} />
                    </div>
                    <div
                        style={{
                            flex: 1,
                            borderRadius: 8,
                            background: palette.surfaceElevated,
                            border: `1px solid ${palette.borderSubtle}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <MessageSquare size={22} color={palette.purpleSoft} />
                    </div>
                </div>
            </div>
        </AbsoluteFill>
    );
};
