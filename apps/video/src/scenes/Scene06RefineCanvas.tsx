import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { CanvasMock } from '../components/CanvasMock';
import { ClickRipple } from '../components/ClickRipple';
import { Cursor } from '../components/Cursor';
import { EditorScene } from '../components/EditorScene';
import { LeftPanelMock } from '../components/LeftPanelMock';
import { RightPanelChatMock } from '../components/RightPanelChatMock';
import { TextOverlay } from '../components/TextOverlay';
import { cursorAt, cursorTip, moveToClick } from '../utils/cursor';
import { fontStack, palette } from '../utils/tokens';

/**
 * Class chip that shifts from `text-base` → `text-sm` mid-scene to show the
 * editor bar reflecting the user's inline edit.
 */
const EditorBarChip: React.FC<{ swap: boolean }> = ({ swap }) => (
    <div
        style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 10,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            fontFamily: fontStack,
        }}
    >
        <div
            style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                background: palette.surfaceActive,
            }}
        />
        <div
            style={{
                fontSize: 11,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                padding: '2px 8px',
                borderRadius: 5,
                background: 'rgba(0,129,222,0.18)',
                color: palette.blueSoft,
            }}
        >
            {swap ? 'text-sm' : 'text-base'}
        </div>
        <div style={{ width: 1, height: 14, background: palette.border }} />
        <div
            style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                background: '#0a0a0a',
                border: `1px solid ${palette.border}`,
            }}
        />
    </div>
);

/**
 * Inline-editable hero. Shows the original subtitle, then on `editStart`
 * a caret appears on the subtitle; from `editStart..editEnd` the text
 * morphs character-by-character from `before` → `after`.
 */
const HeroEditable: React.FC<{
    selection: 'h1' | 'subhead' | 'none';
    before: string;
    after: string;
    editStart: number;
    editEnd: number;
    frame: number;
}> = ({ selection, before, after, editStart, editEnd, frame }) => {
    const editing = frame >= editStart && frame < editEnd;
    const done = frame >= editEnd;

    let displayed: string;
    if (frame < editStart) displayed = before;
    else if (done) displayed = after;
    else {
        const span = Math.max(1, editEnd - editStart);
        const t = (frame - editStart) / span;
        // Phase 1: delete `before` chars (first 50% of span).
        // Phase 2: type `after` chars (second 50%).
        if (t < 0.5) {
            const delT = t / 0.5;
            const remain = Math.max(0, before.length - Math.floor(before.length * delT));
            displayed = before.slice(0, remain);
        } else {
            const addT = (t - 0.5) / 0.5;
            displayed = after.slice(0, Math.floor(after.length * addT));
        }
    }

    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                background: '#ffffff',
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
                    position: 'relative',
                }}
            >
                {selection === 'h1' && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: '-6px -10px',
                            border: '1.5px solid #0081DE',
                            borderRadius: 6,
                        }}
                    />
                )}
                Tools to build calmly.
            </div>

            <div
                style={{
                    position: 'relative',
                    maxWidth: 540,
                    textAlign: 'center',
                }}
            >
                {selection === 'subhead' && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: '-4px -8px',
                            border: '1.5px solid #0081DE',
                            borderRadius: 6,
                        }}
                    />
                )}
                <span
                    style={{
                        fontSize: 17,
                        lineHeight: 1.55,
                        color: '#525252',
                        fontWeight: 400,
                    }}
                >
                    {displayed}
                </span>
                {(editing || (frame >= editStart - 8 && frame < editStart)) && (
                    <span
                        style={{
                            display: 'inline-block',
                            width: 1.5,
                            height: 16,
                            background: '#0a0a0a',
                            marginLeft: 2,
                            verticalAlign: 'middle',
                            opacity: Math.floor(frame / 12) % 2 === 0 ? 1 : 0,
                        }}
                    />
                )}
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: 10,
                    marginTop: 8,
                    fontSize: 13,
                    color: '#737373',
                }}
            >
                <span>Start building</span>
                <span>·</span>
                <span>Watch demo</span>
            </div>
        </div>
    );
};

// Subhead click target on the canvas. Frame coords in 1920×1080 viewport.
const SUBHEAD_TARGET = { x: 960, y: 560 };

export const Scene06RefineCanvas: React.FC = () => {
    const frame = useCurrentFrame();

    const CLICK_FRAME = 80;
    const cursor = cursorAt(frame, [
        moveToClick({ x: 1300, y: 700 }, SUBHEAD_TARGET, CLICK_FRAME, 24),
    ]);
    const tip = cursorTip(cursor);

    const editStart = CLICK_FRAME + 12;
    const editEnd = editStart + 96;

    return (
        <AbsoluteFill style={{ background: palette.background }}>
            <EditorScene
                activeTab="layers"
                projectName="northwind"
                leftPanel={<LeftPanelMock kind="layers" />}
                canvas={
                    <CanvasMock breakpoint="desktop">
                        <HeroEditable
                            selection={frame >= CLICK_FRAME ? 'subhead' : 'none'}
                            before="Design, write, and ship a site without juggling tools."
                            after="One canvas. Real components. Direct edits."
                            editStart={editStart}
                            editEnd={editEnd}
                            frame={frame}
                        />
                    </CanvasMock>
                }
                rightPanel={<RightPanelChatMock messages={[]} currentFrame={frame} />}
                overlay={
                    <>
                        <Cursor x={cursor.x} y={cursor.y} />
                        <ClickRipple at={CLICK_FRAME} x={tip.x} y={tip.y} />
                        <div
                            style={{
                                position: 'absolute',
                                top: 100,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                opacity: frame >= CLICK_FRAME + 4 ? 1 : 0,
                                transition: 'none',
                            }}
                        >
                            <EditorBarChip swap={frame >= editEnd} />
                        </div>
                    </>
                }
            />
            {/* Safe zone: bottom-right within 32% of width — keep narrow */}
            <div
                style={{
                    position: 'absolute',
                    right: 80,
                    bottom: 80,
                    width: 460,
                    pointerEvents: 'none',
                    textAlign: 'right',
                }}
            >
                <TextOverlay
                    text="Edit it yourself."
                    enter={20}
                    exit={460}
                    style="display"
                    align="right"
                    weight={500}
                />
            </div>
        </AbsoluteFill>
    );
};
