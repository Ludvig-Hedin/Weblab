import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { BrandMark } from '../../components/BrandMark';
import { CanvasMock } from '../../components/CanvasMock';
import { EditorMockup } from '../../components/EditorMockup';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { TextOverlay } from '../../components/TextOverlay';
import { ZoomWrapper } from '../../components/ZoomWrapper';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * Beat 3 — 1200 frames. The two beat-1/beat-2 widgets fuse into the full
 * Weblab editor wide shot. Wordmark reveals over the editor, then both
 * settle and the line "Weblab gives both." holds.
 */
export const SceneE3Both: React.FC = () => {
    const frame = useCurrentFrame();

    // Cross-fade from Beat 2.
    const introFade = interp(frame, [0, 60], [0, 1]);

    // Two ghost widgets converge toward center between 0 and 180.
    const convergeT = interp(frame, [0, 180], [0, 1]);
    const ghostOpacity = interp(frame, [0, 90], [0.85, 0]); // fade out by ~90
    const purpleX = interp(convergeT, [0, 1], [560, 0]);
    const blueX = interp(convergeT, [0, 1], [-560, 0]);

    // Editor wide shot fades in as widgets fuse.
    const editorOpacity = interp(frame, [120, 260], [0, 1]);

    // Wordmark reveal.
    const wordmarkOpacity = interp(frame, [260, 380], [0, 1]);
    const wordmarkLift = interp(frame, [260, 380], [12, 0]);
    const wordmarkOut = interp(frame, [820, 920], [1, 0]);

    // Tagline reveal after wordmark settles.
    const taglineEnter = 380;
    const taglineExit = 1140;

    return (
        <AbsoluteFill style={{ background: palette.background, opacity: introFade }}>
            {/* Editor wide shot, slow zoom 1.05 -> 1.00 for breath. */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: editorOpacity,
                }}
            >
                <ZoomWrapper from={1.05} to={1.0} start={120} length={300}>
                    <div style={{ position: 'absolute', inset: 80 }}>
                        <EditorMockup
                            leftPanel={<LeftPanelMock />}
                            canvas={
                                <CanvasMock>
                                    <div
                                        style={{
                                            position: 'absolute',
                                            inset: 32,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 14,
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: 540,
                                                height: 22,
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
                                                width: 140,
                                                height: 36,
                                                borderRadius: 8,
                                                background: 'rgba(0,129,222,0.45)',
                                                marginTop: 10,
                                            }}
                                        />
                                    </div>
                                </CanvasMock>
                            }
                            rightPanel={<RightPanelChatMock messages={[]} currentFrame={frame} />}
                        />
                    </div>
                </ZoomWrapper>
            </div>

            {/* Two ghost widgets converging into the center. */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    opacity: ghostOpacity,
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        width: 168,
                        height: 108,
                        borderRadius: 12,
                        background: palette.surface,
                        border: `1px solid ${palette.border}`,
                        transform: `translateX(${purpleX}px)`,
                        boxShadow: `0 0 60px rgba(193,116,255,0.35)`,
                    }}
                />
                <div
                    style={{
                        position: 'absolute',
                        width: 200,
                        height: 116,
                        borderRadius: 12,
                        background: palette.surface,
                        border: `1px solid ${palette.border}`,
                        transform: `translateX(${blueX}px)`,
                        boxShadow: `0 0 60px rgba(83,184,255,0.35)`,
                    }}
                />
            </div>

            {/* Wordmark reveal centered above the editor. */}
            <div
                style={{
                    position: 'absolute',
                    top: 260,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    opacity: wordmarkOpacity * wordmarkOut,
                    transform: `translateY(${wordmarkLift}px)`,
                    fontFamily: fontStack,
                }}
            >
                <BrandMark variant="wordmark" width={360} />
            </div>

            {/* Tagline at bottom. */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    paddingBottom: 110,
                }}
            >
                <div style={{ width: 900 }}>
                    <TextOverlay
                        text="Weblab gives both."
                        enter={taglineEnter}
                        exit={taglineExit}
                        style="display"
                    />
                </div>
            </div>
        </AbsoluteFill>
    );
};
