import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { BrandMark } from '../../components/BrandMark';
import { TextOverlay } from '../../components/TextOverlay';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

const TOTAL_DOTS = 5;

const Dot: React.FC<{ active: boolean; settled: boolean }> = ({ active, settled }) => (
    <div
        style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: active ? palette.textPrimary : 'rgba(255,255,255,0.16)',
            border: `1px solid ${settled ? palette.border : 'transparent'}`,
            transition: 'none',
        }}
    />
);

/**
 * Intro plate (frames 0-450). Brand wordmark sits in the corner while the
 * hook line fades in centrally. A row of 5 dots lights up one-by-one to
 * signal the upcoming chapters.
 */
export const SceneDIntro: React.FC = () => {
    const frame = useCurrentFrame();

    // Brand wordmark eases in for the first 30 frames, persists otherwise.
    const wordmarkOpacity = interp(frame, [0, 30], [0, 1]);

    // Hook text uses TextOverlay's fade-in/out lifecycle.
    // 5 dots: each dot lights up at frame [120 + i*36, +24].
    const dotLightFrame = (i: number): number => 150 + i * 36;
    const dotsSettleAt = dotLightFrame(TOTAL_DOTS - 1) + 24;

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                fontFamily: fontStack,
                color: palette.textPrimary,
            }}
        >
            {/* BrandWordmark in the corner */}
            <div
                style={{
                    position: 'absolute',
                    top: 48,
                    left: 60,
                    opacity: wordmarkOpacity,
                }}
            >
                <BrandMark variant="wordmark" height={22} />
            </div>

            {/* Centered hook line */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 60,
                }}
            >
                <div style={{ width: 900 }}>
                    <TextOverlay
                        text="5 things in 90 seconds."
                        enter={30}
                        exit={420}
                        style="display"
                    />
                </div>

                {/* Countdown dots 1..5 */}
                <div
                    style={{
                        display: 'flex',
                        gap: 18,
                        opacity: interp(frame, [120, 160], [0, 1]),
                    }}
                >
                    {Array.from({ length: TOTAL_DOTS }).map((_, i) => {
                        const lit = frame >= dotLightFrame(i);
                        const settled = frame >= dotsSettleAt;
                        return <Dot key={i} active={lit} settled={settled} />;
                    })}
                </div>
            </div>
        </AbsoluteFill>
    );
};
