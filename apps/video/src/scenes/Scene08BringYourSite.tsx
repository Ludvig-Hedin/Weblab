import React from 'react';
import { ArrowRight, FileCode2, FolderClosed, FolderOpen, GitBranch } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { TextOverlay } from '../components/TextOverlay';
import { interp } from '../utils/timing';
import { fontStack, palette } from '../utils/tokens';

const FileTreeMock: React.FC<{ revealed: number }> = ({ revealed }) => {
    const lines: { Icon: typeof FolderOpen; name: string; depth: number; tone: string }[] = [
        { Icon: FolderOpen, name: 'src', depth: 0, tone: palette.textSecondary },
        { Icon: FolderOpen, name: 'app', depth: 1, tone: palette.textSecondary },
        { Icon: FileCode2, name: 'page.tsx', depth: 2, tone: '#0081DE' },
        { Icon: FileCode2, name: 'layout.tsx', depth: 2, tone: '#0081DE' },
        { Icon: FolderClosed, name: 'components', depth: 1, tone: palette.textMuted },
        { Icon: FolderClosed, name: 'lib', depth: 1, tone: palette.textMuted },
        { Icon: FileCode2, name: 'package.json', depth: 0, tone: '#f59e0b' },
    ];
    return (
        <div
            style={{
                background: palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: 14,
                padding: 16,
                width: 280,
                fontFamily: fontStack,
                boxShadow: '0 24px 60px -20px rgba(0,0,0,0.55)',
            }}
        >
            <div
                style={{
                    fontSize: 11,
                    color: palette.textMuted,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    marginBottom: 10,
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
                        gap: 6,
                        paddingLeft: ln.depth * 12,
                        paddingTop: 3,
                        paddingBottom: 3,
                        opacity: i < revealed ? 1 : 0,
                        transform: `translateX(${i < revealed ? 0 : -6}px)`,
                        fontSize: 12,
                        color: palette.textSecondary,
                    }}
                >
                    <ln.Icon size={11} strokeWidth={1.7} color={ln.tone} />
                    <span>{ln.name}</span>
                </div>
            ))}
        </div>
    );
};

const SyncBadge: React.FC = () => (
    <div
        style={{
            background: palette.surface,
            border: '1px solid rgba(0,129,222,0.4)',
            borderRadius: 14,
            padding: 18,
            width: 280,
            fontFamily: fontStack,
            color: palette.textPrimary,
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
            Synced
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #0081DE 0%, #920EFF 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                }}
            >
                <GitBranch size={14} strokeWidth={1.8} />
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>main</div>
                <div style={{ fontSize: 11, color: palette.textMuted }}>weblab.build</div>
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
);

export const Scene08BringYourSite: React.FC = () => {
    const frame = useCurrentFrame();
    const revealed = Math.floor(interp(frame, [12, 130], [0, 8]));
    const arrowOpacity = interp(frame, [120, 180], [0, 1]);
    const badgeOpacity = interp(frame, [160, 220], [0, 1]);
    const badgeLift = interp(frame, [160, 220], [12, 0]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                fontFamily: fontStack,
                color: palette.textPrimary,
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 64,
                }}
            >
                <FileTreeMock revealed={revealed} />
                <div style={{ opacity: arrowOpacity, color: palette.textMuted }}>
                    <ArrowRight size={36} strokeWidth={1.5} />
                </div>
                <div
                    style={{
                        opacity: badgeOpacity,
                        transform: `translateY(${badgeLift}px)`,
                    }}
                >
                    <SyncBadge />
                </div>
            </div>
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    paddingBottom: 90,
                    pointerEvents: 'none',
                }}
            >
                <div style={{ width: 800 }}>
                    <TextOverlay
                        text="Bring your existing site."
                        enter={20}
                        exit={400}
                        style="display"
                        weight={500}
                    />
                </div>
            </div>
        </AbsoluteFill>
    );
};
