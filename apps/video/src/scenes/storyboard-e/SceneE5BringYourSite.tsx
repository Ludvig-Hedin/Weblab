import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import type { Point } from '../../utils/paths';
import { CanvasMock } from '../../components/CanvasMock';
import { CollabCursor } from '../../components/CollabCursor';
import { PublishCard } from '../../components/PublishCard';
import { TextOverlay } from '../../components/TextOverlay';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cubicBezier } from '../../utils/paths';
import { interp } from '../../utils/timing';
import { palette } from '../../utils/tokens';

const collabA: readonly [Point, Point, Point, Point] = [
    { x: 220, y: 700 },
    { x: 320, y: 640 },
    { x: 380, y: 760 },
    { x: 460, y: 700 },
];
const collabB: readonly [Point, Point, Point, Point] = [
    { x: 540, y: 760 },
    { x: 470, y: 690 },
    { x: 360, y: 800 },
    { x: 300, y: 740 },
];

/**
 * Beat 5 — 1200 frames. PublishCard with globe + URL types in. Two
 * CollabCursors drift across a small canvas inset, anchored bottom-left.
 */
export const SceneE5BringYourSite: React.FC = () => {
    const frame = useCurrentFrame();

    const introFade = interp(frame, [0, 60], [0, 1]);
    const outroFade = interp(frame, [1140, 1200], [1, 0]);

    // Publish card centered, settles slowly.
    const cardOpacity = interp(frame, [120, 240], [0, 1]);
    const cardLift = interp(frame, [120, 240], [16, 0]);
    const urlProgress = interp(frame, [260, 460], [0, 1]);
    const pulse = interp(frame, [380, 1100], [0, 1]);

    // Small canvas inset bottom-left.
    const insetOpacity = interp(frame, [200, 320], [0, 1]);

    // Collab cursor drifts.
    const tA = interp(frame, [240, 1100], [0, 1]);
    const tB = interp(frame, [320, 1100], [0, 1]);
    const a = cubicBezier(collabA[0], collabA[1], collabA[2], collabA[3], tA);
    const b = cubicBezier(collabB[0], collabB[1], collabB[2], collabB[3], tB);
    const opacityA = interp(frame, [240, 320], [0, 1]);
    const opacityB = interp(frame, [320, 400], [0, 1]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                opacity: introFade * outroFade,
            }}
        >
            {/* Publish card hero */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <div
                    style={{
                        opacity: cardOpacity,
                        transform: `translateY(${cardLift}px)`,
                    }}
                >
                    <PublishCard urlProgress={urlProgress} pulse={pulse} />
                </div>
            </div>

            {/* Small canvas inset bottom-left, with two collab cursors. */}
            <div
                style={{
                    position: 'absolute',
                    left: 100,
                    bottom: 100,
                    width: 480,
                    height: 280,
                    opacity: insetOpacity,
                }}
            >
                <CanvasMock breakpoint="desktop" frameLabel="Live preview">
                    <WebsiteContent variant="softened" />
                </CanvasMock>
            </div>

            <CollabCursor x={a.x} y={a.y} name="Lina" variant="blue" opacity={opacityA} />
            <CollabCursor x={b.x} y={b.y} name="Sam" variant="purple" opacity={opacityB} />

            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    paddingTop: 140,
                }}
            >
                <div style={{ width: 1280 }}>
                    <TextOverlay
                        text="Bring your site. Design together. Publish with Weblab."
                        enter={40}
                        exit={1080}
                        style="display"
                    />
                </div>
            </div>
        </AbsoluteFill>
    );
};
