import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { ClickRipple } from '../../components/ClickRipple';
import { ComponentLibraryDrawer } from '../../components/ComponentLibraryDrawer';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { TextOverlay } from '../../components/TextOverlay';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cursorAt, cursorTip, drift, moveToClick } from '../../utils/cursor';
import { interp } from '../../utils/timing';
import { palette } from '../../utils/tokens';

const PRICING_CARD = { x: 1080, y: 880 };
const FOOTER_CARD = { x: 1480, y: 880 };

export const SceneB4Components: React.FC = () => {
    const frame = useCurrentFrame();
    const drawerProgress = interp(frame, [10, 80], [0, 1]);

    const CLICK_PRICING = 200;
    const CLICK_FOOTER = 480;

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1300, y: 540 }, PRICING_CARD, CLICK_PRICING, 60),
        // Pause on the pricing card while it installs.
        drift(
            { x: PRICING_CARD.x - 3, y: PRICING_CARD.y - 2 },
            { x: PRICING_CARD.x - 3, y: PRICING_CARD.y - 2 },
            CLICK_PRICING + 20,
            CLICK_PRICING + 80,
        ),
        moveToClick(
            { x: PRICING_CARD.x - 3, y: PRICING_CARD.y - 2 },
            FOOTER_CARD,
            CLICK_FOOTER,
            60,
        ),
    ]);
    const tip = cursorTip(cursor);

    const installed = frame >= CLICK_PRICING + 6;
    const highlightIdx = frame < CLICK_PRICING - 24 ? undefined : frame < CLICK_FOOTER - 24 ? 2 : 5;

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
                            highlightIndex={highlightIdx}
                        />
                    </CanvasMock>
                }
                rightPanel={<RightPanelChatMock messages={[]} currentFrame={frame} />}
                overlay={
                    <>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={CLICK_PRICING} x={tip.x} y={tip.y} />
                        <ClickRipple
                            at={CLICK_FOOTER}
                            x={tip.x}
                            y={tip.y}
                            color={palette.purpleSoft}
                        />
                    </>
                }
            />
            <div
                style={{
                    position: 'absolute',
                    left: 80,
                    top: 80,
                    width: 800,
                    pointerEvents: 'none',
                }}
            >
                <TextOverlay
                    text="Use the components you already have."
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
