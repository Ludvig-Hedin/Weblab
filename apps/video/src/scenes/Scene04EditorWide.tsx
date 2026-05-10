import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../components/CanvasMock';
import { Cursor } from '../components/Cursor';
import { EditorScene } from '../components/EditorScene';
import { LeftPanelMock } from '../components/LeftPanelMock';
import { RightPanelChatMock } from '../components/RightPanelChatMock';
import { TextOverlay } from '../components/TextOverlay';
import { WebsiteContent } from '../components/WebsiteContent';
import { cursorAt, drift } from '../utils/cursor';
import { interp } from '../utils/timing';
import { palette } from '../utils/tokens';

/**
 * Establishing shot of the editor — full chrome, real website inside
 * the canvas frame, AI chat panel idle on the right. The cursor drifts
 * gently (incidental motion) so the scene never feels static.
 */
export const Scene04EditorWide: React.FC = () => {
    const frame = useCurrentFrame();

    // Subtle zoom out over the first 2.5s so the eye reads the layout.
    const zoom = interp(frame, [0, 150], [1.02, 1.0]);

    // Cursor drifts diagonally across the canvas — incidental motion.
    const cursor = cursorAt(frame, [
        drift({ x: 1500, y: 320 }, { x: 1320, y: 520 }, 60, 280),
        drift({ x: 1320, y: 520 }, { x: 1100, y: 460 }, 280, 440),
    ]);

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <div
                style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: '50% 50%',
                    width: '100%',
                    height: '100%',
                    position: 'relative',
                }}
            >
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
                    overlay={<Cursor x={cursor.x} y={cursor.y} />}
                />
            </div>

            {/* Top-left safe zone, with semi-transparent backdrop so the */}
            {/* type never sits on top of editor UI. */}
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
                    text="Design real websites."
                    enter={20}
                    exit={440}
                    style="display"
                    align="left"
                    weight={500}
                />
            </div>
        </AbsoluteFill>
    );
};
