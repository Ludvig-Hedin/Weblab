import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import type { Point } from '../../utils/paths';
import { CanvasMock } from '../../components/CanvasMock';
import { CollabCursor } from '../../components/CollabCursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { SyncPill } from '../../components/SyncPill';
import { TextOverlay } from '../../components/TextOverlay';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cubicBezier } from '../../utils/paths';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

const pathA: readonly [Point, Point, Point, Point] = [
    { x: 720, y: 360 },
    { x: 820, y: 300 },
    { x: 940, y: 460 },
    { x: 1040, y: 400 },
];

const pathB: readonly [Point, Point, Point, Point] = [
    { x: 1140, y: 600 },
    { x: 1020, y: 540 },
    { x: 880, y: 660 },
    { x: 820, y: 580 },
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

export const SceneDCh4Sync: React.FC = () => {
    const frame = useCurrentFrame();
    const counterOpacity = interp(frame, [10, 50], [0, 1]);

    const syncOpacity = interp(frame, [40, 100], [0, 1]);
    const syncLift = interp(frame, [40, 120], [12, 0]);
    const pulse = interp(frame, [120, 720], [0, 2]);

    // Looping cursors so motion never stops.
    const tA = (frame * 0.012) % 1;
    const tB = (frame * 0.01 + 0.4) % 1;
    const a = cubicBezier(pathA[0], pathA[1], pathA[2], pathA[3], tA);
    const b = cubicBezier(pathB[0], pathB[1], pathB[2], pathB[3], tB);

    const opacityA = interp(frame, [180, 240], [0, 1]);
    const opacityB = interp(frame, [220, 280], [0, 1]);

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
                rightPanel={<RightPanelChatMock messages={[]} currentFrame={frame} />}
                overlay={
                    <>
                        <CollabCursor
                            x={a.x}
                            y={a.y}
                            name="Lina"
                            variant="blue"
                            opacity={opacityA}
                        />
                        <CollabCursor
                            x={b.x}
                            y={b.y}
                            name="Sam"
                            variant="purple"
                            opacity={opacityB}
                        />
                    </>
                }
            />

            <div
                style={{
                    position: 'absolute',
                    top: 200,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    opacity: syncOpacity,
                    transform: `translateY(${syncLift}px)`,
                    pointerEvents: 'none',
                }}
            >
                <SyncPill pulse={pulse} />
            </div>

            <ChapterCounter index={4} total={5} opacity={counterOpacity} />

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
                    text="4. Stay in sync."
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
