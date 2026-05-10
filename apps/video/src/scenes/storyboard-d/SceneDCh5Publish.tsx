import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { PublishCard } from '../../components/PublishCard';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { TextOverlay } from '../../components/TextOverlay';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cursorAt, cursorTip, moveToClick } from '../../utils/cursor';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

const ChapterCounter: React.FC<{ index: number; total: number; opacity: number }> = ({
    index,
    total,
    opacity,
}) => (
    <div
        style={{
            position: 'absolute',
            top: 48,
            right: 60,
            fontFamily: fontStack,
            fontSize: 12,
            letterSpacing: 1.2,
            color: palette.textMuted,
            opacity,
            fontVariantNumeric: 'tabular-nums',
        }}
    >
        {index}/{total}
    </div>
);

const PUBLISH_BTN = { x: 1810, y: 95 };

export const SceneDCh5Publish: React.FC = () => {
    const frame = useCurrentFrame();
    const counterOpacity = interp(frame, [10, 50], [0, 1]);

    const CLICK_FRAME = 200;
    const cursor = cursorAt(frame, [
        moveToClick({ x: 1080, y: 580 }, PUBLISH_BTN, CLICK_FRAME, 80),
    ]);
    const tip = cursorTip(cursor);

    const cardOpacity = interp(frame, [CLICK_FRAME + 8, CLICK_FRAME + 60], [0, 1]);
    const cardLift = interp(frame, [CLICK_FRAME + 8, CLICK_FRAME + 60], [16, 0]);
    const urlProgress = interp(frame, [CLICK_FRAME + 30, CLICK_FRAME + 130], [0, 1]);
    const pulse = interp(frame, [CLICK_FRAME + 60, 880], [0, 2]);

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <EditorScene
                activeTab="layers"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <WebsiteContent variant="features" />
                    </CanvasMock>
                }
                rightPanel={<RightPanelChatMock messages={[]} currentFrame={frame} />}
                overlay={
                    <>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={CLICK_FRAME} x={tip.x} y={tip.y} />
                    </>
                }
            />

            <div
                style={{
                    position: 'absolute',
                    right: 100,
                    top: 240,
                    opacity: cardOpacity,
                    transform: `translateY(${cardLift}px)`,
                    pointerEvents: 'none',
                }}
            >
                <PublishCard urlProgress={urlProgress} pulse={pulse} />
            </div>

            <ChapterCounter index={5} total={5} opacity={counterOpacity} />

            <div
                style={{
                    position: 'absolute',
                    left: 80,
                    bottom: 80,
                    width: 900,
                    pointerEvents: 'none',
                }}
            >
                <TextOverlay
                    text="5. Publish with Weblab."
                    enter={20}
                    exit={240}
                    style="display"
                    align="left"
                    weight={500}
                />
            </div>
        </AbsoluteFill>
    );
};
