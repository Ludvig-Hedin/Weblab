import React from 'react';
import { Plus } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { cursorAt, cursorTip, moveToClick } from '../../utils/cursor';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * F3.2 — Dialog. User clicks "New Project" button. A modal opens with
 * options.
 */
const NEW_PROJECT_BTN = { x: 960, y: 540 };

export const SceneF3_2Dialog: React.FC = () => {
    const frame = useCurrentFrame();
    const CLICK_FRAME = 80;

    const cursor = cursorAt(frame, [
        moveToClick({ x: 1100, y: 700 }, NEW_PROJECT_BTN, CLICK_FRAME, 24),
    ]);
    const tip = cursorTip(cursor);

    const dialogT = interp(frame, [CLICK_FRAME + 4, CLICK_FRAME + 32], [0, 1]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fontStack,
                position: 'relative',
            }}
        >
            {/* Initial big "New Project" CTA */}
            <div
                style={{
                    opacity: 1 - dialogT,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '14px 26px',
                    borderRadius: 12,
                    background: palette.blue,
                    color: '#fff',
                    fontSize: 16,
                    fontWeight: 500,
                    boxShadow: '0 12px 32px rgba(0,129,222,0.35)',
                }}
            >
                <Plus size={16} strokeWidth={2} />
                New Project
            </div>

            {/* Dialog appears */}
            <div
                style={{
                    opacity: dialogT,
                    transform: `translateY(${(1 - dialogT) * 12}px) translate(-50%, -50%)`,
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    background: palette.surface,
                    border: `1px solid ${palette.border}`,
                    borderRadius: 16,
                    padding: 28,
                    width: 540,
                    boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
                    fontFamily: fontStack,
                }}
            >
                <div
                    style={{
                        fontSize: 18,
                        fontWeight: 500,
                        color: palette.textPrimary,
                        marginBottom: 6,
                    }}
                >
                    New Project
                </div>
                <div style={{ fontSize: 13, color: palette.textMuted, marginBottom: 18 }}>
                    Start blank or import an existing site.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                        { label: 'Blank project', desc: 'Start from a template.' },
                        { label: 'Import existing', desc: 'Connect a project URL.', active: true },
                    ].map((opt) => (
                        <div
                            key={opt.label}
                            style={{
                                padding: '12px 14px',
                                borderRadius: 10,
                                border: `1px solid ${opt.active ? palette.blue : palette.border}`,
                                background: opt.active ? 'rgba(0,129,222,0.08)' : 'transparent',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 2,
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 13.5,
                                    color: palette.textPrimary,
                                    fontWeight: 500,
                                }}
                            >
                                {opt.label}
                            </div>
                            <div style={{ fontSize: 11.5, color: palette.textMuted }}>
                                {opt.desc}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <Cursor x={cursor.x} y={cursor.y} />
            <ClickRipple at={CLICK_FRAME} x={tip.x} y={tip.y} />
        </AbsoluteFill>
    );
};
