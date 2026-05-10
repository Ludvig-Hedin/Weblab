import React from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { TextOverlay } from '../../components/TextOverlay';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cursorAt, cursorTip, moveToClick } from '../../utils/cursor';
import { fontStack, palette } from '../../utils/tokens';

const InlineBreakpointPill: React.FC<{ activeIdx: number }> = ({ activeIdx }) => (
    <div
        style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0,
            padding: 3,
            borderRadius: 8,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            fontFamily: fontStack,
        }}
    >
        {[Monitor, Tablet, Smartphone].map((Icon, i) => {
            const active = i === activeIdx;
            return (
                <div
                    key={i}
                    style={{
                        width: 28,
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 5,
                        background: active ? 'rgba(0,129,222,0.22)' : 'transparent',
                        color: active ? palette.blueSoft : palette.textMuted,
                    }}
                >
                    <Icon size={12} strokeWidth={1.7} />
                </div>
            );
        })}
    </div>
);

// Click on the H1 (subhead-ish) target in the canvas, then on the tablet pill.
const SUBHEAD = { x: 960, y: 560 };
const TABLET_PILL = { x: 980, y: 168 };

export const SceneB3Refine: React.FC = () => {
    const frame = useCurrentFrame();

    const CLICK_HERO = 160;
    const CLICK_TABLET = 460;

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1240, y: 760 }, SUBHEAD, CLICK_HERO, 60),
        moveToClick({ x: SUBHEAD.x - 3, y: SUBHEAD.y - 2 }, TABLET_PILL, CLICK_TABLET, 80),
    ]);
    const tip = cursorTip(cursor);

    const isTablet = frame >= CLICK_TABLET + 4;
    const frameWidth = isTablet
        ? Math.max(820, 1280 - ((frame - (CLICK_TABLET + 4)) / 30) * 460)
        : 1280;

    const selection = frame >= CLICK_HERO && frame < CLICK_TABLET ? 'subhead' : 'none';

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <EditorScene
                activeTab="layers"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                        <div
                            style={{
                                position: 'absolute',
                                top: 16,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                zIndex: 5,
                            }}
                        >
                            <InlineBreakpointPill activeIdx={isTablet ? 1 : 0} />
                        </div>
                        <CanvasMock
                            breakpoint={isTablet ? 'tablet' : 'desktop'}
                            frameWidth={frameWidth}
                            showBreakpointPill={false}
                        >
                            <WebsiteContent selection={selection} />
                        </CanvasMock>
                    </div>
                }
                rightPanel={<RightPanelChatMock messages={[]} currentFrame={frame} />}
                overlay={
                    <>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={CLICK_HERO} x={tip.x} y={tip.y} />
                        <ClickRipple at={CLICK_TABLET} x={tip.x} y={tip.y} />
                    </>
                }
            />

            <div
                style={{
                    position: 'absolute',
                    left: 80,
                    bottom: 80,
                    width: 800,
                    pointerEvents: 'none',
                }}
            >
                <TextOverlay
                    text="Refine it like a designer."
                    enter={20}
                    exit={840}
                    style="display"
                    align="left"
                    weight={500}
                />
            </div>
        </AbsoluteFill>
    );
};
