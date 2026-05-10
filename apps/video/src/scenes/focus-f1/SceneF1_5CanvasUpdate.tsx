import React from 'react';
import { ArrowRight } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { TextOverlay } from '../../components/TextOverlay';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * F1.5 — Canvas Update (0..600 scene-local). Pan to canvas. Hero
 * re-renders: subtitle softens; two CTAs appear staggered 12f. Text
 * overlay in safe zone (top-left).
 */

const HeroSoftenedTwoCtas: React.FC<{ frame: number }> = ({ frame }) => {
    const headlineWeight = interp(frame, [20, 80], [600, 500]);
    const headlineColor =
        frame > 60 ? `rgba(${interp(frame, [60, 120], [10, 31])}, 41, 55, 1)` : '#0a0a0a';
    const primaryT = interp(frame, [80, 130], [0, 1]);
    const secondaryT = interp(frame, [120, 170], [0, 1]);

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                background: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 24,
                padding: '0 60px',
                fontFamily: fontStack,
            }}
        >
            <div
                style={{
                    fontSize: 56,
                    fontWeight: headlineWeight,
                    color: headlineColor,
                    letterSpacing: -1.4,
                    lineHeight: 1.05,
                    maxWidth: 760,
                    textAlign: 'center',
                }}
            >
                Tools to build calmly.
            </div>
            <div
                style={{
                    fontSize: 17,
                    lineHeight: 1.55,
                    color: '#525252',
                    fontWeight: 400,
                    maxWidth: 540,
                    textAlign: 'center',
                }}
            >
                A softer, calmer hero with two clear ways forward.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <div
                    style={{
                        opacity: primaryT,
                        transform: `translateY(${(1 - primaryT) * 8}px)`,
                        padding: '12px 22px',
                        borderRadius: 10,
                        background: '#0081DE',
                        color: '#fff',
                        fontSize: 13.5,
                        fontWeight: 500,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    Start building <ArrowRight size={14} strokeWidth={2} />
                </div>
                <div
                    style={{
                        opacity: secondaryT,
                        transform: `translateY(${(1 - secondaryT) * 8}px)`,
                        padding: '12px 22px',
                        borderRadius: 10,
                        border: '1px solid #e5e5e5',
                        color: '#0a0a0a',
                        fontSize: 13.5,
                        fontWeight: 500,
                    }}
                >
                    Watch demo
                </div>
            </div>
        </div>
    );
};

export const SceneF1_5CanvasUpdate: React.FC = () => {
    const frame = useCurrentFrame();

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <EditorScene
                activeTab="layers"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <HeroSoftenedTwoCtas frame={frame} />
                    </CanvasMock>
                }
                rightPanel={<RightPanelChatMock messages={[]} currentFrame={frame} />}
            />
            <div
                style={{
                    position: 'absolute',
                    left: 80,
                    top: 80,
                    width: 540,
                    pointerEvents: 'none',
                }}
            >
                <TextOverlay
                    text="Your canvas updates live."
                    enter={20}
                    exit={520}
                    style="display"
                    align="left"
                    weight={500}
                />
            </div>
        </AbsoluteFill>
    );
};
