import React from 'react';
import { Database, Download } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { BreakpointPill } from '../../components/BreakpointPill';
import { CollabCursor } from '../../components/CollabCursor';
import { ComponentLibraryDrawer } from '../../components/ComponentLibraryDrawer';
import { TextOverlay } from '../../components/TextOverlay';
import { cubicBezier } from '../../utils/paths';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * Storyboard A — Scene 6 (0:50–1:05, frames 3000–3900, scene length 900).
 *
 * Montage: components → breakpoints → collab cursors → CMS row → export.
 * Text on a single line lands at the back: "Real components. Real team.
 * Real export." A ghost cursor pans across the scene without clicking.
 */

const SCENE_LENGTH = 900;

// Five beats, ~180 frames each.
const BEAT = 180;

const BeatFrame: React.FC<{
    start: number;
    children: React.ReactNode;
}> = ({ start, children }) => {
    const frame = useCurrentFrame();
    const opacity = Math.min(
        interp(frame, [start, start + 12], [0, 1]),
        interp(frame, [start + BEAT - 18, start + BEAT - 4], [1, 0]),
    );
    const lift = interp(frame, [start, start + 18], [10, 0]);
    if (frame < start - 5 || frame > start + BEAT) return null;
    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity,
                transform: `translateY(${lift}px)`,
            }}
        >
            {children}
        </div>
    );
};

/** 1 — Components beat: a small drawer slides up over a faux canvas. */
const ComponentsBeat: React.FC = () => {
    const frame = useCurrentFrame();
    const progress = interp(frame, [0, 60], [0, 1]);
    return (
        <div
            style={{
                position: 'relative',
                width: 1200,
                height: 540,
                background: palette.background,
                border: `1px solid ${palette.border}`,
                borderRadius: 14,
                overflow: 'hidden',
            }}
        >
            <ComponentLibraryDrawer progress={progress} />
        </div>
    );
};

/** 2 — Breakpoints beat: pill + a small frame switching widths. */
const BreakpointsBeat: React.FC<{ localFrame: number }> = ({ localFrame }) => {
    // Frame width morphs from desktop → tablet across the beat.
    const width = interp(localFrame, [40, 120], [820, 480]);
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 28,
            }}
        >
            <BreakpointPill active={localFrame > 100 ? 'tablet' : 'desktop'} />
            <div
                style={{
                    width,
                    height: 360,
                    background: palette.surface,
                    border: `1px solid ${palette.border}`,
                    borderRadius: 14,
                    padding: 22,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }}
            >
                <div
                    style={{
                        height: 18,
                        width: '60%',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.10)',
                    }}
                />
                <div
                    style={{
                        height: 12,
                        width: '40%',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.06)',
                    }}
                />
                <div
                    style={{
                        marginTop: 'auto',
                        height: 36,
                        width: 132,
                        borderRadius: 8,
                        background: 'rgba(0,129,222,0.45)',
                    }}
                />
            </div>
        </div>
    );
};

/** 3 — Collab beat: three named cursors drift on a Bezier path over a faux canvas. */
const CollabBeat: React.FC<{ localFrame: number }> = ({ localFrame }) => {
    const t1 = Math.max(0, Math.min(1, localFrame / BEAT));
    const t2 = Math.max(0, Math.min(1, (localFrame - 14) / BEAT));
    const t3 = Math.max(0, Math.min(1, (localFrame - 28) / BEAT));
    const a = cubicBezier(
        { x: 60, y: 60 },
        { x: 320, y: 200 },
        { x: 580, y: 80 },
        { x: 760, y: 240 },
        t1,
    );
    const b = cubicBezier(
        { x: 800, y: 320 },
        { x: 600, y: 220 },
        { x: 320, y: 380 },
        { x: 120, y: 320 },
        t2,
    );
    const c = cubicBezier(
        { x: 420, y: 380 },
        { x: 540, y: 280 },
        { x: 700, y: 360 },
        { x: 860, y: 440 },
        t3,
    );
    return (
        <div
            style={{
                position: 'relative',
                width: 980,
                height: 520,
                background: palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: 14,
                padding: 22,
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    background:
                        'repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 60px), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 60px)',
                    borderRadius: 10,
                }}
            />
            <CollabCursor x={a.x} y={a.y} name="Mia" variant="blue" />
            <CollabCursor x={b.x} y={b.y} name="Theo" variant="purple" />
            <CollabCursor x={c.x} y={c.y} name="Ren" variant="neutral" />
        </div>
    );
};

