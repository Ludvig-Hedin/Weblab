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
import { cursorAt, cursorTip, drift, moveToClick } from '../../utils/cursor';
import { fontStack, palette } from '../../utils/tokens';

const SCENE_LENGTH = 1020;

// Composer click target — right side, near bottom.
const COMPOSER = { x: 1660, y: 920 };
// H1 click target — center of canvas, top.
const HERO_H1 = { x: 960, y: 380 };

const messages: ChatMessage[] = [
    {
        role: 'user',
        text: 'Soften the hero and add our brand colors.',
        startFrame: 340,
        typedThroughFrame: 460,
    },
    {
        role: 'ai',
        text: 'Updated. Lighter weight on the headline; brand blue on the CTA.',
        startFrame: 560,
        typedThroughFrame: 720,
    },
];

export const SceneA4DesignWithAI: React.FC = () => {
    const frame = useCurrentFrame();

    const CLICK_HERO_FRAME = 130;
    const CLICK_COMPOSER_FRAME = 320;

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1240, y: 760 }, HERO_H1, CLICK_HERO_FRAME, 60),
        moveToClick({ x: HERO_H1.x - 3, y: HERO_H1.y - 2 }, COMPOSER, CLICK_COMPOSER_FRAME, 80),
        // After AI replies, drift back over the canvas to admire the change.
        drift({ x: COMPOSER.x - 3, y: COMPOSER.y - 2 }, { x: 1080, y: 460 }, 720, 900),
    ]);
    const tip = cursorTip(cursor);

    const variant = frame >= 720 ? 'softened' : 'default';
    const selection = frame >= CLICK_HERO_FRAME && frame < CLICK_COMPOSER_FRAME ? 'h1' : 'none';

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                fontFamily: fontStack,
            }}
        >
            <EditorScene
                activeTab="layers"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <WebsiteContent variant={variant} selection={selection} />
                    </CanvasMock>
                }
                rightPanel={
                    <RightPanelChatMock
                        messages={messages}
                        currentFrame={frame}
                        aiTypingUntilFrame={560}
                    />
                }
                overlay={
                    <>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={CLICK_HERO_FRAME} x={tip.x} y={tip.y} />
                        <ClickRipple at={CLICK_COMPOSER_FRAME} x={tip.x} y={tip.y} />
                    </>
                }
            />

            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    paddingTop: 36,
                    pointerEvents: 'none',
                }}
            >
                <div style={{ width: 1100 }}>
                    <TextOverlay
                        text="Design with AI. Stay in control."
                        enter={20}
                        exit={SCENE_LENGTH - 30}
                        style="display"
                        weight={500}
                    />
                </div>
            </div>
        </AbsoluteFill>
    );
};
