import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import type { ChatMessage } from '../../components/RightPanelChatMock';
import { CanvasMock } from '../../components/CanvasMock';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { TextOverlay } from '../../components/TextOverlay';
import { WebsiteContent } from '../../components/WebsiteContent';
import { interp } from '../../utils/timing';
import { palette } from '../../utils/tokens';

const messages: ChatMessage[] = [
    {
        role: 'user',
        text: 'Build a hero like this reference.',
        startFrame: 60,
        typedThroughFrame: 220,
    },
    {
        role: 'ai',
        text: 'Generating a hero with matching layout, color, and tone.',
        startFrame: 280,
        typedThroughFrame: 480,
    },
];

/**
 * AI builds it for you. The chat shows the user's prompt + AI reply,
 * and the website materializes block-by-block on the canvas.
 *
 * To convey "building", we crossfade an empty/skeleton state into the
 * full-site state across the AI's typing window.
 */
export const SceneB2AIBuilds: React.FC = () => {
    const frame = useCurrentFrame();

    // Mask layered over the website that retracts as the AI builds.
    // The mask reveals from top to bottom.
    const buildProgress = interp(frame, [320, 720], [0, 1]);
    const installed = buildProgress > 0.3;

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <EditorScene
                activeTab="layers"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                            <WebsiteContent variant={installed ? 'features' : 'default'} />
                            {/* Curtain — covers the bottom (1 - progress) of the page,
                                receding as the AI builds. */}
                            <div
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    right: 0,
                                    top: `${buildProgress * 100}%`,
                                    bottom: 0,
                                    background:
                                        'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,1) 12%)',
                                    pointerEvents: 'none',
                                }}
                            />
                            {/* Animated scan line at the curtain edge */}
                            <div
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    right: 0,
                                    top: `calc(${buildProgress * 100}% - 1px)`,
                                    height: 2,
                                    background:
                                        'linear-gradient(90deg, rgba(0,129,222,0) 0%, rgba(0,129,222,0.85) 50%, rgba(0,129,222,0) 100%)',
                                    opacity: buildProgress > 0.02 && buildProgress < 0.98 ? 1 : 0,
                                    pointerEvents: 'none',
                                }}
                            />
                        </div>
                    </CanvasMock>
                }
                rightPanel={
                    <RightPanelChatMock
                        messages={messages}
                        currentFrame={frame}
                        aiTypingUntilFrame={280}
                    />
                }
            />

            <div
                style={{
                    position: 'absolute',
                    left: 80,
                    bottom: 80,
                    width: 700,
                    pointerEvents: 'none',
                }}
            >
                <TextOverlay
                    text="AI builds it for you."
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
