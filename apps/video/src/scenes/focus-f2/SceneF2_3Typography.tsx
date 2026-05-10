import React from 'react';
import { ChevronDown } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { cursorAt, cursorTip, moveToClick } from '../../utils/cursor';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * F2.3 — Typography control. A floating font-size dropdown is open;
 * the user picks `48` to `40`, the H1 visibly shrinks. Then closes.
 */
const DROPDOWN_TARGET = { x: 1080, y: 184 };
const VALUE_TARGET = { x: 1080, y: 244 };

const FontSizeDropdown: React.FC<{ open: boolean; selected: number }> = ({ open, selected }) => (
    <div
        style={{
            display: 'flex',
            flexDirection: 'column',
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            fontFamily: fontStack,
            color: palette.textSecondary,
            fontSize: 12,
            overflow: 'hidden',
        }}
    >
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                color: palette.textPrimary,
            }}
        >
            <span style={{ fontWeight: 500 }}>Font size</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: palette.textMuted }}>{selected}</span>
            <ChevronDown size={12} strokeWidth={1.6} />
        </div>
        {open && (
            <div
                style={{
                    borderTop: `1px solid ${palette.border}`,
                    padding: 6,
                    minWidth: 120,
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {[56, 48, 40, 32].map((sz) => (
                    <div
                        key={sz}
                        style={{
                            padding: '6px 10px',
                            borderRadius: 5,
                            background: sz === selected ? 'rgba(0,129,222,0.18)' : 'transparent',
                            color: sz === selected ? palette.blueSoft : palette.textSecondary,
                        }}
                    >
                        {sz}px
                    </div>
                ))}
            </div>
        )}
    </div>
);

export const SceneF2_3Typography: React.FC = () => {
    const frame = useCurrentFrame();
    const OPEN_FRAME = 60;
    const PICK_FRAME = 220;

    const cursor = cursorAt(frame, [
        moveToClick({ x: 900, y: 600 }, DROPDOWN_TARGET, OPEN_FRAME, 22),
        moveToClick(
            { x: DROPDOWN_TARGET.x - 3, y: DROPDOWN_TARGET.y - 2 },
            VALUE_TARGET,
            PICK_FRAME,
            18,
        ),
    ]);
    const tip = cursorTip(cursor);

    const open = frame >= OPEN_FRAME && frame < PICK_FRAME + 30;
    const selected = frame >= PICK_FRAME ? 40 : 56;
    // H1 size animates from 56 → 40 just after PICK_FRAME.
    const fontSize = interp(frame, [PICK_FRAME, PICK_FRAME + 16], [56, selected]);

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
                                gap: 24,
                                padding: '0 60px',
                                fontFamily: fontStack,
                            }}
                        >
                            <div
                                style={{
                                    fontSize,
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
                                    fontSize: 17,
                                    color: '#525252',
                                    maxWidth: 540,
                                    textAlign: 'center',
                                }}
                            >
                                Design, write, and ship a site without juggling tools.
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
                                left: 1020,
                                pointerEvents: 'none',
                            }}
                        >
                            <FontSizeDropdown open={open} selected={selected} />
                        </div>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={OPEN_FRAME} x={tip.x} y={tip.y} />
                        <ClickRipple at={PICK_FRAME} x={VALUE_TARGET.x} y={VALUE_TARGET.y} />
                    </>
                }
            />
        </AbsoluteFill>
    );
};
