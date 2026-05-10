import React from 'react';
import {
    Box,
    Component as ComponentIcon,
    GitBranch,
    HelpCircle,
    Image as ImageIcon,
    Layers,
    Palette,
    Plus,
    Redo2,
    Search,
    Settings,
    Share2,
    SquareDashedBottomCode,
    Undo2,
} from 'lucide-react';

import { fontStack, palette } from '../utils/tokens';

export type EditorTab =
    | 'insert'
    | 'components'
    | 'layers'
    | 'search'
    | 'brand'
    | 'pages'
    | 'images'
    | 'branches';

export interface EditorMockupProps {
    leftPanel?: React.ReactNode;
    canvas?: React.ReactNode;
    rightPanel?: React.ReactNode;
    /** Width of expanded left content panel. Set to 0 to hide it (rail-only). */
    leftPanelWidth?: number;
    /** Width of expanded right panel. Set to 0 to hide it. */
    rightPanelWidth?: number;
    /** Project name shown in top bar. */
    projectName?: string;
    /** Highlighted tab on the left rail. */
    activeTab?: EditorTab;
    /** Show editor bar (the centered float toolbar). */
    showEditorBar?: boolean;
    /** Optional bottom bar content. */
    bottomBar?: React.ReactNode;
    /** @deprecated legacy alias for `projectName`. */
    title?: string;
}

const railTabs: { id: EditorTab; Icon: typeof Layers }[] = [
    { id: 'insert', Icon: Plus },
    { id: 'components', Icon: ComponentIcon },
    { id: 'layers', Icon: Layers },
    { id: 'search', Icon: Search },
    { id: 'brand', Icon: Palette },
    { id: 'pages', Icon: SquareDashedBottomCode },
    { id: 'images', Icon: ImageIcon },
    { id: 'branches', Icon: GitBranch },
];

const RailButton: React.FC<{ Icon: typeof Layers; active?: boolean }> = ({ Icon, active }) => (
    <div
        style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
            color: active ? palette.textPrimary : palette.textMuted,
        }}
    >
        <Icon size={16} strokeWidth={1.6} />
    </div>
);

const TopBarPill: React.FC<{ children: React.ReactNode; tone?: 'neutral' | 'accent' }> = ({
    children,
    tone = 'neutral',
}) => (
    <div
        style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 6,
            background: tone === 'accent' ? 'rgba(0,129,222,0.18)' : 'transparent',
            border:
                tone === 'accent'
                    ? '1px solid rgba(0,129,222,0.45)'
                    : `1px solid ${palette.border}`,
            color: tone === 'accent' ? palette.blueSoft : palette.textSecondary,
            fontSize: 11.5,
            fontFamily: fontStack,
            letterSpacing: 0.1,
            fontWeight: 500,
        }}
    >
        {children}
    </div>
);

const TopBarIconButton: React.FC<{ Icon: typeof Layers }> = ({ Icon }) => (
    <div
        style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: palette.textMuted,
        }}
    >
        <Icon size={14} strokeWidth={1.6} />
    </div>
);

