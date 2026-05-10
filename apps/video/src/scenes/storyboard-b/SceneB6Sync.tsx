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
import { palette } from '../../utils/tokens';

const teammatePath: readonly [Point, Point, Point, Point] = [
    { x: 1700, y: 980 },
    { x: 1500, y: 800 },
    { x: 1200, y: 600 },
    { x: 1020, y: 460 },
];

export const SceneB6Sync: React.FC = () => {
    const frame = useCurrentFrame();

    const pulse = interp(frame, [40, 280], [0, 2]);
    const syncOpacity = interp(frame, [20, 80], [0, 1]);

    const teammateOpacity = interp(frame, [220, 280], [0, 1]);
    const teammateT = interp(frame, [220, 460], [0, 1]);
    const teammatePos = cubicBezier(
        teammatePath[0],
        teammatePath[1],
        teammatePath[2],
        teammatePath[3],
        teammateT,
    );

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
                    <CollabCursor
                        x={teammatePos.x}
                        y={teammatePos.y}
                        name="Sam"
                        variant="purple"
                        opacity={teammateOpacity}
                    />
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
                    pointerEvents: 'none',
                }}
            >
                <SyncPill pulse={pulse} label="Synced" />
            </div>

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
                    text="Stay in sync."
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