/** 4 — CMS row beat: a tiny CMS table with bound rows. */
const CmsBeat: React.FC = () => {
    const rows = [
        { title: 'Quiet hero', tag: 'Published' },
        { title: 'Pricing v2', tag: 'Draft' },
        { title: 'Customer story', tag: 'Published' },
        { title: 'Changelog', tag: 'Synced' },
    ];
    return (
        <div
            style={{
                width: 880,
                background: palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: 14,
                overflow: 'hidden',
                fontFamily: fontStack,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '14px 20px',
                    borderBottom: `1px solid ${palette.border}`,
                    color: palette.textSecondary,
                    fontSize: 13,
                }}
            >
                <Database size={16} color={palette.blueSoft} />
                Content — Stories
            </div>
            {rows.map((r) => (
                <div
                    key={r.title}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 20px',
                        borderBottom: `1px solid ${palette.borderSubtle}`,
                        fontSize: 13,
                        color: palette.textPrimary,
                    }}
                >
                    <span>{r.title}</span>
                    <span
                        style={{
                            fontSize: 11,
                            color: palette.textMuted,
                            border: `1px solid ${palette.border}`,
                            borderRadius: 999,
                            padding: '3px 10px',
                            letterSpacing: 0.2,
                        }}
                    >
                        {r.tag}
                    </span>
                </div>
            ))}
        </div>
    );
};

/** 5 — Export beat: small icon card with download glyph. */
const ExportBeat: React.FC<{ localFrame: number }> = ({ localFrame }) => {
    const halo = interp(localFrame, [0, 60], [0.05, 0.35]);
    return (
        <div
            style={{
                background: palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: 14,
                padding: 28,
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                fontFamily: fontStack,
                position: 'relative',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    inset: -10,
                    borderRadius: 18,
                    background: `rgba(0,129,222,${halo})`,
                    filter: 'blur(20px)',
                }}
            />
            <div
                style={{
                    position: 'relative',
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: palette.surfaceElevated,
                    border: `1px solid ${palette.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Download size={22} color={palette.blueSoft} />
            </div>
            <div style={{ position: 'relative' }}>
                <div style={{ fontSize: 11, color: palette.textMuted, letterSpacing: 0.6 }}>
                    EXPORT
                </div>
                <div style={{ fontSize: 18, color: palette.textPrimary, marginTop: 4 }}>
                    Your code, ready to ship
                </div>
            </div>
        </div>
    );
};

export const SceneA6Montage: React.FC = () => {
    const frame = useCurrentFrame();

    // Ghost cursor drifts diagonally across the whole scene.
    const tGhost = Math.max(0, Math.min(1, frame / SCENE_LENGTH));
    const ghost = cubicBezier(
        { x: 280, y: 180 },
        { x: 720, y: 720 },
        { x: 1240, y: 320 },
        { x: 1640, y: 880 },
        tGhost,
    );

    // Local frame for each beat (for sub-animations).
    const localFor = (beatIdx: number): number => frame - beatIdx * BEAT;

    return (
        <AbsoluteFill style={{ background: palette.background, fontFamily: fontStack }}>
            <BeatFrame start={0}>
                <ComponentsBeat />
            </BeatFrame>
            <BeatFrame start={BEAT}>
                <BreakpointsBeat localFrame={localFor(1)} />
            </BeatFrame>
            <BeatFrame start={BEAT * 2}>
                <CollabBeat localFrame={localFor(2)} />
            </BeatFrame>
            <BeatFrame start={BEAT * 3}>
                <CmsBeat />
            </BeatFrame>
            <BeatFrame start={BEAT * 4}>
                <ExportBeat localFrame={localFor(4)} />
            </BeatFrame>

            {/* Headline pinned bottom-centre across the montage. */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    paddingBottom: 70,
                }}
            >
                <div style={{ width: 1200 }}>
                    <TextOverlay
                        text="Real components. Real team. Real export."
                        enter={20}
                        exit={SCENE_LENGTH - 30}
                        style="display"
                    />
                </div>
            </div>

            {/* Ghost cursor — never clicks. */}
            <div style={{ opacity: 0.55 }}>
                <div
                    style={{
                        position: 'absolute',
                        left: ghost.x,
                        top: ghost.y,
                    }}
                >
                    {/* Inline SVG arrow so we can dim without touching the shared component. */}
                    <svg width={18} height={18} viewBox="0 0 18 18">
                        <path
                            d="M2 1 L2 14 L5.6 10.6 L7.8 15.8 L10 14.9 L7.9 9.7 L13 9.7 Z"
                            fill={palette.textPrimary}
                            stroke="#000"
                            strokeWidth={1}
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
            </div>
        </AbsoluteFill>
    );
};
