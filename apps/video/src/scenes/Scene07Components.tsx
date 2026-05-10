import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../components/CanvasMock';
import { ClickRipple } from '../components/ClickRipple';
import { ComponentLibraryDrawer } from '../components/ComponentLibraryDrawer';
import { Cursor } from '../components/Cursor';
import { EditorScene } from '../components/EditorScene';
import { LeftPanelMock } from '../components/LeftPanelMock';
import { RightPanelChatMock } from '../components/RightPanelChatMock';
import { TextOverlay } from '../components/TextOverlay';
import { WebsiteContent } from '../components/WebsiteContent';
import { cursorAt, cursorTip, moveToClick } from '../utils/cursor';
import { interp } from '../utils/timing';
import { palette } from '../utils/tokens';

// Scene timeline (scene-local frames):
//   0–60:   drawer slides up
//   10–80:  cursor moves to pricing card (highlight index 2)
//   240:    click on Pricing
//   240+:   card pulses, cursor stays parked
//   246+:   site updates with features-style hero
const PRICING_CARD = { x: 1080, y: 880 };

export const Scene07Components: React.FC = () => {
    const frame = useCurrentFrame();
    const drawerProgress = interp(frame, [10, 80], [0, 1]);

    const CLICK_FRAME = 240;
    const cursor = cursorAt(frame, [
        moveToClick({ x: 1300, y: 540 }, PRICING_CARD, CLICK_FRAME, 50),
    ]);
    const tip = cursorTip(cursor);

    const installed = frame >= CLICK_FRAME + 6;

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <EditorScene
                activeTab="components"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <WebsiteContent variant={installed ? 'features' : 'default'} />
                        <ComponentLibraryDrawer
                            progress={drawerProgress}
                            highlightIndex={frame >= CLICK_FRAME - 24 ? 2 : undefined}
                        />
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
                    left: 80,
                    top: 80,
                    width: 540,
                    pointerEvents: 'none',
                }}
            >
                <TextOverlay
                    text="Real components, ready."
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
