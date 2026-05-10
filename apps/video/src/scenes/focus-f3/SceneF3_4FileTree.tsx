import React from 'react';
import { ArrowRight, FileCode2, FileText, FolderClosed, FolderOpen } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { TextOverlay } from '../../components/TextOverlay';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * F3.4 — File tree appearing as the project is imported. Lines reveal
 * one-by-one with a brand-blue accent line on the right showing
 * progress.
 */
const lines: { Icon: typeof FolderOpen; name: string; depth: number; tone: string }[] = [
    { Icon: FolderOpen, name: 'src', depth: 0, tone: palette.textSecondary },
    { Icon: FolderOpen, name: 'app', depth: 1, tone: palette.textSecondary },
    { Icon: FileCode2, name: 'page.tsx', depth: 2, tone: '#0081DE' },
    { Icon: FileCode2, name: 'layout.tsx', depth: 2, tone: '#0081DE' },
    { Icon: FolderClosed, name: 'components', depth: 1, tone: palette.textMuted },
    { Icon: FolderClosed, name: 'lib', depth: 1, tone: palette.textMuted },
    { Icon: FileText, name: 'package.json', depth: 0, tone: '#f59e0b' },
];

export const SceneF3_4FileTree: React.FC = () => {
    const frame = useCurrentFrame();
    const revealed = Math.floor(interp(frame, [10, 280], [0, lines.length + 1]));

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                fontFamily: fontStack,
                color: palette.textPrimary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 64,
                padding: '0 80px',
            }}
        >
            <div
                style={{
                    background: palette.surface,
                    border: `1px solid ${palette.border}`,
                    borderRadius: 14,
                    padding: 18,
                    width: 320,
                    boxShadow: '0 24px 60px -20px rgba(0,0,0,0.55)',
                }}
            >
                <div
                    style={{
                        fontSize: 11,
                        color: palette.textMuted,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        marginBottom: 12,
                        fontWeight: 500,
                    }}
                >
                    Your project
                </div>
                {lines.map((ln, i) => (
                    <div
                        key={ln.name}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            paddingLeft: ln.depth * 12,
                            paddingTop: 4,
                            paddingBottom: 4,
                            opacity: i < revealed ? 1 : 0,
                            transform: `translateX(${i < revealed ? 0 : -8}px)`,
                            fontSize: 13,
                            color: palette.textSecondary,
                        }}
                    >
                        <ln.Icon size={12} strokeWidth={1.7} color={ln.tone} />
                        <span>{ln.name}</span>
                    </div>
                ))}
            </div>

            <ArrowRight size={36} strokeWidth={1.5} color={palette.textMuted} />

            <div
                style={{
                    background: palette.surface,
                    border: '1px solid rgba(0,129,222,0.4)',
                    borderRadius: 14,
                    padding: 22,
                    width: 320,
                    boxShadow: '0 24px 60px -20px rgba(0,0,0,0.55)',
                }}
            >
                <div
                    style={{
                        fontSize: 11,
                        color: palette.textMuted,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        marginBottom: 12,
                        fontWeight: 500,
                    }}
                >
                    Imported
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            background: 'linear-gradient(135deg, #0081DE 0%, #920EFF 100%)',
                        }}
                    />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>site</div>
                        <div style={{ fontSize: 11, color: palette.textMuted }}>
                            Connected · live
                        </div>
                    </div>
                    <div
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: '#22c55e',
                        }}
                    />
                </div>
            </div>

            <div
                style={{
                    position: 'absolute',
                    left: 80,
                    top: 80,
                    width: 540,
                    pointerEvents: 'none',
                }}
            >
                <TextOverlay
                    text="Imported, ready to design."
                    enter={20}
                    exit={400}
                    style="display"
                    align="left"
                    weight={500}
                />
            </div>
        </AbsoluteFill>
    );
};
