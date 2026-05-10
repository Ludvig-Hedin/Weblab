import React from 'react';
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
import { interp } from '../../utils/timing';
import { palette } from '../../utils/tokens';

const COMPOSER = { x: 1660, y: 920 };
const SEND_BTN = { x: 1690, y: 940 };

/**
 * Storyboard B — Scene 1 (300 frames).
 *
 * The user types a reference into the AI composer ("https://stripe.com").
 * Then they click send.
 */
export const SceneB1Reference: React.FC = () => {
    const frame = useCurrentFrame();

    const CLICK_COMPOSER = 80;
    const CLICK_SEND = 240;

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1280, y: 360 }, COMPOSER, CLICK_COMPOSER, 60),
        moveToClick({ x: COMPOSER.x - 3, y: COMPOSER.y - 2 }, SEND_BTN, CLICK_SEND, 40),
    ]);
    const tip = cursorTip(cursor);

    const composerProgress = interp(frame, [CLICK_COMPOSER + 6, CLICK_SEND - 12], [0, 1]);

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <EditorScene
                activeTab="layers"
                projectName="new project"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <WebsiteContent variant="minimal" />
                    </CanvasMock>
                }
                rightPanel={
                    <RightPanelChatMock
                        messages={[]}
                        currentFrame={frame}
                        composerText="Build me a hero like stripe.com — clean, type-led."
                        composerProgress={composerProgress}
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

            <div
                style={{
                    position: 'absolute',
                    left: 80,
                    bottom: 80,
                    width: 700,
                    pointerEvents: 'none',
                }}
            >
                <TextOverlay
                    text="Start with a reference."
                    enter={20}
                    exit={280}
                    style="display"
                    align="left"
                    weight={500}
                />
            </div>
        </AbsoluteFill>
    );
};
