import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { TextOverlay } from '../../components/TextOverlay';
import { WebsiteContent } from '../../components/WebsiteContent';
import { interp } from '../../utils/timing';
import { palette } from '../../utils/tokens';

/**
 * F2.6 — Pullback. Editor wide. The text overlay sums up the message.
 */
export const SceneF2_6Pullback: React.FC = () => {
    const frame = useCurrentFrame();
    const zoom = interp(frame, [0, 60], [1.04, 1.0]);

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <div
                style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: '50% 50%',
                    width: '100%',
                    height: '100%',
                }}
            >
                <EditorScene
                    activeTab="layers"
                    projectName="northwind"
                    leftPanel={<LeftPanelMock kind="layers" />}
                    canvas={
                        <CanvasMock breakpoint="desktop">
                            <WebsiteContent variant="features" />
                        </CanvasMock>
                    }
                    rightPanelWidth={0}
                />
            </div>
            <div
                style={{
                    position: 'absolute',
                    left: 80,
                    bottom: 80,
                    width: 540,
                    pointerEvents: 'none',
                }}
            >
                <TextOverlay
                    text="No tabs. Just edit."
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
