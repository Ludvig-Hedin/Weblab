import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { BrandMark } from '../../components/BrandMark';
import { CanvasMock } from '../../components/CanvasMock';
import { Cursor } from '../../components/Cursor';
import { EditorMockup } from '../../components/EditorMockup';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { cubicBezier } from '../../utils/paths';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * Storyboard A — Scene 3 (0:10–0:18, frames 600–1080, scene length 480).
 *
 * Both widgets fuse into the full Weblab editor wireframe, brand mark
 * reveals, cursor enters from top-right.
 */

const SCENE_LENGTH = 480;

export const SceneA3Fuse: React.FC = () => {
    const frame = useCurrentFrame();

    // Editor wireframe fades in over 40 frames.
    const editorOpacity = interp(frame, [0, 40], [0, 1]);
    const editorScale = interp(frame, [0, 40], [0.96, 1]);

    // Brand wordmark appears on top from ~frame 80, then settles.
    const wordmarkOpacity = interp(frame, [80, 140], [0, 1]);
    const wordmarkLift = interp(frame, [80, 140], [16, 0]);

    // Halo glow behind the wordmark, peaks then fades.
    const haloIn = interp(frame, [60, 160], [0, 0.28]);
    const haloOut = interp(frame, [260, 380], [1, 0]);
    const haloOpacity = haloIn * haloOut;

    // Wordmark fades back so the editor reads cleanly into the next scene.
    const wordmarkExit = interp(frame, [320, 420], [1, 0]);
    const wordmarkAlpha = wordmarkOpacity * wordmarkExit;

    // Cursor enters from top-right on a Bezier curve into the canvas centre.
    const cursorStart = 60;
    const cursorLen = 200;
    const t = Math.max(0, Math.min(1, (frame - cursorStart) / cursorLen));
    const cursorPath = cubicBezier(
        { x: 1820, y: 100 },
        { x: 1500, y: 300 },
        { x: 1200, y: 400 },
        { x: 960, y: 540 },
        t,
    );
    const cursorOpacity = interp(frame, [cursorStart, cursorStart + 20], [0, 1]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                fontFamily: fontStack,
            }}
        >
            {/* Editor mockup behind */}
            <div
                style={{
                    position: 'absolute',
                    inset: 60,
                    opacity: editorOpacity,
                    transform: `scale(${editorScale})`,
                    transformOrigin: '50% 50%',
                }}
            >
                <EditorMockup
                    leftPanel={<LeftPanelMock />}
                    canvas={
                        <CanvasMock title="Home — desktop">
                            <div
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 14,
                                }}
                            >
                                <div
                                    style={{
                                        width: 520,
                                        height: 18,
                                        borderRadius: 6,
                                        background: 'rgba(255,255,255,0.10)',
                                    }}
                                />
                                <div
                                    style={{
                                        width: 380,
                                        height: 14,
                                        borderRadius: 6,
                                        background: 'rgba(255,255,255,0.06)',
                                    }}
                                />
                                <div
                                    style={{
                                        marginTop: 10,
                                        width: 140,
                                        height: 32,
                                        borderRadius: 8,
                                        background: 'rgba(0,129,222,0.55)',
                                    }}
                                />
                            </div>
                        </CanvasMock>
                    }
                    rightPanel={<RightPanelChatMock messages={[]} currentFrame={frame} />}
                />
            </div>

            {/* Halo + wordmark */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        width: 560,
                        height: 560,
                        borderRadius: '50%',
                        background: 'rgba(0,129,222,0.30)',
                        filter: 'blur(100px)',
                        opacity: haloOpacity,
                    }}
                />
                <div
                    style={{
                        position: 'relative',
                        opacity: wordmarkAlpha,
                        transform: `translateY(${wordmarkLift}px)`,
                    }}
                >
                    <BrandMark variant="wordmark" width={460} />
                </div>
            </div>

            {/* Cursor enters from top-right */}
            <Cursor x={cursorPath.x} y={cursorPath.y} opacity={cursorOpacity} />
            {/* Reserved scene length marker. */}
            <span style={{ display: 'none' }}>{SCENE_LENGTH}</span>
        </AbsoluteFill>
    );
};
