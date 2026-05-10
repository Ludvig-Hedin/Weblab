import React from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cursorAt, cursorTip, moveToClick } from '../../utils/cursor';
import { fontStack, palette } from '../../utils/tokens';

const BreakpointPill: React.FC<{ activeIdx: number }> = ({ activeIdx }) => (
    <div
        style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: 3,
            borderRadius: 8,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            fontFamily: fontStack,
        }}
    >
        {[Monitor, Tablet, Smartphone].map((Icon, i) => {
            const active = i === activeIdx;
            return (
                <div
                    key={i}
                    style={{
                        width: 32,
                        height: 26,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 5,
                        background: active ? 'rgba(0,129,222,0.22)' : 'transparent',
                        color: active ? palette.blueSoft : palette.textMuted,
                    }}
                >
                    <Icon size={13} strokeWidth={1.7} />
                </div>
            );
        })}
    </div>
);

// Tablet pill click target
const TABLET_TARGET = { x: 988, y: 152 };

export const SceneF2_5Breakpoints: React.FC = () => {
    const frame = useCurrentFrame();
    const CLICK_FRAME = 80;

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1100, y: 700 }, TABLET_TARGET, CLICK_FRAME, 24),
    ]);
    const tip = cursorTip(cursor);

    const isTablet = frame >= CLICK_FRAME + 4;
    const frameWidth = isTablet
        ? Math.max(820, 1280 - ((frame - (CLICK_FRAME + 4)) / 24) * 460)
        : 1280;

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <EditorScene
                activeTab="layers"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                        <div
                            style={{
                                position: 'absolute',
                                top: 14,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                zIndex: 5,
                            }}
                        >
                            <BreakpointPill activeIdx={isTablet ? 1 : 0} />
                        </div>
                        <CanvasMock
                            breakpoint={isTablet ? 'tablet' : 'desktop'}
                            frameWidth={frameWidth}
                            showBreakpointPill={false}
                        >
                            <WebsiteContent />
                        </CanvasMock>
                    </div>
                }
                rightPanelWidth={0}
                overlay={
                    <>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={CLICK_FRAME} x={tip.x} y={tip.y} />
                    </>
                }
            />
        </AbsoluteFill>
    );
};
