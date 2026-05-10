import React from 'react';
import { FolderOpen, GitBranch } from 'lucide-react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

import { CanvasMock } from '../../components/CanvasMock';
import { ClickRipple } from '../../components/ClickRipple';
import { Cursor } from '../../components/Cursor';
import { EditorScene } from '../../components/EditorScene';
import { LeftPanelMock } from '../../components/LeftPanelMock';
import { RightPanelChatMock } from '../../components/RightPanelChatMock';
import { TextOverlay } from '../../components/TextOverlay';
import { WebsiteContent } from '../../components/WebsiteContent';
import { cursorAt, cursorTip, moveToClick } from '../../utils/cursor';
import { interp, sceneSpring } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

const SCENE_LENGTH = 900;

interface ChipProps {
    progress: number;
    icon: React.ReactNode;
    label: string;
    sub: string;
    accent: string;
    fade: number;
    selected?: boolean;
}

const Chip: React.FC<ChipProps> = ({ progress, icon, label, sub, accent, fade, selected }) => {
    const translateY = (1 - progress) * 16;
    return (
        <div
            style={{
                opacity: progress * fade,
                transform: `translateY(${translateY}px)`,
                background: palette.surface,
                border: `1px solid ${selected ? 'rgba(0,129,222,0.6)' : palette.border}`,
                boxShadow: selected ? '0 0 0 2px rgba(0,129,222,0.16)' : 'none',
                borderRadius: 14,
                padding: 22,
                width: 280,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                fontFamily: fontStack,
            }}
        >
            <div
                style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: palette.surfaceElevated,
                    border: `1px solid ${palette.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: accent,
                }}
            >
                {icon}
            </div>
            <div
                style={{
                    fontSize: 16,
                    color: palette.textPrimary,
                    letterSpacing: 0.05,
                    fontWeight: 500,
                }}
            >
                {label}
            </div>
            <div style={{ fontSize: 12.5, color: palette.textSecondary, lineHeight: 1.5 }}>
                {sub}
            </div>
        </div>
    );
};

// Import-chip click target — left chip's centre, in 1920×1080 viewport.
const IMPORT_CHIP_TARGET = { x: 760, y: 540 };

export const SceneA5BringYourSite: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const editorDim = interp(frame, [0, 60], [0.18, 0.5]);
    const editorReveal = interp(frame, [320, 460], [0, 1]);
    const editorOpacity = Math.max(editorDim, editorReveal);

    const leftChipProgress = sceneSpring(frame, fps, 'landing');
    const rightChipProgress = sceneSpring(Math.max(0, frame - 8), fps, 'landing');
    const chipFade = interp(frame, [280, 380], [1, 0]);

    const CLICK_FRAME = 270;
    const cursor = cursorAt(frame, [
        moveToClick({ x: 1660, y: 240 }, IMPORT_CHIP_TARGET, CLICK_FRAME, 80),
    ]);
    const tip = cursorTip(cursor);

    const headlineEnter = interp(frame, [420, 500], [0, 1]);

    return (
        <AbsoluteFill style={{ background: palette.background, fontFamily: fontStack }}>
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: editorOpacity,
                }}
            >
                <EditorScene
                    activeTab="layers"
                    projectName="northwind"
                    leftPanel={<LeftPanelMock kind="layers" />}
                    canvas={
                        <CanvasMock breakpoint="desktop">
                            <WebsiteContent variant="imported" />
                        </CanvasMock>
                    }
                    rightPanel={<RightPanelChatMock messages={[]} currentFrame={frame} />}
                />
            </div>

            {/* Action chips */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 60,
                    pointerEvents: 'none',
                }}
            >
                <Chip
                    progress={leftChipProgress}
                    icon={<FolderOpen size={20} strokeWidth={1.7} />}
                    label="Import folder"
                    sub="Drop a project. We'll keep your structure."
                    accent={palette.blueSoft}
                    fade={chipFade}
                    selected={frame >= CLICK_FRAME - 6 && frame < CLICK_FRAME + 30}
                />
                <Chip
                    progress={rightChipProgress}
                    icon={<GitBranch size={20} strokeWidth={1.7} />}
                    label="Git connection"
                    sub="Stay synced with your project."
                    accent={palette.purpleSoft}
                    fade={chipFade}
                />
            </div>

            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    paddingBottom: 90,
                    opacity: headlineEnter,
                    pointerEvents: 'none',
                }}
            >
                <div style={{ width: 900 }}>
                    <TextOverlay
                        text="Bring your existing site."
                        enter={420}
                        exit={SCENE_LENGTH - 20}
                        style="display"
                        weight={500}
                    />
                </div>
            </div>

            <Cursor x={cursor.x} y={cursor.y} />
            <ClickRipple at={CLICK_FRAME} x={tip.x} y={tip.y} />
        </AbsoluteFill>
    );
};
