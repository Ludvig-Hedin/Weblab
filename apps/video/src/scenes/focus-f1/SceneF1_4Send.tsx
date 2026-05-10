import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import type { ChatMessage } from '../../components/RightPanelChatMock';
import { CanvasMock } from '../../components/CanvasMock';
import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cursorAt, cursorTip, moveToClick } from '../../utils/cursor';
import { palette } from '../../utils/tokens';

/**
 * F1.4 — Send (0..360 scene-local). Cursor moves to the send button (≤24f
 * hop), clicks at frame 60. The composer text becomes a bubble in the
 * messages list (12f slide-up); the AI streams a 6-line response below
 * (24f per line).
 */
const PROMPT = 'make a softer hero with two CTAs';
const SEND_TARGET = { x: 1810, y: 956 };
const CLICK_FRAME = 60;

const aiLines = [
    'Got it. Adjusting the hero.',
    'Softer headline weight.',
    'Calmer accent on the primary CTA.',
    'Adding a secondary CTA.',
    'Tightening the subhead spacing.',
    'Done — review the canvas.',
];

const aiMessages: ChatMessage[] = aiLines.map((text, i) => ({
    role: 'ai' as const,
    text,
    startFrame: 90 + i * 24,
    typedThroughFrame: 90 + i * 24 + 22,
}));

export const SceneF1_4Send: React.FC = () => {
    const frame = useCurrentFrame();

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1660, y: 940 }, SEND_TARGET, CLICK_FRAME, 18),
    ]);
    const tip = cursorTip(cursor);

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <EditorScene
                activeTab="layers"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <WebsiteContent />
                    </CanvasMock>
                }
                rightPanel={
                    <RightPanelChatMock
                        messages={aiMessages}
                        currentFrame={frame}
                        composerText={PROMPT}
                        composerProgress={1}
                        onSendFrame={CLICK_FRAME}
                    />
                }
                overlay={
                    <>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={CLICK_FRAME} x={tip.x} y={tip.y} />
                    </>
                }
            />
        </AbsoluteFill>
    );
};
