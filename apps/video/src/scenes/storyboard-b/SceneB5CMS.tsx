import type { LucideIcon } from 'lucide-react';
import React from 'react';
import { Database, FileText, Hash, Image as ImageIcon, Link as LinkIcon, Type } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { TextOverlay } from '../../components/TextOverlay';
import { cursorAt, cursorTip, moveToClick } from '../../utils/cursor';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

interface FieldSpec {
    label: string;
    Icon: LucideIcon;
    type: string;
    bound?: boolean;
}

const fields: FieldSpec[] = [
    { label: 'Title', Icon: Type, type: 'Text' },
    { label: 'Body', Icon: FileText, type: 'Rich text' },
    { label: 'Image', Icon: ImageIcon, type: 'Asset' },
    { label: 'Slug', Icon: Hash, type: 'Text' },
];

/**
 * Scene B5 — Connect your content.
 *
 * A clearer, less abstract version: shows a two-column "bind" panel like
 * the real CMS workspace — collection fields on the left, target component
 * properties on the right, with a connector line drawn between them.
 */
const TITLE_FIELD = { x: 660, y: 470 };
const TITLE_TARGET = { x: 1280, y: 470 };

export const SceneB5CMS: React.FC = () => {
    const frame = useCurrentFrame();

    const CLICK_TITLE = 120;
    const CLICK_HEADING = 280;

    const cursor = cursorAt(frame, [
        moveToClick({ x: 600, y: 700 }, TITLE_FIELD, CLICK_TITLE, 60),
        moveToClick(
            { x: TITLE_FIELD.x - 3, y: TITLE_FIELD.y - 2 },
            TITLE_TARGET,
            CLICK_HEADING,
            80,
        ),
    ]);
    const tip = cursorTip(cursor);

    // Connector line draws from Title field to Heading target after first click.
    const lineProgress = interp(frame, [CLICK_TITLE + 8, CLICK_HEADING - 4], [0, 1]);
    const titleSelected = frame >= CLICK_TITLE - 4 && frame < CLICK_HEADING + 30;
    const headingBound = frame >= CLICK_HEADING + 4;

    return (
        <AbsoluteFill style={{ background: palette.background, fontFamily: fontStack }}>
            {/* Title up top */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    paddingTop: 80,
                    pointerEvents: 'none',
                }}
            >
                <div style={{ width: 900 }}>
                    <TextOverlay
                        text="Connect your content."
                        enter={20}
                        exit={840}
                        style="display"
                        weight={500}
                    />
                </div>
            </div>

            {/* Two cards centered */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 220,
                }}
            >
                {/* Left: CMS collection */}
                <div
                    style={{
                        background: palette.surface,
                        border: `1px solid ${palette.border}`,
                        borderRadius: 14,
                        width: 320,
                        padding: 18,
                        boxShadow: '0 24px 60px -20px rgba(0,0,0,0.5)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 14,
                        }}
                    >
                        <div
                            style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                background: 'linear-gradient(135deg, #0081DE 0%, #920EFF 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                            }}
                        >
                            <Database size={13} strokeWidth={1.7} />
                        </div>
                        <div>
                            <div
                                style={{
                                    fontSize: 13,
                                    color: palette.textPrimary,
                                    fontWeight: 500,
                                }}
                            >
                                Posts
                            </div>
                            <div style={{ fontSize: 10.5, color: palette.textMuted }}>
                                Collection
                            </div>
                        </div>
                    </div>
                    {fields.map((f) => {
                        const isTitle = f.label === 'Title';
                        const selected = isTitle && titleSelected;
                        return (
                            <div
                                key={f.label}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    background: selected ? 'rgba(0,129,222,0.16)' : 'transparent',
                                    border: selected
                                        ? '1px solid rgba(0,129,222,0.5)'
                                        : '1px solid transparent',
                                    color: selected ? palette.textPrimary : palette.textSecondary,
                                    fontSize: 12.5,
                                    marginTop: 4,
                                }}
                            >
                                <f.Icon
                                    size={12}
                                    strokeWidth={1.6}
                                    color={selected ? palette.blueSoft : palette.textMuted}
                                />
                                {f.label}
                                <div style={{ flex: 1 }} />
                                <span style={{ color: palette.textMuted, fontSize: 11 }}>
                                    {f.type}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Right: component card */}
                <div
                    style={{
                        background: palette.surface,
                        border: `1px solid ${palette.border}`,
                        borderRadius: 14,
                        width: 320,
                        padding: 22,
                        boxShadow: '0 24px 60px -20px rgba(0,0,0,0.5)',
                    }}
                >
                    <div
                        style={{
                            fontSize: 10.5,
                            color: palette.textMuted,
                            letterSpacing: 0.6,
                            textTransform: 'uppercase',
                            fontWeight: 500,
                            marginBottom: 12,
                        }}
                    >
                        Component
                    </div>
                    <div
                        style={{
                            position: 'relative',
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: headingBound
                                ? '1px solid rgba(0,129,222,0.5)'
                                : `1px solid ${palette.border}`,
                            background: headingBound ? 'rgba(0,129,222,0.10)' : 'transparent',
                        }}
                    >
                        <div style={{ fontSize: 11, color: palette.textMuted, marginBottom: 4 }}>
                            Heading
                        </div>
                        <div
                            style={{
                                fontSize: 14,
                                color: palette.textPrimary,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontWeight: 500,
                            }}
                        >
                            {headingBound ? (
                                <>
                                    <LinkIcon
                                        size={11}
                                        strokeWidth={1.8}
                                        color={palette.blueSoft}
                                    />
                                    Posts.Title
                                </>
                            ) : (
                                <span style={{ color: palette.textMuted }}>Untitled</span>
                            )}
                        </div>
                    </div>
                    <div
                        style={{
                            marginTop: 8,
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: `1px solid ${palette.border}`,
                            color: palette.textMuted,
                            fontSize: 12,
                        }}
                    >
                        Body
                    </div>
                    <div
                        style={{
                            marginTop: 8,
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: `1px solid ${palette.border}`,
                            color: palette.textMuted,
                            fontSize: 12,
                        }}
                    >
                        Cover image
                    </div>
                </div>
            </div>

            {/* Connector line */}
            <svg
                style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                }}
            >
                <path
                    d={`M ${TITLE_FIELD.x} ${TITLE_FIELD.y} C ${
                        (TITLE_FIELD.x + TITLE_TARGET.x) / 2
                    } ${TITLE_FIELD.y - 60}, ${
                        (TITLE_FIELD.x + TITLE_TARGET.x) / 2
                    } ${TITLE_TARGET.y - 60}, ${TITLE_TARGET.x} ${TITLE_TARGET.y}`}
                    stroke={palette.blueSoft}
                    strokeWidth={1.5}
                    fill="none"
                    strokeDasharray="800"
                    strokeDashoffset={(1 - lineProgress) * 800}
                    opacity={0.7}
                />
            </svg>

            <Cursor x={cursor.x} y={cursor.y} />
            <ClickRipple at={CLICK_TITLE} x={tip.x} y={tip.y} />
            <ClickRipple at={CLICK_HEADING} x={tip.x} y={tip.y} />
        </AbsoluteFill>
    );
};
