import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

import { sceneSpring } from '../utils/timing';
import { fontStack, palette } from '../utils/tokens';

const Widget: React.FC<{
    label: string;
    sublabel: string;
    accent: string;
    delayFrames: number;
    align: 'left' | 'right';
}> = ({ label, sublabel, accent, delayFrames, align }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const progress = sceneSpring(Math.max(0, frame - delayFrames), fps, 'landing');
    const translate = (1 - progress) * 24;

    return (
        <div
            style={{
                opacity: progress,
                transform: `translateY(${translate}px)`,
                background: palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: 14,
                padding: 22,
                fontFamily: fontStack,
                textAlign: align,
                width: 320,
            }}
        >
            <div
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: accent,
                    marginLeft: align === 'right' ? 'auto' : 0,
                    marginBottom: 14,
                    opacity: 0.85,
                }}
            />
            <div style={{ fontSize: 18, color: palette.textPrimary, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 13, color: palette.textSecondary }}>{sublabel}</div>
        </div>
    );
};

export const Scene02Widgets: React.FC = () => {
    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 120,
            }}
        >
            <Widget
                label="Design tool"
                sublabel="Canvas, layers, components"
                accent={palette.blueSoft}
                delayFrames={0}
                align="left"
            />
            <Widget
                label="AI teammate"
                sublabel="Builds, refines, listens"
                accent={palette.purpleSoft}
                delayFrames={6}
                align="right"
            />
        </AbsoluteFill>
    );
};
