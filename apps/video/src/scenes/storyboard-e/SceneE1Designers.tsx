import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

const LINE = 'Designers asked for more power.';

/**
 * Beat 1 — 900 frames. Black, slow type-on. A small canvas widget glows
 * once toward the end of the beat to foreshadow Beat 3's fusion.
 */
export const SceneE1Designers: React.FC = () => {
    const frame = useCurrentFrame();

    // Slow type-on: lands by ~frame 360, holds, fades out near the end.
    const charsPerFrame = LINE.length / 360;
    const visibleCount = Math.min(LINE.length, Math.floor(frame * charsPerFrame));
    const visible = LINE.slice(0, visibleCount);
    const isDone = visibleCount >= LINE.length;
    const blinkVisible = isDone && Math.floor((frame - 360) / 18) % 2 === 0;

    // Soft pad-style halo swell behind the line.
    const haloOpacity = interp(frame, [60, 360], [0, 0.18]);

    // Tiny canvas widget in the corner, glows once between 660 and 800.
    const widgetEnter = interp(frame, [600, 720], [0, 1]);
    const widgetGlow = interp(frame, [680, 760], [0, 1]);
    const widgetGlowOut = interp(frame, [760, 840], [1, 0]);
    const widgetGlowOpacity = Math.min(widgetGlow, widgetGlowOut);
    const widgetLift = interp(frame, [600, 720], [10, 0]);

    // Whole-beat outro fade so we cross-fade smoothly into Beat 2.
    const outroFade = interp(frame, [840, 900], [1, 0]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fontStack,
                opacity: outroFade,
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    width: 640,
                    height: 640,
                    borderRadius: '50%',
                    background: 'rgba(146,14,255,0.22)',
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
            {/* Tiny canvas widget hint, bottom-right */}
            <div
                style={{
                    position: 'absolute',
                    right: 160,
                    bottom: 160,
                    opacity: widgetEnter,
                    transform: `translateY(${widgetLift}px)`,
                }}
            >
                <div
                    style={{
                        position: 'relative',
                        width: 168,
                        height: 108,
                        background: palette.surface,
                        border: `1px solid ${palette.border}`,
                        borderRadius: 12,
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                    }}
                >
                    {/* Glow halo */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: -10,
                            borderRadius: 16,
                            background: `rgba(193,116,255,${0.35 * widgetGlowOpacity})`,
                            filter: 'blur(18px)',
                            pointerEvents: 'none',
                        }}
                    />
                    <div
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 9,
                            background: palette.purpleSoft,
                            opacity: 0.85,
                        }}
                    />
                    <div
                        style={{
                            width: 96,
                            height: 8,
                            borderRadius: 4,
                            background: 'rgba(255,255,255,0.18)',
                        }}
                    />
                    <div
                        style={{
                            width: 64,
                            height: 8,
                            borderRadius: 4,
                            background: 'rgba(255,255,255,0.10)',
                        }}
                    />
                </div>
            </div>
        </AbsoluteFill>
    );
};
