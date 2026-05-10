import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import type { ChatMessage } from '../components/RightPanelChatMock';
import { CanvasMock } from '../components/CanvasMock';
import { ClickRipple } from '../components/ClickRipple';
import { Cursor } from '../components/Cursor';
import { EditorScene } from '../components/EditorScene';
import { LeftPanelMock } from '../components/LeftPanelMock';
import { RightPanelChatMock } from '../components/RightPanelChatMock';
import { TextOverlay } from '../components/TextOverlay';
import { WebsiteContent } from '../components/WebsiteContent';
import { cursorAt, cursorTip, moveToClick } from '../utils/cursor';
import { interp } from '../utils/timing';
import { palette } from '../utils/tokens';

const PROMPT = 'Make the hero softer and more inviting.';

const aiMessage: ChatMessage = {
    role: 'ai',
    text: 'Updated the hero — softer headline weight and a calmer accent.',
    startFrame: 280,
    typedThroughFrame: 380,
};

// Composer click target — within the right panel.
const COMPOSER_TARGET = { x: 1660, y: 920 };
const SEND_TARGET = { x: 1810, y: 922 };

export const Scene05AITeammate: React.FC = () => {
    const frame = useCurrentFrame();

    // Cursor: short hop to composer (24f), then short hop to send button (18f).
    const FOCUS_FRAME = 80; // click composer
    const SEND_FRAME = 240; // click send

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1100, y: 600 }, COMPOSER_TARGET, FOCUS_FRAME, 24),
        moveToClick(
            { x: COMPOSER_TARGET.x - 3, y: COMPOSER_TARGET.y - 2 },
            SEND_TARGET,
            SEND_FRAME,
            18,
        ),
    ]);
    const tip = cursorTip(cursor);

    // Composer typing 100..220.
    const composerProgress = interp(frame, [100, 220], [0, 1]);

    // Canvas softens after AI replies.
    const softenT = interp(frame, [320, 420], [0, 1]);
    const variant = softenT > 0.5 ? 'softened' : 'default';

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <EditorScene
                activeTab="layers"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <WebsiteContent variant={variant} selection="h1" />
                    </CanvasMock>
                }
                rightPanel={
                    <RightPanelChatMock
                        messages={[aiMessage]}
                        currentFrame={frame}
                        composerText={PROMPT}
                        composerProgress={composerProgress}
                        onSendFrame={SEND_FRAME}
                        aiTypingUntilFrame={280}
                    />
                }
                overlay={
                    <>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={FOCUS_FRAME} x={tip.x} y={tip.y} />
                        <ClickRipple at={SEND_FRAME} x={SEND_TARGET.x} y={SEND_TARGET.y} />
                    </>
                }
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
                    text="Your AI teammate."
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
