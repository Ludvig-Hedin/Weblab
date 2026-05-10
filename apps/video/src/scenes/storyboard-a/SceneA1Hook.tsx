import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { fontStack, palette } from '../../utils/tokens';

const HOOK_TEXT = 'Outgrown your design tool?';
const SCENE_LENGTH = 180;

/**
 * Storyboard A — Scene 1 (0:00–0:03, frames 0–180).
 *
 * Black plate. Single line types into the centre, char-by-char, then a
 * cursor blinks once before the cut. Audience-friendly hook for designers
 * who feel boxed in by Webflow/Framer.
 */
export const SceneA1Hook: React.FC = () => {
    const frame = useCurrentFrame();

    // Match the SFX cue grid (8 keypress hits, ~20f apart starting at frame 30).
    // Land the full sentence by ~frame 170 so the cursor blink reads before the cut.
    const TYPE_START = 24;
    const TYPE_END = 168;
    const span = TYPE_END - TYPE_START;
    const t = Math.max(0, Math.min(1, (frame - TYPE_START) / span));
    const visibleCount = Math.floor(HOOK_TEXT.length * t);
    const visible = HOOK_TEXT.slice(0, visibleCount);
    const isDone = visibleCount >= HOOK_TEXT.length;

    // Cursor blinks every 12 frames after the line lands.
    const blinkVisible = isDone ? Math.floor((frame - TYPE_END) / 12) % 2 === 0 : true;

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
                    lineHeight: 1.05,
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
                        opacity: blinkVisible ? 1 : 0,
                    }}
                />
            </div>
            {/* Reserved scene length for future contributors / debug. */}
            <span style={{ display: 'none' }}>{SCENE_LENGTH}</span>
        </AbsoluteFill>
    );
};
