import React from 'react';
import { ChevronRight, FileCode, FileText, FolderClosed, FolderOpen } from 'lucide-react';

import { fontStack, palette } from '../utils/tokens';

export type LeftPanelKind = 'layers' | 'code' | 'brand' | 'pages' | 'components';

interface LayerNode {
    label: string;
    depth: number;
    selected?: boolean;
    open?: boolean;
    /** lucide-style tag tone for the small left dot. */
    tag?:
        | 'html'
        | 'body'
        | 'main'
        | 'section'
        | 'h1'
        | 'p'
        | 'button'
        | 'div'
        | 'img'
        | 'header'
        | 'footer';
}

const tagTone: Record<NonNullable<LayerNode['tag']>, string> = {
    html: '#94a3b8',
    body: '#94a3b8',
    main: '#94a3b8',
    section: '#94a3b8',
    div: '#94a3b8',
    header: '#94a3b8',
    footer: '#94a3b8',
    h1: '#0081DE',
    p: '#0081DE',
    button: '#920EFF',
    img: '#22c55e',
};

export interface LeftPanelMockProps {
    kind?: LeftPanelKind;
    /** Override the highlighted row index. */
    selectedIndex?: number;
}

const layersTree: LayerNode[] = [
    { label: 'html', depth: 0, open: true, tag: 'html' },
    { label: 'body', depth: 1, open: true, tag: 'body' },
    { label: 'main', depth: 2, open: true, tag: 'main' },
    { label: 'section.hero', depth: 3, open: true, tag: 'section' },
    { label: 'h1.title', depth: 4, tag: 'h1', selected: true },
    { label: 'p.subhead', depth: 4, tag: 'p' },
    { label: 'div.actions', depth: 4, tag: 'div' },
    { label: 'button.primary', depth: 5, tag: 'button' },
    { label: 'button.ghost', depth: 5, tag: 'button' },
    { label: 'section.features', depth: 3, tag: 'section' },
    { label: 'footer', depth: 2, tag: 'footer' },
];

const RowLayers: React.FC<{ node: LayerNode; selected: boolean }> = ({ node, selected }) => {
    const dotColor = node.tag ? tagTone[node.tag] : '#94a3b8';
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                paddingTop: 4,
                paddingBottom: 4,
                paddingLeft: 8 + node.depth * 12,
                paddingRight: 10,
                borderRadius: 6,
                background: selected ? 'rgba(0,129,222,0.16)' : 'transparent',
                color: selected ? palette.textPrimary : palette.textSecondary,
                fontSize: 11.5,
                fontFamily: fontStack,
                letterSpacing: 0.05,
                marginLeft: 4,
                marginRight: 4,
            }}
        >
            <ChevronRight
                size={10}
                strokeWidth={2}
                style={{
                    transform: node.open ? 'rotate(90deg)' : 'none',
                    color: palette.textMuted,
                    flexShrink: 0,
                    visibility: node.depth >= 4 ? 'hidden' : 'visible',
                }}
            />
            <div
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: 1.5,
                    background: dotColor,
                    flexShrink: 0,
                }}
            />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {node.label}
            </span>
        </div>
    );
};

const HeaderRow: React.FC<{ label: string }> = ({ label }) => (
    <div
        style={{
            fontSize: 10.5,
            color: palette.textMuted,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            padding: '14px 16px 8px',
            fontFamily: fontStack,
            fontWeight: 500,
        }}
    >
        {label}
    </div>
);

const FileRow: React.FC<{
    label: string;
    depth: number;
    Icon: typeof FolderOpen;
    selected?: boolean;
    color?: string;
}> = ({ label, depth, Icon, selected, color }) => (
    <div
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            paddingTop: 4,
            paddingBottom: 4,
            paddingLeft: 8 + depth * 12,
            paddingRight: 10,
            borderRadius: 6,
            background: selected ? 'rgba(0,129,222,0.16)' : 'transparent',
            color: selected ? palette.textPrimary : palette.textSecondary,
            fontSize: 11.5,
            fontFamily: fontStack,
            marginLeft: 4,
            marginRight: 4,
        }}
    >
        <Icon size={12} strokeWidth={1.6} color={color ?? palette.textMuted} />
        <span>{label}</span>
    </div>
);

