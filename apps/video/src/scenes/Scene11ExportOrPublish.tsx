import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../components/CanvasMock';
import { ClickRipple } from '../components/ClickRipple';
import { Cursor } from '../components/Cursor';
import { EditorScene } from '../components/EditorScene';
import { LeftPanelMock } from '../components/LeftPanelMock';
import { PublishCard } from '../components/PublishCard';
import { RightPanelChatMock } from '../components/RightPanelChatMock';
import { TextOverlay } from '../components/TextOverlay';
import { WebsiteContent } from '../components/WebsiteContent';
import { cursorAt, cursorTip, moveToClick } from '../utils/cursor';
import { interp } from '../utils/timing';
import { palette } from '../utils/tokens';

// Top-bar Publish button — right side of the editor's top bar.
const PUBLISH_BTN = { x: 1810, y: 95 };

export const Scene11ExportOrPublish: React.FC = () => {
    const frame = useCurrentFrame();

    const CLICK_FRAME = 220;
    const cursor = cursorAt(frame, [moveToClick({ x: 980, y: 540 }, PUBLISH_BTN, CLICK_FRAME, 80)]);
    const tip = cursorTip(cursor);

    // Card rises after click.
    const cardOpacity = interp(frame, [CLICK_FRAME + 8, CLICK_FRAME + 60], [0, 1]);
    const cardLift = interp(frame, [CLICK_FRAME + 8, CLICK_FRAME + 60], [16, 0]);
    const urlProgress = interp(frame, [CLICK_FRAME + 30, CLICK_FRAME + 130], [0, 1]);
    const pulse = interp(frame, [CLICK_FRAME + 60, 580], [0, 1]);

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
            <div
                style={{
                    position: 'absolute',
                    left: 80,
                    bottom: 80,
                    width: 880,
                    pointerEvents: 'none',
                }}
            >
                <TextOverlay
                    text="Publish with Weblab."
                    enter={20}
                    exit={580}
                    style="display"
                    align="left"
                    weight={500}
                />
            </div>
        </AbsoluteFill>
    );
};
