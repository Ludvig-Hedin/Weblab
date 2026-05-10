import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cursorAt, cursorTip, moveToClick } from '../../utils/cursor';
import { cubicBezier } from '../../utils/paths';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * F1.2 — Attach (0..360 scene-local). Right panel zooms 1.0 → 1.1 over
 * 18f. Cursor lands on the attach (paperclip) icon at frame 60. Click.
 * A small screenshot tile drags from the canvas into the composer along
 * a Bezier path and drops at frame 300. "Reference attached" badge
 * appears in composer at 330.
 */
const ATTACH_TARGET = { x: 1620, y: 970 };
const TILE_DROP = { x: 1660, y: 940 };

export const SceneF1_2Attach: React.FC = () => {
    const frame = useCurrentFrame();
    const CLICK_FRAME = 60;

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1100, y: 600 }, ATTACH_TARGET, CLICK_FRAME, 24),
    ]);
    const tip = cursorTip(cursor);

    // Tile travel: from inside the canvas (left of center) to composer.
    const tileStart = { x: 760, y: 420 };
    const tileMid = { x: 1240, y: 240 };
    const tileT = interp(frame, [120, 300], [0, 1]);
    const tilePos = cubicBezier(
        tileStart,
        { x: tileMid.x, y: tileMid.y },
        { x: TILE_DROP.x - 100, y: TILE_DROP.y - 80 },
        TILE_DROP,
        tileT,
    );
    const tileOpacity = interp(frame, [110, 130], [0, 0.95]) * (frame > 305 ? 0 : 1);

    // Subtle right-panel zoom highlight.
    const panelScale = interp(frame, [0, 18], [1, 1.06]);

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
                    <div
                        style={{
                            transform: `scale(${panelScale})`,
                            transformOrigin: 'center right',
                            width: '100%',
                            height: '100%',
                        }}
                    >
                        <RightPanelChatMock
                            messages={[]}
                            currentFrame={frame}
                            composerBadge={{ text: 'Reference attached', from: 320 }}
                        />
                    </div>
                }
                overlay={
                    <>
                        {tileOpacity > 0 && (
                            <div
                                style={{
                                    position: 'absolute',
                                    left: tilePos.x,
                                    top: tilePos.y,
                                    width: 110,
                                    height: 76,
                                    borderRadius: 8,
                                    background: palette.surface,
                                    border: `1px solid ${palette.border}`,
                                    boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: palette.textMuted,
                                    fontFamily: fontStack,
                                    opacity: tileOpacity,
                                    pointerEvents: 'none',
                                }}
                            >
                                <ImageIcon size={22} strokeWidth={1.6} />
                            </div>
                        )}
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={CLICK_FRAME} x={tip.x} y={tip.y} />
                    </>
                }
            />
        </AbsoluteFill>
    );
};
