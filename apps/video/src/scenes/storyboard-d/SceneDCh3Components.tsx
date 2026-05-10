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

const FEATURES_CARD = { x: 760, y: 880 };

export const SceneDCh3Components: React.FC = () => {
    const frame = useCurrentFrame();
    const counterOpacity = interp(frame, [10, 50], [0, 1]);

    const drawerProgress = interp(frame, [10, 90], [0, 1]);

    const CLICK_FRAME = 240;
    const cursor = cursorAt(frame, [
        moveToClick({ x: 1280, y: 540 }, FEATURES_CARD, CLICK_FRAME, 60),
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
                            highlightIndex={frame >= CLICK_FRAME - 24 ? 1 : undefined}
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

            <ChapterCounter index={3} total={5} opacity={counterOpacity} />

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
                    text="3. Real components."
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
