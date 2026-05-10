import React from 'react';
import { AbsoluteFill } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { TextOverlay } from '../../components/TextOverlay';
import { WebsiteContent } from '../../components/WebsiteContent';
import { palette } from '../../utils/tokens';

/**
 * F2.1 — Hook (0..120). Wide editor, no right panel. The canvas is the
 * star.
 */
export const SceneF2_1Hook: React.FC = () => {
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
                rightPanelWidth={0}
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
                    text="Direct edits."
                    enter={10}
                    exit={110}
                    style="display"
                    align="left"
                    weight={500}
                />
            </div>
        </AbsoluteFill>
    );
};
