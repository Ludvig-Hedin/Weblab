import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cursorAt, cursorTip, moveToClick } from '../../utils/cursor';
import { interp } from '../../utils/timing';
import { palette } from '../../utils/tokens';

/**
 * F2.2 — Drag the hero element. User clicks on the H1 (PICK_FRAME),
 * drags it slightly down (gives canvas a parallax shift), drops it
 * (DROP_FRAME). Click ripple on both ends.
 */
const PICK_TARGET = { x: 960, y: 460 };
const DROP_TARGET = { x: 960, y: 510 };

export const SceneF2_2DragHero: React.FC = () => {
    const frame = useCurrentFrame();
    const PICK_FRAME = 40;
    const DROP_FRAME = 200;

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1200, y: 700 }, PICK_TARGET, PICK_FRAME, 24),
        moveToClick({ x: PICK_TARGET.x - 3, y: PICK_TARGET.y - 2 }, DROP_TARGET, DROP_FRAME, 24),
    ]);
    const tip = cursorTip(cursor);

    // Highlight ring on the H1 once picked.
    const ringOpacity =
        frame >= PICK_FRAME && frame < DROP_FRAME + 30
            ? interp(frame, [PICK_FRAME, PICK_FRAME + 10], [0, 1])
            : 0;
    // Subtle shift of the canvas content y-offset to convey the drag.
    const heroLift = interp(frame, [PICK_FRAME, DROP_FRAME], [0, 14]);

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <EditorScene
                activeTab="layers"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <div
                            style={{
                                width: '100%',
                                height: '100%',
                                position: 'relative',
                            }}
                        >
                            <div
                                style={{
                                    transform: `translateY(${heroLift}px)`,
                                    width: '100%',
                                    height: '100%',
                                }}
                            >
                                <WebsiteContent selection={frame >= PICK_FRAME ? 'h1' : 'none'} />
                            </div>
                            {ringOpacity > 0 && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: '20%',
                                        top: `calc(28% + ${heroLift}px)`,
                                        width: '60%',
                                        height: 78,
                                        border: `1.5px solid ${palette.blue}`,
                                        borderRadius: 6,
                                        opacity: ringOpacity,
                                        pointerEvents: 'none',
                                    }}
                                />
                            )}
                        </div>
                    </CanvasMock>
                }
                rightPanelWidth={0}
                overlay={
                    <>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={PICK_FRAME} x={tip.x} y={tip.y} />
                        <ClickRipple at={DROP_FRAME} x={DROP_TARGET.x} y={DROP_TARGET.y} />
                    </>
                }
            />
        </AbsoluteFill>
    );
};
