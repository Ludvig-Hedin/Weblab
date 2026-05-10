import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import type { Point } from '../utils/paths';
import { CanvasMock } from '../components/CanvasMock';
import { CollabCursor } from '../components/CollabCursor';
import { EditorScene } from '../components/EditorScene';
import { LeftPanelMock } from '../components/LeftPanelMock';
import { RightPanelChatMock } from '../components/RightPanelChatMock';
import { TextOverlay } from '../components/TextOverlay';
import { WebsiteContent } from '../components/WebsiteContent';
import { cursorMoveToTarget } from '../utils/paths';
import { interp } from '../utils/timing';
import { fontStack, palette } from '../utils/tokens';

/**
 * Three named cursors moving on different elements (header, subhead, button)
 * to clearly show real-time multi-user collaboration. Cursors hop between
 * 2 anchor points per user using `cursorMoveToTarget` so motion is natural,
 * not a mathy bezier loop.
 */
interface CollabPath {
    name: string;
    variant: 'blue' | 'purple' | 'neutral';
    a: Point;
    b: Point;
    /** Frame offset so users don't move in sync. */
    offset: number;
}

const PATHS: readonly CollabPath[] = [
    // Lina — moving on the header / nav area.
    { name: 'Lina', variant: 'blue', a: { x: 720, y: 320 }, b: { x: 1040, y: 360 }, offset: 0 },
    // Sam — moving across the subhead area.
    { name: 'Sam', variant: 'purple', a: { x: 800, y: 600 }, b: { x: 1120, y: 580 }, offset: 30 },
    // Theo — moving across the CTA button.
    { name: 'Theo', variant: 'neutral', a: { x: 900, y: 720 }, b: { x: 1100, y: 720 }, offset: 60 },
];

const SAVED_PILL_FROM = 80;

export const Scene09Collaborate: React.FC = () => {
    const frame = useCurrentFrame();

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
                        {PATHS.map((p, idx) => {
                            // Each user hops back and forth between a and b
                            // every 90 frames. cursorMoveToTarget interpolates
                            // the eased position.
                            const local = Math.max(0, frame - p.offset);
                            const cycle = 180;
                            const phase = local % cycle;
                            const goingForward = phase < cycle / 2;
                            const segLocal = goingForward ? phase : phase - cycle / 2;
                            const start = goingForward ? p.a : p.b;
                            const end = goingForward ? p.b : p.a;
                            const pos = cursorMoveToTarget(start, end, cycle / 2, segLocal);
                            const opacity = interp(frame, [10 + idx * 16, 40 + idx * 16], [0, 1]);
                            return (
                                <CollabCursor
                                    key={p.name}
                                    x={pos.x}
                                    y={pos.y}
                                    name={p.name}
                                    variant={p.variant}
                                    opacity={opacity}
                                />
                            );
                        })}
                        {/* "Edits saved" pill in the top-bar area, pulses */}
                        <div
                            style={{
                                position: 'absolute',
                                top: 90,
                                right: 100,
                                opacity:
                                    frame >= SAVED_PILL_FROM
                                        ? 0.65 + Math.sin((frame - SAVED_PILL_FROM) / 18) * 0.35
                                        : 0,
                                pointerEvents: 'none',
                            }}
                        >
                            <div
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '5px 11px',
                                    borderRadius: 999,
                                    background: 'rgba(34,197,94,0.16)',
                                    border: '1px solid rgba(34,197,94,0.4)',
                                    color: '#22c55e',
                                    fontSize: 11,
                                    fontWeight: 500,
                                    fontFamily: fontStack,
                                    letterSpacing: 0.1,
                                }}
                            >
                                <div
                                    style={{
                                        width: 5,
                                        height: 5,
                                        borderRadius: 999,
                                        background: '#22c55e',
                                    }}
                                />
                                Edits saved
                            </div>
                        </div>
                    </>
                }
            />
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
                    text="Build it together."
                    enter={20}
                    exit={400}
                    style="display"
                    align="left"
                    weight={500}
                />
            </div>
        </AbsoluteFill>
    );
};
