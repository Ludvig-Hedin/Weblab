import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import type { ChatMessage } from '../../components/RightPanelChatMock';
import { CanvasMock } from '../../components/CanvasMock';
import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { TextOverlay } from '../../components/TextOverlay';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cursorAt, cursorTip, moveToClick } from '../../utils/cursor';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

const messages: ChatMessage[] = [
    {
        role: 'user',
        text: 'Soften the hero and add our brand colors.',
        startFrame: 200,
        typedThroughFrame: 320,
    },
    {
        role: 'ai',
        text: "I've softened the headline and made the CTA brand blue.",
        startFrame: 380,
        typedThroughFrame: 540,
    },
];

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

const COMPOSER = { x: 1660, y: 920 };
const SEND_BUTTON = { x: 1690, y: 940 };

export const SceneDCh2AI: React.FC = () => {
    const frame = useCurrentFrame();
    const counterOpacity = interp(frame, [10, 50], [0, 1]);

    const CLICK_COMPOSER = 150;
    const CLICK_SEND = 290;

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1240, y: 600 }, COMPOSER, CLICK_COMPOSER, 60),
        moveToClick({ x: COMPOSER.x - 3, y: COMPOSER.y - 2 }, SEND_BUTTON, CLICK_SEND, 40),
    ]);
    const tip = cursorTip(cursor);

    const variant = frame >= 540 ? 'softened' : 'default';

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <EditorScene
                activeTab="layers"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <WebsiteContent
                            variant={variant}
                            selection={frame >= 200 && frame < 400 ? 'h1' : 'none'}
                        />
                    </CanvasMock>
                }
                rightPanel={
                    <RightPanelChatMock
                        messages={messages}
                        currentFrame={frame}
                        aiTypingUntilFrame={380}
                    />
                }
                overlay={
                    <>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={CLICK_COMPOSER} x={tip.x} y={tip.y} />
                        <ClickRipple at={CLICK_SEND} x={tip.x} y={tip.y} />
                    </>
                }
            />

            <ChapterCounter index={2} total={5} opacity={counterOpacity} />

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
                    text="2. AI as a teammate."
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
