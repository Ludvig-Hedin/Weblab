import React from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { cursorAt, cursorTip, drift, moveToClick } from '../../utils/cursor';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * F3.3 — Connect Form. User types a project URL into the input,
 * clicks Connect. NOTE: form labels use "Project" not "Repository" /
 * "Repo".
 */
const URL_TEXT = 'github.com/team/site';
const CONNECT_BTN = { x: 1115, y: 660 };

export const SceneF3_3ConnectForm: React.FC = () => {
    const frame = useCurrentFrame();
    const typeStart = 60;
    const typeEnd = 320;
    const CLICK_FRAME = 420;

    const typeProgress = interp(frame, [typeStart, typeEnd], [0, 1]);
    const visibleChars = Math.floor(URL_TEXT.length * typeProgress);
    const visible = URL_TEXT.slice(0, visibleChars);
    const isTyping = frame >= typeStart && frame < typeEnd;

    // Cursor parks at field, then hops to Connect button.
    const cursor = cursorAt(frame, [
        drift({ x: 850, y: 540 }, { x: 870, y: 548 }, 0, typeEnd),
        moveToClick({ x: 870, y: 548 }, CONNECT_BTN, CLICK_FRAME, 22),
    ]);
    const tip = cursorTip(cursor);

    const connectingT = interp(frame, [CLICK_FRAME + 4, CLICK_FRAME + 60], [0, 1]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                fontFamily: fontStack,
                position: 'relative',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: palette.surface,
                    border: `1px solid ${palette.border}`,
                    borderRadius: 16,
                    padding: 28,
                    width: 540,
                    boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
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
                    Connect Project
                </div>
                <div style={{ fontSize: 13, color: palette.textMuted, marginBottom: 18 }}>
                    Paste your project URL to import.
                </div>

                <label
                    style={{
                        fontSize: 11,
                        color: palette.textMuted,
                        letterSpacing: 0.4,
                        textTransform: 'uppercase',
                        fontWeight: 500,
                        marginBottom: 6,
                        display: 'block',
                    }}
                >
                    Project URL
                </label>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: `1px solid ${
                            visible.length > 0 ? palette.borderTabActive : palette.border
                        }`,
                        background: palette.background,
                        marginBottom: 18,
                    }}
                >
                    <LinkIcon size={14} strokeWidth={1.7} color={palette.textMuted} />
                    <span
                        style={{
                            fontSize: 13.5,
                            color: visible.length > 0 ? palette.textPrimary : palette.textMuted,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                    >
                        {visible.length > 0 ? visible : 'github.com/your/site'}
                        {isTyping && (
                            <span
                                style={{
                                    display: 'inline-block',
                                    width: 1.5,
                                    height: 13,
                                    background: palette.textPrimary,
                                    marginLeft: 2,
                                    verticalAlign: 'middle',
                                    opacity: Math.floor(frame / 12) % 2 === 0 ? 1 : 0,
                                }}
                            />
                        )}
                    </span>
                </div>

                <label
                    style={{
                        fontSize: 11,
                        color: palette.textMuted,
                        letterSpacing: 0.4,
                        textTransform: 'uppercase',
                        fontWeight: 500,
                        marginBottom: 6,
                        display: 'block',
                    }}
                >
                    Project Name
                </label>
                <div
                    style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: `1px solid ${palette.border}`,
                        background: palette.background,
                        marginBottom: 22,
                        fontSize: 13.5,
                        color: palette.textMuted,
                    }}
                >
                    site
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <div
                        style={{
                            padding: '10px 18px',
                            borderRadius: 10,
                            border: `1px solid ${palette.border}`,
                            color: palette.textSecondary,
                            fontSize: 13,
                            fontWeight: 500,
                        }}
                    >
                        Cancel
                    </div>
                    <div
                        style={{
                            padding: '10px 18px',
                            borderRadius: 10,
                            background:
                                connectingT > 0
                                    ? `rgba(0,129,222,${0.6 + 0.4 * (1 - connectingT)})`
                                    : palette.blue,
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 500,
                        }}
                    >
                        {connectingT > 0.5 ? 'Connecting…' : 'Connect'}
                    </div>
                </div>
            </div>

            <Cursor x={cursor.x} y={cursor.y} />
            <ClickRipple at={CLICK_FRAME} x={tip.x} y={tip.y} />
        </AbsoluteFill>
    );
};