export const LeftPanelMock: React.FC<LeftPanelMockProps> = ({ kind = 'layers', selectedIndex }) => {
    if (kind === 'code') {
        return (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    background: palette.surface,
                    display: 'flex',
                    flexDirection: 'column',
                    fontFamily: fontStack,
                }}
            >
                <HeaderRow label="Code" />
                <FileRow label="src" depth={0} Icon={FolderOpen} />
                <FileRow label="app" depth={1} Icon={FolderOpen} />
                <FileRow label="page.tsx" depth={2} Icon={FileCode} selected color="#0081DE" />
                <FileRow label="layout.tsx" depth={2} Icon={FileCode} color="#0081DE" />
                <FileRow label="globals.css" depth={2} Icon={FileText} color="#22c55e" />
                <FileRow label="components" depth={1} Icon={FolderClosed} />
                <FileRow label="lib" depth={1} Icon={FolderClosed} />
                <FileRow label="public" depth={0} Icon={FolderClosed} />
                <FileRow label="package.json" depth={0} Icon={FileText} color="#f59e0b" />
            </div>
        );
    }

    if (kind === 'brand') {
        return (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    background: palette.surface,
                    display: 'flex',
                    flexDirection: 'column',
                    fontFamily: fontStack,
                }}
            >
                <HeaderRow label="Brand" />
                <div style={{ padding: '4px 16px 14px' }}>
                    <div
                        style={{
                            fontSize: 10.5,
                            color: palette.textMuted,
                            letterSpacing: 0.4,
                            marginBottom: 8,
                        }}
                    >
                        Colors
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {['#0a0a0a', '#ffffff', '#0081DE', '#920EFF', '#22c55e', '#ef4444'].map(
                            (c) => (
                                <div
                                    key={c}
                                    style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 6,
                                        background: c,
                                        border: `1px solid ${palette.border}`,
                                    }}
                                />
                            ),
                        )}
                    </div>
                    <div
                        style={{
                            fontSize: 10.5,
                            color: palette.textMuted,
                            letterSpacing: 0.4,
                            marginTop: 18,
                            marginBottom: 8,
                        }}
                    >
                        Typography
                    </div>
                    <div
                        style={{
                            color: palette.textPrimary,
                            fontSize: 18,
                            fontWeight: 500,
                            letterSpacing: -0.2,
                        }}
                    >
                        Inter
                    </div>
                    <div
                        style={{
                            color: palette.textSecondary,
                            fontSize: 12,
                            marginTop: 4,
                        }}
                    >
                        Display · 56 / Body · 16
                    </div>
                </div>
            </div>
        );
    }

    if (kind === 'pages') {
        return (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    background: palette.surface,
                    display: 'flex',
                    flexDirection: 'column',
                    fontFamily: fontStack,
                }}
            >
                <HeaderRow label="Pages" />
                <FileRow label="/" depth={0} Icon={FileText} selected color="#0081DE" />
                <FileRow label="/about" depth={0} Icon={FileText} color={palette.textMuted} />
                <FileRow label="/pricing" depth={0} Icon={FileText} color={palette.textMuted} />
                <FileRow label="/blog" depth={0} Icon={FolderClosed} />
                <FileRow label="/contact" depth={0} Icon={FileText} color={palette.textMuted} />
            </div>
        );
    }

    // layers
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                background: palette.surface,
                display: 'flex',
                flexDirection: 'column',
                fontFamily: fontStack,
            }}
        >
            <HeaderRow label="Layers" />
            {layersTree.map((node, i) => (
                <RowLayers
                    key={`${node.label}-${i}`}
                    node={node}
                    selected={
                        selectedIndex !== undefined ? i === selectedIndex : Boolean(node.selected)
                    }
                />
            ))}
        </div>
    );
};
