import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { fontStack, palette } from '../utils/tokens';

const HOOK_TEXT = 'Outgrown your design tool?';

export const Scene01HookText: React.FC = () => {
    const frame = useCurrentFrame();

    // Char-by-char reveal: 1 char per ~4 frames so we land before frame 120.
    const charsPerFrame = HOOK_TEXT.length / 110;
    const visibleCount = Math.min(HOOK_TEXT.length, Math.floor(frame * charsPerFrame));
    const visible = HOOK_TEXT.slice(0, visibleCount);
    const isDone = visibleCount >= HOOK_TEXT.length;

    // Cursor blink after the line lands.
    const blinkVisible = isDone && Math.floor((frame - 120) / 12) % 2 === 0;

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fontStack,
            }}
        >
            <div
                style={{
                    fontSize: 64,
                    fontWeight: 400,
                    letterSpacing: -0.5,
                    color: palette.textPrimary,
                    textAlign: 'center',
                }}
            >
                {visible}
                <span
                    style={{
                        display: 'inline-block',
                        width: 3,
                        height: 60,
                        verticalAlign: 'middle',
                        background: palette.textPrimary,
                        marginLeft: 6,
                        opacity: isDone ? (blinkVisible ? 1 : 0) : 1,
                    }}
                />
            </div>
        </AbsoluteFill>
    );
};
