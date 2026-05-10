import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { TextOverlay } from '../../components/TextOverlay';
import { WebsiteContent } from '../../components/WebsiteContent';
import { interp } from '../../utils/timing';
import { palette } from '../../utils/tokens';

/**
 * F3.5 — Keep designing. The imported site is now in the editor and the
 * user can start designing immediately.
 */
export const SceneF3_5KeepDesigning: React.FC = () => {
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
                    projectName="site"
                    leftPanel={<LeftPanelMock kind="layers" />}
                    canvas={
                        <CanvasMock breakpoint="desktop">
                            <WebsiteContent variant="imported" />
                        </CanvasMock>
                    }
                    rightPanel={<RightPanelChatMock messages={[]} currentFrame={frame} />}
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
                    text="Keep designing."
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
