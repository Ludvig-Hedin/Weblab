import React from 'react';
import { ArrowRight } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { cursorAt, cursorTip, moveToClick } from '../../utils/cursor';
import { fontStack, palette } from '../../utils/tokens';

/**
 * F2.4 — Color control. User opens the color swatch picker, picks a
 * different swatch, primary CTA changes color.
 */
const SWATCH_OPEN = { x: 1130, y: 180 };
const SWATCH_PICK = { x: 1196, y: 256 };

const COLORS = ['#0a0a0a', '#0081DE', '#920EFF', '#22c55e', '#f59e0b'];

const ColorPicker: React.FC<{ open: boolean; pickedIdx: number }> = ({ open, pickedIdx }) => (
    <div
        style={{
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: 10,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            fontFamily: fontStack,
            color: palette.textSecondary,
            fontSize: 12,
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        }}
    >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
                style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: COLORS[pickedIdx],
                    border: `1px solid ${palette.border}`,
                }}
            />
            <span style={{ color: palette.textPrimary, fontWeight: 500 }}>Background</span>
        </div>
        {open && (
            <div style={{ display: 'flex', gap: 6 }}>
                {COLORS.map((c, i) => (
                    <div
                        key={c}
                        style={{
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            background: c,
                            border:
                                i === pickedIdx
                                    ? `2px solid ${palette.blueSoft}`
                                    : `1px solid ${palette.border}`,
                        }}
                    />
                ))}
            </div>
        )}
    </div>
);

export const SceneF2_4Color: React.FC = () => {
    const frame = useCurrentFrame();
    const OPEN_FRAME = 60;
    const PICK_FRAME = 240;

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1100, y: 600 }, SWATCH_OPEN, OPEN_FRAME, 22),
        moveToClick({ x: SWATCH_OPEN.x - 3, y: SWATCH_OPEN.y - 2 }, SWATCH_PICK, PICK_FRAME, 18),
    ]);
    const tip = cursorTip(cursor);

    const open = frame >= OPEN_FRAME && frame < PICK_FRAME + 36;
    const pickedIdx = frame >= PICK_FRAME ? 1 : 0; // 0=black, 1=blue
    const ctaColor = pickedIdx === 1 ? '#0081DE' : '#0a0a0a';

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
                                background: '#fff',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 22,
                                padding: '0 60px',
                                fontFamily: fontStack,
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 56,
                                    fontWeight: 600,
                                    color: '#0a0a0a',
                                    letterSpacing: -1.4,
                                    lineHeight: 1.05,
                                    maxWidth: 760,
                                    textAlign: 'center',
                                }}
                            >
                                Tools to build calmly.
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 10,
                                    marginTop: 4,
                                }}
                            >
                                <div
                                    style={{
                                        padding: '12px 22px',
                                        borderRadius: 10,
                                        background: ctaColor,
                                        color: '#fff',
                                        fontSize: 13.5,
                                        fontWeight: 500,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        transition: 'none',
                                    }}
                                >
                                    Start building <ArrowRight size={14} strokeWidth={2} />
                                </div>
                            </div>
                        </div>
                    </CanvasMock>
                }
                rightPanelWidth={0}
                overlay={
                    <>
                        <div
                            style={{
                                position: 'absolute',
                                top: 170,
                                left: 1080,
                                pointerEvents: 'none',
                            }}
                        >
                            <ColorPicker open={open} pickedIdx={pickedIdx} />
                        </div>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={OPEN_FRAME} x={tip.x} y={tip.y} />
                        <ClickRipple at={PICK_FRAME} x={SWATCH_PICK.x} y={SWATCH_PICK.y} />
                    </>
                }
            />
        </AbsoluteFill>
    );
};