export const EditorMockup: React.FC<EditorMockupProps> = ({
    leftPanel,
    canvas,
    rightPanel,
    leftPanelWidth = 272,
    rightPanelWidth = 360,
    projectName,
    activeTab = 'layers',
    showEditorBar = false,
    bottomBar,
    title,
}) => {
    const resolvedName = projectName ?? title ?? 'My Site';
    const RAIL_W = 56;
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                background: palette.background,
                border: `1px solid ${palette.border}`,
                borderRadius: 14,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: fontStack,
                position: 'relative',
            }}
        >
            {/* Top bar — 56px, project breadcrumb left, mode toggle middle, actions right */}
            <div
                style={{
                    height: 56,
                    background: palette.surface,
                    borderBottom: `1px solid ${palette.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 16,
                    paddingRight: 12,
                    gap: 10,
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: 'linear-gradient(135deg, #0081DE 0%, #920EFF 100%)',
                    }}
                />
                <div
                    style={{
                        fontSize: 12.5,
                        color: palette.textPrimary,
                        fontWeight: 500,
                        letterSpacing: 0.05,
                    }}
                >
                    {resolvedName}
                </div>
                <span style={{ color: palette.textMuted, fontSize: 12 }}>/</span>
                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        color: palette.textSecondary,
                    }}
                >
                    <GitBranch size={11} strokeWidth={1.7} />
                    main
                </div>

                {/* Center mode toggle */}
                <div
                    style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: 0,
                        padding: 3,
                        borderRadius: 8,
                        background: palette.background,
                        border: `1px solid ${palette.border}`,
                    }}
                >
                    <div
                        style={{
                            padding: '4px 14px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            background: 'rgba(255,255,255,0.06)',
                            color: palette.textPrimary,
                            fontWeight: 500,
                        }}
                    >
                        Design
                    </div>
                    <div
                        style={{
                            padding: '4px 14px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            color: palette.textMuted,
                        }}
                    >
                        Code
                    </div>
                </div>

                <div style={{ flex: 1 }} />
                <TopBarIconButton Icon={Undo2} />
                <TopBarIconButton Icon={Redo2} />
                <div
                    style={{ width: 1, height: 18, background: palette.border, margin: '0 4px' }}
                />
                <TopBarPill>
                    <Share2 size={11} strokeWidth={1.8} />
                    Share
                </TopBarPill>
                <TopBarPill tone="accent">
                    <Box size={11} strokeWidth={1.8} />
                    Publish
                </TopBarPill>
            </div>

            {/* Body */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                {/* Vertical icon rail */}
                <div
                    style={{
                        width: RAIL_W,
                        background: palette.surface,
                        borderRight: `1px solid ${palette.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        paddingTop: 10,
                        paddingBottom: 10,
                        flexShrink: 0,
                    }}
                >
                    {railTabs.map(({ id, Icon }) => (
                        <RailButton key={id} Icon={Icon} active={id === activeTab} />
                    ))}
                    <div style={{ flex: 1 }} />
                    <RailButton Icon={HelpCircle} />
                    <RailButton Icon={Settings} />
                </div>

                {/* Left content panel */}
                {leftPanelWidth > 0 && (
                    <div
                        style={{
                            width: leftPanelWidth,
                            height: '100%',
                            background: palette.surface,
                            borderRight: `1px solid ${palette.border}`,
                            flexShrink: 0,
                            overflow: 'hidden',
                        }}
                    >
                        {leftPanel}
                    </div>
                )}

                {/* Canvas */}
                <div
                    style={{
                        flex: 1,
                        height: '100%',
                        background: palette.background,
                        position: 'relative',
                        minWidth: 0,
                    }}
                >
                    {canvas}
                    {showEditorBar && (
                        <div
                            style={{
                                position: 'absolute',
                                top: 14,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 10px',
                                borderRadius: 10,
                                background: palette.surface,
                                border: `1px solid ${palette.border}`,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                            }}
                        >
                            <div
                                style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 4,
                                    background: 'rgba(255,255,255,0.06)',
                                }}
                            />
                            <div
                                style={{
                                    fontSize: 11,
                                    color: palette.textSecondary,
                                    padding: '0 6px',
                                }}
                            >
                                Inter · 16
                            </div>
                            <div style={{ width: 1, height: 14, background: palette.border }} />
                            <div
                                style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: 4,
                                    background: palette.blue,
                                }}
                            />
                            <div style={{ width: 1, height: 14, background: palette.border }} />
                            {[0, 1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    style={{
                                        width: 18,
                                        height: 18,
                                        borderRadius: 4,
                                        background: 'rgba(255,255,255,0.05)',
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Right panel */}
                {rightPanelWidth > 0 && (
                    <div
                        style={{
                            width: rightPanelWidth,
                            height: '100%',
                            background: palette.surface,
                            borderLeft: `1px solid ${palette.border}`,
                            flexShrink: 0,
                            overflow: 'hidden',
                        }}
                    >
                        {rightPanel}
                    </div>
                )}
            </div>

            {/* Bottom bar */}
            <div
                style={{
                    height: 28,
                    background: palette.surface,
                    borderTop: `1px solid ${palette.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 14,
                    paddingRight: 14,
                    gap: 14,
                    flexShrink: 0,
                    fontSize: 10.5,
                    color: palette.textMuted,
                    letterSpacing: 0.2,
                }}
            >
                {bottomBar ?? (
                    <>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <div
                                style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: 999,
                                    background: '#22c55e',
                                }}
                            />
                            Ready
                        </div>
                        <span>·</span>
                        <span>1440 × 900</span>
                        <span>·</span>
                        <span>100%</span>
                        <div style={{ flex: 1 }} />
                        <span>Saved</span>
                    </>
                )}
            </div>
        </div>
    );
};
