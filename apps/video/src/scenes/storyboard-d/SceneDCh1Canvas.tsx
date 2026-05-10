import React from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import type { CanvasBreakpoint } from '../../components/CanvasMock';
import { CanvasMock } from '../../components/CanvasMock';
import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { TextOverlay } from '../../components/TextOverlay';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cursorAt, cursorTip, moveToClick } from '../../utils/cursor';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

const InlineBreakpointPill: React.FC<{ activeIdx: number }> = ({ activeIdx }) => (
    <div
        style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0,
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
                        width: 28,
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 5,
                        background: active ? 'rgba(0,129,222,0.22)' : 'transparent',
                        color: active ? palette.blueSoft : palette.textMuted,
                    }}
                >
                    <Icon size={12} strokeWidth={1.7} />
                </div>
            );
        })}
    </div>
);

const ChapterCounter: React.FC<{ index: number; total: number; opacity: number }> = ({
    index,
    total,
    opacity,
}) => (
    <div
        style={{
            position: 'absolute',
            top: 48,
            right: 60,
            fontFamily: fontStack,
            fontSize: 12,
            letterSpacing: 1.2,
            color: palette.textMuted,
            opacity,
            fontVariantNumeric: 'tabular-nums',
        }}
    >
        {index}/{total}
    </div>
);

// Cycle desktop -> tablet -> mobile across the 900-frame chapter.
const TABLET_CLICK = 300;
const MOBILE_CLICK = 600;

const breakpointAt = (frame: number): { idx: number; bp: CanvasBreakpoint; width: number } => {
    if (frame < TABLET_CLICK + 4) return { idx: 0, bp: 'desktop', width: 1280 };
    if (frame < MOBILE_CLICK + 4) {
        const t = Math.min(1, (frame - (TABLET_CLICK + 4)) / 30);
        return { idx: 1, bp: 'tablet', width: 1280 - 460 * t };
    }
    const t = Math.min(1, (frame - (MOBILE_CLICK + 4)) / 30);
    return { idx: 2, bp: 'mobile', width: 820 - 430 * t };
};

// Pill positions in viewport (centered above the canvas).
const PILL_BUTTONS = [
    { x: 945, y: 148 },
    { x: 980, y: 148 },
    { x: 1015, y: 148 },
];

export const SceneDCh1Canvas: React.FC = () => {
    const frame = useCurrentFrame();
    const counterOpacity = interp(frame, [10, 50], [0, 1]);

    const { idx, bp, width } = breakpointAt(frame);

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1180, y: 540 }, PILL_BUTTONS[1]!, TABLET_CLICK, 60),
        moveToClick(
            { x: PILL_BUTTONS[1]!.x - 3, y: PILL_BUTTONS[1]!.y - 2 },
            PILL_BUTTONS[2]!,
            MOBILE_CLICK,
            40,
        ),
    ]);
    const tip = cursorTip(cursor);

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
                                top: 16,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                zIndex: 5,
                            }}
                        >
                            <InlineBreakpointPill activeIdx={idx} />
                        </div>
                        <CanvasMock breakpoint={bp} frameWidth={width} showBreakpointPill={false}>
                            <WebsiteContent />
                        </CanvasMock>
                    </div>
                }
                rightPanel={<RightPanelChatMock messages={[]} currentFrame={frame} />}
                overlay={
                    <>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={TABLET_CLICK} x={tip.x} y={tip.y} />
                        <ClickRipple at={MOBILE_CLICK} x={tip.x} y={tip.y} />
                    </>
                }
            />

            <ChapterCounter index={1} total={5} opacity={counterOpacity} />

            <div
                style={{
                    position: 'absolute',
                    left: 80,
                    bottom: 80,
                    width: 900,
                    pointerEvents: 'none',
                }}
            >
                <TextOverlay
                    text="1. The visual canvas."
                    enter={20}
                    exit={240}
                    style="display"
                    align="left"
                    weight={500}
                />
            </div>
        </AbsoluteFill>
    );
};
