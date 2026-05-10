import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cursorAt, drift } from '../../utils/cursor';
import { interp } from '../../utils/timing';
import { palette } from '../../utils/tokens';

/**
 * F1.3 — Type prompt INTO the composer input. The text appears character
 * by character in the input field — NOT in a chat bubble. The bubble
 * only appears after Send (next scene).
 */
const PROMPT = 'make a softer hero with two CTAs';

export const SceneF1_3Type: React.FC = () => {
    const frame = useCurrentFrame();

    // Composer typing across the full scene.
    const composerProgress = interp(frame, [10, 320], [0, 1]);

    // Cursor parks at composer (incidental tiny drift) — no big moves.
    const cursor = cursorAt(frame, [
        drift({ x: 1657, y: 938 }, { x: 1665, y: 945 }, 0, 200),
        drift({ x: 1665, y: 945 }, { x: 1655, y: 942 }, 200, 360),
    ]);

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
                rightPanel={
                    <RightPanelChatMock
                        messages={[]}
                        currentFrame={frame}
                        composerText={PROMPT}
                        composerProgress={composerProgress}
                        composerBadge={{ text: 'Reference attached', from: 0 }}
                    />
                }
                overlay={<Cursor x={cursor.x} y={cursor.y} />}
            />
        </AbsoluteFill>
    );
};
