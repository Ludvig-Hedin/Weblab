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
 * F1.1 — Hook (0..180 scene-local). Editor wide, the right panel is
 * highlighted with a thin brand-blue ring so the eye lands on the chat
 * before any cursor motion.
 */
export const SceneF1_1Hook: React.FC = () => {
    const frame = useCurrentFrame();
    const ringOpacity = interp(frame, [10, 40], [0, 0.85]);

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
                    <div
                        style={{
                            position: 'absolute',
                            top: 60,
                            right: 60,
                            width: 380,
                            height: 1080 - 120,
                            border: `1px solid ${palette.blue}`,
                            borderRadius: 14,
                            opacity: ringOpacity,
                            pointerEvents: 'none',
                        }}
                    />
                }
            />
            <div
                style={{
                    position: 'absolute',
                    left: 80,
                    top: 80,
                    width: 480,
                    pointerEvents: 'none',
                }}
            >
                <TextOverlay
                    text="Talk to your site."
                    enter={20}
                    exit={170}
                    style="display"
                    align="left"
                    weight={500}
                />
            </div>
        </AbsoluteFill>
    );
};
