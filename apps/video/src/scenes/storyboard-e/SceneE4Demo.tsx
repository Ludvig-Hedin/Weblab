import React from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';

import type { CanvasBreakpoint } from '../../components/CanvasMock';
import type { ChatMessage } from '../../components/RightPanelChatMock';
import { CanvasMock } from '../../components/CanvasMock';
import { ClickRipple } from '../../components/ClickRipple';
import { ComponentLibraryDrawer } from '../../components/ComponentLibraryDrawer';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { SyncPill } from '../../components/SyncPill';
import { TextOverlay } from '../../components/TextOverlay';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cursorAt, cursorTip, drift, moveToClick } from '../../utils/cursor';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

const CLIP = 300;

// Cross-clip helpers
const clipFade = (frame: number) => {
    const intro = interp(frame, [0, 24], [0, 1]);
    const outro = interp(frame, [CLIP - 24, CLIP], [1, 0]);
    return Math.min(intro, outro);
};

// ── Clip 1: AI chat updates the canvas ──────────────────────────────────
const chatMessages: ChatMessage[] = [
    {
        role: 'user',
        text: 'Soften the hero, please.',
        startFrame: 60,
        typedThroughFrame: 160,
    },
    {
        role: 'ai',
        text: 'Done — softer headline weight and a calmer accent.',
        startFrame: 200,
        typedThroughFrame: 280,
    },
];

const ClipChat: React.FC = () => {
    const frame = useCurrentFrame();
    const op = clipFade(frame);
    const variant = frame >= 280 ? 'softened' : 'default';
    return (
        <AbsoluteFill style={{ background: palette.background, opacity: op }}>
            <EditorScene
                activeTab="layers"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <WebsiteContent
                            variant={variant}
                            selection={frame >= 60 && frame < 200 ? 'h1' : 'none'}
                        />
                    </CanvasMock>
                }
                rightPanel={
                    <RightPanelChatMock
                        messages={chatMessages}
                        currentFrame={frame}
                        aiTypingUntilFrame={200}
                    />
                }
            />
        </AbsoluteFill>
    );
};

// ── Clip 2: cursor selects an element on the canvas ─────────────────────
const ClipCanvasSelect: React.FC = () => {
    const frame = useCurrentFrame();
    const op = clipFade(frame);

    const CLICK = 100;
    const cursor = cursorAt(frame, [
        moveToClick({ x: 1300, y: 540 }, { x: 960, y: 380 }, CLICK, 50),
        drift({ x: 957, y: 378 }, { x: 920, y: 420 }, CLICK + 30, CLIP),
    ]);
    const tip = cursorTip(cursor);
    const selection = frame >= CLICK ? 'h1' : 'none';

    return (
        <AbsoluteFill style={{ background: palette.background, opacity: op }}>
            <EditorScene
                activeTab="layers"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <WebsiteContent variant="softened" selection={selection} />
                    </CanvasMock>
                }
                rightPanel={<RightPanelChatMock messages={[]} currentFrame={frame} />}
                showEditorBar={frame >= CLICK + 4}
                overlay={
                    <>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={CLICK} x={tip.x} y={tip.y} />
                    </>
                }
            />
        </AbsoluteFill>
    );
};

// ── Clip 3: drag a component from the drawer ────────────────────────────
const ClipComponent: React.FC = () => {
    const frame = useCurrentFrame();
    const op = clipFade(frame);
    const drawer = interp(frame, [10, 80], [0, 1]);

    const CLICK = 160;
    const cursor = cursorAt(frame, [
        moveToClick({ x: 1300, y: 540 }, { x: 1080, y: 880 }, CLICK, 50),
    ]);
    const tip = cursorTip(cursor);
    const installed = frame >= CLICK + 8;

    return (
        <AbsoluteFill style={{ background: palette.background, opacity: op }}>
            <EditorScene
                activeTab="components"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <WebsiteContent variant={installed ? 'features' : 'softened'} />
                        <ComponentLibraryDrawer
                            progress={drawer}
                            highlightIndex={frame >= CLICK - 24 ? 2 : undefined}
                        />
                    </CanvasMock>
                }
                rightPanel={<RightPanelChatMock messages={[]} currentFrame={frame} />}
                overlay={
                    <>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={CLICK} x={tip.x} y={tip.y} />
                    </>
                }
            />
        </AbsoluteFill>
    );
};

// ── Clip 4: breakpoint snap ─────────────────────────────────────────────
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

const ClipBreakpoint: React.FC = () => {
    const frame = useCurrentFrame();
    const op = clipFade(frame);

    const TABLET_CLICK = 80;
    const MOBILE_CLICK = 200;

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1180, y: 540 }, { x: 980, y: 168 }, TABLET_CLICK, 40),
        moveToClick({ x: 977, y: 166 }, { x: 1015, y: 168 }, MOBILE_CLICK, 40),
    ]);
    const tip = cursorTip(cursor);

    let idx = 0;
    let bp: CanvasBreakpoint = 'desktop';
    let width = 1280;
    if (frame >= TABLET_CLICK + 4 && frame < MOBILE_CLICK + 4) {
        idx = 1;
        bp = 'tablet';
        const t = Math.min(1, (frame - (TABLET_CLICK + 4)) / 30);
        width = 1280 - 460 * t;
    } else if (frame >= MOBILE_CLICK + 4) {
        idx = 2;
        bp = 'mobile';
        const t = Math.min(1, (frame - (MOBILE_CLICK + 4)) / 30);
        width = 820 - 430 * t;
    }

    return (
        <AbsoluteFill style={{ background: palette.background, opacity: op }}>
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
        </AbsoluteFill>
    );
};

// ── Clip 5: sync pill ───────────────────────────────────────────────────
const ClipSync: React.FC = () => {
    const frame = useCurrentFrame();
    const op = clipFade(frame);
    const pillIn = interp(frame, [20, 80], [0, 1]);
    const pillLift = interp(frame, [20, 80], [12, 0]);
    const pulse = interp(frame, [40, CLIP], [0, 2]);

    return (
        <AbsoluteFill style={{ background: palette.background, opacity: op }}>
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
            />
            <div
                style={{
                    position: 'absolute',
                    top: 200,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    opacity: pillIn,
                    transform: `translateY(${pillLift}px)`,
                    pointerEvents: 'none',
                }}
            >
                <SyncPill pulse={pulse} label="Synced" />
            </div>
        </AbsoluteFill>
    );
};

export const SceneE4Demo: React.FC = () => {
    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <Sequence from={0} durationInFrames={CLIP}>
                <ClipChat />
            </Sequence>
            <Sequence from={CLIP} durationInFrames={CLIP}>
                <ClipCanvasSelect />
            </Sequence>
            <Sequence from={CLIP * 2} durationInFrames={CLIP}>
                <ClipComponent />
            </Sequence>
            <Sequence from={CLIP * 3} durationInFrames={CLIP}>
                <ClipBreakpoint />
            </Sequence>
            <Sequence from={CLIP * 4} durationInFrames={CLIP}>
                <ClipSync />
            </Sequence>
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    paddingBottom: 110,
                    pointerEvents: 'none',
                }}
            >
                <div style={{ width: 1100 }}>
                    <TextOverlay
                        text="Design with AI. Stay in control."
                        enter={20}
                        exit={CLIP * 5 - 60}
                        style="display"
                        weight={500}
                    />
                </div>
            </div>
        </AbsoluteFill>
    );
};
