import React from 'react';
import { ChevronRight, FileCode2, GitBranch } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { TextOverlay } from '../components/TextOverlay';
import { interp } from '../utils/timing';
import { fontStack, palette } from '../utils/tokens';

const codeLines = [
    "import { Hero } from '@/components/hero';",
    '',
    'export default function Page() {',
    '  return (',
    '    <main>',
    '      <Hero',
    '        title="Tools to build calmly."',
    '        cta="Start building"',
    '      />',
    '    </main>',
    '  );',
    '}',
];

const lineColor = (i: number): string => {
    if (codeLines[i]?.trim().startsWith('import')) return '#920EFF';
    if (codeLines[i]?.trim().startsWith('export')) return '#0081DE';
    if (codeLines[i]?.trim().startsWith('return')) return '#22c55e';
    return palette.textSecondary;
};

const CodePane: React.FC<{ revealed: number }> = ({ revealed }) => (
    <div
        style={{
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: 12,
            padding: 18,
            width: 460,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            lineHeight: 1.6,
            color: palette.textPrimary,
            position: 'relative',
            boxShadow: '0 24px 60px -20px rgba(0,0,0,0.6)',
        }}
    >
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingBottom: 12,
                marginBottom: 10,
                borderBottom: `1px solid ${palette.border}`,
                fontFamily: fontStack,
                color: palette.textMuted,
                fontSize: 11.5,
            }}
        >
            <FileCode2 size={12} strokeWidth={1.7} color="#0081DE" />
            <span style={{ color: palette.textSecondary }}>app</span>
            <ChevronRight size={10} />
            <span style={{ color: palette.textSecondary }}>page.tsx</span>
        </div>
        {codeLines.map((ln, i) => {
            const opacity = i < revealed ? 1 : i === revealed ? 0.5 : 0.1;
            return (
                <div
                    key={i}
                    style={{
                        display: 'flex',
                        gap: 14,
                        opacity,
                        whiteSpace: 'pre',
                    }}
                >
                    <span
                        style={{
                            color: palette.textMuted,
                            width: 18,
                            textAlign: 'right',
                            flexShrink: 0,
                        }}
                    >
                        {i + 1}
                    </span>
                    <span style={{ color: lineColor(i) }}>{ln}</span>
                </div>
            );
        })}
    </div>
);

const SyncRow: React.FC<{ progress: number }> = ({ progress }) => {
    const dotPos = (progress: number, n: number) => {
        const t = (progress * 4 + n) % 1;
        return t * 100;
    };
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontFamily: fontStack,
                color: palette.textSecondary,
                fontSize: 13,
            }}
        >
            <div
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: 'rgba(0,129,222,0.14)',
                    border: '1px solid rgba(0,129,222,0.4)',
                    color: palette.blueSoft,
                    fontWeight: 500,
                }}
            >
                <GitBranch size={12} strokeWidth={1.8} />
                main
                <div
                    style={{
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        background: '#22c55e',
                        marginLeft: 2,
                    }}
                />
            </div>
            <div
                style={{
                    flex: 1,
                    height: 2,
                    background: palette.border,
                    borderRadius: 999,
                    position: 'relative',
                    overflow: 'hidden',
                    minWidth: 220,
                }}
            >
                {[0, 0.33, 0.66].map((n) => (
                    <div
                        key={n}
                        style={{
                            position: 'absolute',
                            top: -2,
                            left: `${dotPos(progress, n)}%`,
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: palette.blueSoft,
                        }}
                    />
                ))}
            </div>
            <span style={{ color: palette.textMuted, fontSize: 11.5 }}>Synced just now</span>
        </div>
    );
};

export const Scene10CodeStaysYours: React.FC = () => {
    const frame = useCurrentFrame();
    const revealed = Math.min(
        codeLines.length,
        Math.floor(interp(frame, [20, 200], [0, codeLines.length + 1])),
    );
    const fadeIn = interp(frame, [0, 30], [0, 1]);
    const syncProgress = interp(frame, [120, 460], [0, 1]);

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
                    flexDirection: 'column',
                    gap: 28,
                    opacity: fadeIn,
                }}
            >
                <CodePane revealed={revealed} />
                <div style={{ width: 460 }}>
                    <SyncRow progress={syncProgress} />
                </div>
            </div>
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    paddingBottom: 80,
                    pointerEvents: 'none',
                }}
            >
                <div style={{ width: 800 }}>
                    <TextOverlay
                        text="Your code stays yours."
                        enter={30}
                        exit={460}
                        style="display"
                        weight={500}
                    />
                </div>
            </div>
        </AbsoluteFill>
    );
};
