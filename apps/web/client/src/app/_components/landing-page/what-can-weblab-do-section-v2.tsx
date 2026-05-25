'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { Routes } from '@/utils/constants';
import { DirectEditingInteractive } from '../shared/mockups/direct-editing-interactive';
import { FeatureBackdrop } from './feature-backdrop';
import { AiAssistantVisual as FigmaAiAssistantVisual } from './feature-trio-section';

const REVEAL = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

// Ambient idle cycle for visuals — quietly advances an index every interval.
// Pauses while the user is hovering the visual.
function useAmbientCycle(length: number, intervalMs: number) {
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    useEffect(() => {
        if (paused || length <= 1) return;
        const id = setInterval(() => {
            setIndex((i) => (i + 1) % length);
        }, intervalMs);
        return () => clearInterval(id);
    }, [paused, length, intervalMs]);
    return {
        index,
        setIndex,
        onMouseEnter: () => setPaused(true),
        onMouseLeave: () => setPaused(false),
    };
}

interface FeatureCardProps {
    visual: React.ReactNode;
    subtitle: string;
    title: React.ReactNode;
    paragraph: string;
    reverse?: boolean;
    backdrop: string;
}

function FeatureCard({ visual, subtitle, title, paragraph, reverse, backdrop }: FeatureCardProps) {
    return (
        <motion.div
            initial={REVEAL.initial}
            whileInView={REVEAL.whileInView}
            viewport={REVEAL.viewport}
            transition={REVEAL.transition}
            className={cn(
                'grid grid-cols-1 items-end gap-4 md:grid-cols-12 md:gap-x-8',
                reverse && 'md:[&>*:first-child]:order-2',
            )}
        >
            {/* Asset — 8 cols, ar 860/650, 12px radius, min-height for small screens */}
            <FeatureBackdrop
                src={backdrop}
                className={cn(
                    'aspect-[860/650] min-h-[280px] w-full overflow-hidden rounded-[12px]',
                    'px-6 py-6 sm:px-10 sm:py-8',
                    'md:col-span-8',
                )}
            >
                {visual}
            </FeatureBackdrop>
            {/* Text side — 4 cols, with ~3vw gap from image */}
            <div
                className={cn(
                    'flex w-full min-w-[200px] flex-col gap-3 pb-1 text-left md:col-span-4',
                    reverse ? 'md:pr-8' : 'md:pl-8',
                )}
            >
                <span className="text-style-tagline">{subtitle}</span>
                <h3 className="heading-style-h4 text-foreground-primary w-full tracking-tight">
                    {title}
                </h3>
                <p className="text-foreground-secondary w-full text-base leading-[1.3] font-light tracking-tight text-balance">
                    {paragraph}
                </p>
            </div>
        </motion.div>
    );
}

// ─── Visuals ─────────────────────────────────────────────────────────────
// All visuals follow the Model Agnostic recipe: monochrome surface, one
// brand-blue focal point, mono captions, tight type, subtle ambient cycle.

const BRAND = 'var(--foreground-brand)';
const BRAND_SOFT = 'color-mix(in srgb, var(--foreground-brand) 16%, transparent)';

function ComponentsVisual() {
    const items: {
        label: string;
        Icon: React.ComponentType<{ className?: string }>;
        meta: string;
    }[] = [
        { label: 'Button', Icon: Icons.Button, meta: 'ui' },
        { label: 'Card', Icon: Icons.Box, meta: 'layout' },
        { label: 'Hero', Icon: Icons.Section, meta: 'section' },
        { label: 'Navbar', Icon: Icons.Frame, meta: 'nav' },
        { label: 'Pricing', Icon: Icons.CreditCard, meta: 'section' },
        { label: 'Footer', Icon: Icons.Layers, meta: 'layout' },
    ];
    const cycle = useAmbientCycle(items.length, 2200);
    return (
        <div
            className="flex h-[360px] w-full max-w-sm flex-col overflow-hidden rounded-[16px] border border-black/[0.06] bg-white shadow-[0_6px_20px_-10px_rgba(0,0,0,0.18)] dark:border-0 dark:bg-[#1C1C1D] dark:shadow-[0_6px_20px_-10px_rgba(0,0,0,0.6)]"
            onMouseEnter={cycle.onMouseEnter}
            onMouseLeave={cycle.onMouseLeave}
        >
            <div className="flex shrink-0 items-center justify-between border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
                <span className="text-style-tagline">Components</span>
                <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3" />
            </div>
            <div className="flex flex-1 flex-col gap-0.5 overflow-hidden p-1.5">
                {items.map((it, idx) => {
                    const isActive = idx === cycle.index;
                    return (
                        <button
                            key={it.label}
                            type="button"
                            onClick={() => cycle.setIndex(idx)}
                            className="group/row hover:bg-foreground-primary/[0.04] relative flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors duration-150"
                        >
                            {isActive && (
                                <motion.span
                                    layoutId="components-active"
                                    transition={{
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 34,
                                        mass: 0.45,
                                    }}
                                    className="bg-foreground-primary/[0.06] ring-foreground-primary/10 pointer-events-none absolute inset-0 rounded-[10px] ring-1 ring-inset"
                                    aria-hidden
                                />
                            )}
                            <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                                <it.Icon
                                    className={cn(
                                        'h-3.5 w-3.5 transition-colors duration-150',
                                        isActive
                                            ? 'text-foreground-secondary'
                                            : 'text-foreground-tertiary',
                                    )}
                                />
                            </span>
                            <span
                                className={cn(
                                    'text-small relative flex-1 font-light tracking-tight transition-colors duration-150',
                                    isActive
                                        ? 'text-foreground-primary'
                                        : 'text-foreground-secondary',
                                )}
                            >
                                {it.label}
                            </span>
                            <span className="text-foreground-tertiary text-mini relative font-mono tabular-nums">
                                {it.meta}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function BrandVisual() {
    const colorTokens: {
        name: string;
        hex: string;
        swatch: string;
        active?: boolean;
    }[] = [
        { name: 'background', hex: '#131314', swatch: 'bg-background' },
        {
            name: 'background-secondary',
            hex: '#1F1F1F',
            swatch: 'bg-background-secondary',
        },
        { name: 'foreground', hex: '#F9F9F9', swatch: 'bg-foreground' },
        {
            name: 'foreground-secondary',
            hex: '#E8E8E8/60',
            swatch: 'bg-foreground-secondary',
        },
        {
            name: 'foreground-brand',
            hex: '#0F9BFF',
            swatch: 'bg-foreground-brand',
            active: true,
        },
    ];
    const typeTokens: {
        name: string;
        sample: string;
        meta: string;
        mono?: boolean;
    }[] = [
        { name: 'Inter', sample: 'Aa', meta: 'Sans · 16/24' },
        { name: 'Berkeley Mono', sample: 'Aa', meta: 'Mono · 13/20', mono: true },
    ];
    return (
        <div className="flex h-[360px] w-full max-w-sm flex-col overflow-hidden rounded-[16px] border border-black/[0.06] bg-white shadow-[0_6px_20px_-10px_rgba(0,0,0,0.18)] dark:border-0 dark:bg-[#1C1C1D] dark:shadow-[0_6px_20px_-10px_rgba(0,0,0,0.6)]">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
                <div className="text-style-tagline">Tokens</div>
                <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3" />
            </div>

            {/* Colors */}
            <div className="flex flex-col gap-0.5 p-1.5">
                <div className="text-style-tagline mb-1 px-3 pt-1">Colors</div>
                {colorTokens.map((token) => (
                    <div
                        key={token.name}
                        className={cn(
                            'group/token relative flex items-center gap-3 rounded-[10px] px-3 py-2 transition-colors duration-150',
                            token.active
                                ? 'bg-foreground-primary/[0.06] ring-foreground-primary/10 ring-1 ring-inset'
                                : 'hover:bg-foreground-primary/[0.03]',
                        )}
                    >
                        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                            <span
                                className={cn(
                                    'ring-foreground-primary/15 h-3.5 w-3.5 rounded-[3px] ring-1 ring-inset',
                                    token.swatch,
                                )}
                            />
                        </span>
                        <span
                            className={cn(
                                'flex-1 truncate font-mono text-[10.5px] font-light',
                                token.active
                                    ? 'text-foreground-primary'
                                    : 'text-foreground-secondary',
                            )}
                        >
                            {token.name}
                        </span>
                        <span className="text-foreground-tertiary font-mono text-[10px] tabular-nums">
                            {token.hex}
                        </span>
                        {token.active && (
                            <span
                                className="bg-foreground-brand ml-1 h-1.5 w-1.5 shrink-0 rounded-full"
                                aria-hidden
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Typography */}
            <div className="flex flex-col gap-0.5 border-t border-black/[0.05] p-1.5 dark:border-white/[0.06]">
                <div className="text-style-tagline mb-1 px-3 pt-1">Typography</div>
                {typeTokens.map((token) => (
                    <div
                        key={token.name}
                        className="hover:bg-foreground-primary/[0.03] flex items-center gap-3 rounded-[10px] px-3 py-2 transition-colors duration-150"
                    >
                        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                            <span
                                className={cn(
                                    'border-foreground-primary/10 bg-background-secondary text-foreground-primary inline-flex h-5 w-5 items-center justify-center rounded-[3px] border text-[11px] leading-none',
                                    token.mono && 'font-mono',
                                )}
                            >
                                {token.sample}
                            </span>
                        </span>
                        <span className="text-foreground-secondary flex-1 text-[11px] font-light tracking-tight">
                            {token.name}
                        </span>
                        <span className="text-foreground-tertiary font-mono text-[10px] tabular-nums">
                            {token.meta}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function LayersVisual() {
    const t = useTranslations('landing.whatCanWeblabDoV2');
    type LayerKind = 'body' | 'section' | 'div' | 'component';
    const layers: {
        name: string;
        kind: LayerKind;
        level: number;
        hasChildren?: boolean;
    }[] = [
        { name: 'Home Page', kind: 'body', level: 0, hasChildren: true },
        { name: 'TopNavigation', kind: 'component', level: 1 },
        { name: 'Hero', kind: 'section', level: 1, hasChildren: true },
        { name: 'ImageGrid', kind: 'div', level: 1, hasChildren: true },
        { name: 'ImageCard', kind: 'component', level: 2 },
        { name: 'ImageCard', kind: 'component', level: 2 },
        { name: 'ImageCard', kind: 'component', level: 2 },
        { name: 'Footer', kind: 'section', level: 1 },
    ];
    // Cycle a selection through component-tagged rows (skip non-components for variety)
    const componentIndices = layers
        .map((l, i) => (l.kind === 'component' ? i : -1))
        .filter((i) => i >= 0);
    const cycle = useAmbientCycle(componentIndices.length, 2400);
    const selectedIdx = componentIndices[cycle.index] ?? 4;

    return (
        <div
            className="flex h-[360px] w-full max-w-sm flex-col overflow-hidden rounded-[16px] border border-black/[0.06] bg-white shadow-[0_6px_20px_-10px_rgba(0,0,0,0.18)] dark:border-0 dark:bg-[#1C1C1D] dark:shadow-[0_6px_20px_-10px_rgba(0,0,0,0.6)]"
            onMouseEnter={cycle.onMouseEnter}
            onMouseLeave={cycle.onMouseLeave}
        >
            <div className="flex shrink-0 items-center justify-between border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
                <span className="text-style-tagline">{t('layersTitle')}</span>
                <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3" />
            </div>
            <div className="flex flex-1 flex-col gap-0.5 overflow-hidden p-1.5">
                {layers.map((l, idx) => {
                    const isSelected = idx === selectedIdx;
                    const isComponent = l.kind === 'component';
                    return (
                        <button
                            key={`${l.name}-${idx}`}
                            type="button"
                            onClick={() =>
                                cycle.setIndex(
                                    componentIndices.includes(idx)
                                        ? componentIndices.indexOf(idx)
                                        : cycle.index,
                                )
                            }
                            className={cn(
                                'group/layer text-small relative flex h-8 w-full items-center rounded-[10px] pr-1.5 font-light tracking-tight transition-colors duration-150',
                                isComponent
                                    ? 'hover:bg-foreground-primary/[0.04] text-purple-500/90 dark:text-purple-300/90'
                                    : 'text-foreground-secondary hover:bg-foreground-primary/[0.04]',
                            )}
                        >
                            {isSelected && (
                                <motion.span
                                    layoutId="layers-active-bg"
                                    transition={{
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 34,
                                        mass: 0.45,
                                    }}
                                    className="bg-foreground-primary/[0.06] ring-foreground-primary/10 pointer-events-none absolute inset-0 rounded-[10px] ring-1 ring-inset"
                                    aria-hidden
                                />
                            )}
                            {/* Indent */}
                            <div className="relative" style={{ width: `${l.level * 14}px` }} />
                            {/* Disclosure chevron */}
                            <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                                {l.hasChildren ? (
                                    <Icons.ChevronDown className="text-foreground-tertiary h-2.5 w-2.5 opacity-70" />
                                ) : null}
                            </span>
                            {/* Icon */}
                            <LayerKindIcon
                                kind={l.kind}
                                className={cn(
                                    'relative mr-2 ml-0.5 h-3.5 w-3.5 shrink-0',
                                    isComponent
                                        ? 'text-purple-500/90 dark:text-purple-300/90'
                                        : 'text-foreground-tertiary',
                                )}
                            />
                            <span
                                className={cn(
                                    'relative flex-1 truncate text-left',
                                    isComponent && 'italic',
                                )}
                            >
                                {l.name}
                            </span>
                            {/* Component "B" badge if interactive (Footer + ImageCards) — only show for first component to mimic real */}
                            {isComponent && isSelected && (
                                <span
                                    className={cn(
                                        'relative mr-1 flex h-4 min-w-4 items-center justify-center rounded border px-1 text-[10px] leading-none font-medium',
                                        'border-foreground-primary/20 bg-foreground-primary/[0.06] text-foreground-secondary',
                                    )}
                                >
                                    B
                                </span>
                            )}
                            {isSelected && (
                                <motion.span
                                    layoutId="layers-active-dot"
                                    transition={{
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 34,
                                        mass: 0.45,
                                    }}
                                    className="relative ml-1 flex h-1.5 w-1.5 shrink-0"
                                    aria-hidden
                                >
                                    <span className="bg-foreground-brand absolute inset-0 rounded-full" />
                                </motion.span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function LayerKindIcon({
    kind,
    className,
}: {
    kind: 'body' | 'section' | 'div' | 'component';
    className?: string;
}) {
    if (kind === 'body') return <Icons.Desktop className={className} />;
    if (kind === 'section') return <Icons.Section className={className} />;
    if (kind === 'component') return <Icons.Component className={className} />;
    return <Icons.Box className={className} />;
}

function RevisionVisual() {
    const t = useTranslations('landing.whatCanWeblabDoV2');
    const versions = [
        { title: 'New typography and layout', who: 'Alessandro · 3h ago' },
        { title: 'Save before publishing', who: 'Weblab · 10h ago' },
        { title: 'Added new background image', who: 'Sandra · 12h ago' },
        { title: 'Copy improvements and branding', who: 'Jonathan · 3d ago' },
    ];
    const cycle = useAmbientCycle(versions.length, 3000);
    return (
        <div
            className="flex h-[360px] w-full max-w-sm flex-col overflow-hidden rounded-[16px] border border-black/[0.06] bg-white shadow-[0_6px_20px_-10px_rgba(0,0,0,0.18)] dark:border-0 dark:bg-[#1C1C1D] dark:shadow-[0_6px_20px_-10px_rgba(0,0,0,0.6)]"
            onMouseEnter={cycle.onMouseEnter}
            onMouseLeave={cycle.onMouseLeave}
        >
            <div className="flex shrink-0 items-center gap-2 border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
                <Icons.CounterClockwiseClock className="text-foreground-tertiary h-3.5 w-3.5" />
                <span className="text-style-tagline">{t('revisionToday')}</span>
            </div>
            <div className="flex flex-1 flex-col gap-0.5 overflow-hidden p-1.5">
                {versions.map((v, idx) => {
                    const isActive = idx === cycle.index;
                    return (
                        <button
                            key={v.title}
                            type="button"
                            onClick={() => cycle.setIndex(idx)}
                            className="group/row hover:bg-foreground-primary/[0.03] relative flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left transition-colors duration-150"
                        >
                            {isActive && (
                                <motion.span
                                    layoutId="revision-active-bg"
                                    transition={{
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 34,
                                        mass: 0.45,
                                    }}
                                    className="bg-foreground-primary/[0.06] ring-foreground-primary/10 pointer-events-none absolute inset-0 rounded-[10px] ring-1 ring-inset"
                                    aria-hidden
                                />
                            )}
                            <div className="relative flex flex-col gap-0.5">
                                <span className="text-foreground-primary text-small font-light tracking-tight">
                                    {v.title}
                                </span>
                                <span className="text-foreground-tertiary text-mini font-mono">
                                    {v.who}
                                </span>
                            </div>
                            {isActive ? (
                                <motion.span
                                    layoutId="revision-active-pill"
                                    transition={{
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 34,
                                        mass: 0.45,
                                    }}
                                    className="text-mini relative rounded-full px-2 py-0.5 font-medium"
                                    style={{
                                        backgroundColor: BRAND_SOFT,
                                        color: BRAND,
                                    }}
                                >
                                    {t('revisionCurrent')}
                                </motion.span>
                            ) : (
                                <span className="text-foreground-tertiary border-foreground-primary/10 text-mini relative rounded-full border px-2 py-0.5 font-light opacity-0 transition-opacity duration-200 group-hover/row:opacity-100">
                                    Restore
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Code Panel — Xcode-style editor with typewriter animation ───────────

type CodeTok = {
    t: 'kw' | 'str' | 'jsx' | 'attr' | 'fn' | 'text' | 'punct' | 'ws';
    v: string;
};

// Theme-aware code-token colors via CSS vars. Light = Xcode, dark = VS Dark.
const CODE_TOKEN_VARS: Record<CodeTok['t'], string> = {
    kw: 'var(--code-kw)',
    str: 'var(--code-str)',
    jsx: 'var(--code-jsx)',
    attr: 'var(--code-attr)',
    fn: 'var(--code-fn)',
    text: 'var(--code-text)',
    punct: 'var(--code-punct)',
    ws: 'var(--code-text)',
};

const HOME_TOKENS: CodeTok[] = [
    { t: 'str', v: '"use client"' },
    { t: 'punct', v: ';' },
    { t: 'ws', v: '\n\n' },
    { t: 'kw', v: 'import' },
    { t: 'ws', v: ' ' },
    { t: 'text', v: 'React' },
    { t: 'punct', v: ', { ' },
    { t: 'text', v: 'useState' },
    { t: 'punct', v: ' } ' },
    { t: 'kw', v: 'from' },
    { t: 'ws', v: ' ' },
    { t: 'str', v: '"react"' },
    { t: 'punct', v: ';' },
    { t: 'ws', v: '\n' },
    { t: 'kw', v: 'import' },
    { t: 'ws', v: ' ' },
    { t: 'text', v: 'Navigation' },
    { t: 'ws', v: ' ' },
    { t: 'kw', v: 'from' },
    { t: 'ws', v: ' ' },
    { t: 'str', v: '"./Navigation"' },
    { t: 'punct', v: ';' },
    { t: 'ws', v: '\n' },
    { t: 'kw', v: 'import' },
    { t: 'ws', v: ' ' },
    { t: 'text', v: 'SupportChat' },
    { t: 'ws', v: ' ' },
    { t: 'kw', v: 'from' },
    { t: 'ws', v: ' ' },
    { t: 'str', v: '"./SupportChat"' },
    { t: 'punct', v: ';' },
    { t: 'ws', v: '\n\n' },
    { t: 'kw', v: 'export default function' },
    { t: 'ws', v: ' ' },
    { t: 'fn', v: 'Dashboard' },
    { t: 'punct', v: '() {' },
    { t: 'ws', v: '\n  ' },
    { t: 'kw', v: 'const' },
    { t: 'ws', v: ' ' },
    { t: 'punct', v: '[' },
    { t: 'text', v: 'activeTab' },
    { t: 'punct', v: ', ' },
    { t: 'text', v: 'setActiveTab' },
    { t: 'punct', v: '] = ' },
    { t: 'fn', v: 'useState' },
    { t: 'punct', v: '(' },
    { t: 'str', v: '"support"' },
    { t: 'punct', v: ');' },
    { t: 'ws', v: '\n\n  ' },
    { t: 'kw', v: 'return' },
    { t: 'ws', v: ' ' },
    { t: 'punct', v: '(' },
    { t: 'ws', v: '\n    ' },
    { t: 'punct', v: '<' },
    { t: 'jsx', v: 'div' },
    { t: 'ws', v: ' ' },
    { t: 'attr', v: 'className' },
    { t: 'punct', v: '=' },
    { t: 'str', v: '"flex h-[600px] border rounded-lg overflow-hidden"' },
    { t: 'punct', v: '>' },
    { t: 'ws', v: '\n      ' },
    { t: 'punct', v: '<' },
    { t: 'jsx', v: 'Chat' },
    { t: 'ws', v: ' ' },
    { t: 'punct', v: '/>' },
    { t: 'ws', v: '\n    ' },
    { t: 'punct', v: '</' },
    { t: 'jsx', v: 'div' },
    { t: 'punct', v: '>' },
    { t: 'ws', v: '\n  );' },
    { t: 'ws', v: '\n}' },
];

const TOTAL_CHARS = HOME_TOKENS.reduce((sum, tok) => sum + tok.v.length, 0);

function CodePanelVisual() {
    const [charCount, setCharCount] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (paused) return;
        if (charCount < TOTAL_CHARS) {
            const id = setTimeout(() => setCharCount((c) => c + 1), 14);
            return () => clearTimeout(id);
        }
        const id = setTimeout(() => setCharCount(0), 4200);
        return () => clearTimeout(id);
    }, [charCount, paused]);

    let consumed = 0;
    const fragments: React.ReactNode[] = [];
    for (let i = 0; i < HOME_TOKENS.length; i++) {
        const tok = HOME_TOKENS[i]!;
        const start = consumed;
        const end = consumed + tok.v.length;
        if (start >= charCount) break;
        const slice = end <= charCount ? tok.v : tok.v.slice(0, charCount - start);
        fragments.push(
            <span key={i} style={{ color: CODE_TOKEN_VARS[tok.t] }}>
                {slice}
            </span>,
        );
        consumed = end;
    }
    const typing = charCount < TOTAL_CHARS;

    return (
        <div
            className="w-full max-w-sm"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div
                className={cn(
                    'overflow-hidden rounded-[12px] border shadow-[0_10px_40px_-12px_rgba(0,0,0,0.25)]',
                    // Light: Xcode cream
                    'border-black/[0.06] bg-[#fbf6ed]',
                    // Dark: VS Code-style
                    'dark:border-0 dark:bg-[#1E1E1F]',
                )}
                style={
                    {
                        '--code-kw': '#AD3DA4',
                        '--code-str': '#D12F1B',
                        '--code-jsx': '#1F8E48',
                        '--code-attr': '#B85800',
                        '--code-fn': '#5C7BA1',
                        '--code-text': '#1F2024',
                        '--code-punct': '#4A4A4A',
                    } as React.CSSProperties
                }
            >
                <style>{`
                  .dark .code-panel-root {
                    --code-kw: #C586C0;
                    --code-str: #CE9178;
                    --code-jsx: #4EC9B0;
                    --code-attr: #9CDCFE;
                    --code-fn: #DCDCAA;
                    --code-text: #D4D4D4;
                    --code-punct: #808080;
                  }
                `}</style>
                <div className="code-panel-root">
                    {/* Title bar */}
                    <div className="relative flex items-center border-b border-black/[0.06] px-2.5 py-2 dark:border-white/[0.06]">
                        <div className="flex items-center gap-[5px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-black/20 dark:bg-white/20" />
                            <span className="h-1.5 w-1.5 rounded-full bg-black/20 dark:bg-white/20" />
                            <span className="h-1.5 w-1.5 rounded-full bg-black/20 dark:bg-white/20" />
                        </div>
                        <span className="absolute left-1/2 -translate-x-1/2 text-[9.5px] font-medium text-[#3a3a3a]/70 dark:text-white/55">
                            Weblab
                        </span>
                    </div>
                    {/* Tab bar — tighter, no vertical padding above tabs */}
                    <div className="flex items-end gap-0.5 border-b border-black/[0.06] bg-[#f1ebe0] px-1.5 pt-0.5 dark:border-white/[0.06] dark:bg-[#161617]">
                        <div className="-mb-px flex items-center gap-1.5 rounded-t-[6px] bg-[#fbf6ed] px-2.5 py-0.5 text-[10px] font-medium text-[#2a2a2a] dark:bg-[#1E1E1F] dark:text-white/85">
                            Home.tsx
                            <Icons.CrossS className="h-2 w-2 text-[#2a2a2a]/40 dark:text-white/40" />
                        </div>
                        <div className="px-2.5 py-0.5 text-[10px] text-[#2a2a2a]/50 dark:text-white/40">
                            Chat.tsx
                        </div>
                    </div>
                    {/* Code body */}
                    <pre className="min-h-[280px] px-4 py-3 font-mono text-[10px] leading-[1.55] whitespace-pre-wrap text-[var(--code-text)]">
                        {fragments}
                        {typing && (
                            <span
                                className="ml-0.5 inline-block h-2.5 w-[1.5px] translate-y-[1px] animate-pulse bg-[#2a2a2a] dark:bg-white/85"
                                aria-hidden
                            />
                        )}
                    </pre>
                </div>
            </div>
        </div>
    );
}

const FEATURE_KEYS = [
    'aiAssistant',
    'canvas',
    'code',
    'components',
    'brand',
    'structure',
    'history',
] as const;

const FEATURE_VISUALS: Record<(typeof FEATURE_KEYS)[number], React.ReactNode> = {
    aiAssistant: <FigmaAiAssistantVisual />,
    canvas: (
        <div className="w-full max-w-sm">
            <DirectEditingInteractive />
        </div>
    ),
    code: <CodePanelVisual />,
    components: <ComponentsVisual />,
    brand: <BrandVisual />,
    structure: <LayersVisual />,
    history: <RevisionVisual />,
};

const BACKDROPS: Record<(typeof FEATURE_KEYS)[number], string> = {
    aiAssistant: '/assets/landing/feature-backdrops/ivory.webp',
    canvas: '/assets/landing/feature-backdrops/sky.webp',
    code: '/assets/landing/feature-backdrops/sand.webp',
    components: '/assets/landing/feature-backdrops/mist.webp',
    brand: '/assets/landing/feature-backdrops/ivory.webp',
    structure: '/assets/landing/feature-backdrops/sand.webp',
    history: '/assets/landing/feature-backdrops/sky.webp',
};

export function WhatCanWeblabDoSectionV2() {
    const t = useTranslations('landing.whatCanWeblabDoV2') as (key: string) => string;
    return (
        <section className="mx-auto w-full max-w-[1400px] px-4 py-32 sm:px-6 md:px-8">
            <motion.div
                initial={REVEAL.initial}
                whileInView={REVEAL.whileInView}
                viewport={REVEAL.viewport}
                transition={REVEAL.transition}
                className="mb-20 grid grid-cols-1 gap-12 md:grid-cols-12 md:gap-x-14"
            >
                <h2 className="heading-style-h2 text-foreground-primary md:col-span-7">
                    {t('headingDesign')}, {t('headingCode')} & {t('headingAi')},
                    <br />
                    {t('headingSideBySide')}
                </h2>
                <div className="flex flex-col items-start justify-end gap-6 md:col-span-5">
                    <p className="text-foreground-secondary max-w-md text-base leading-[1.3] font-light tracking-tight">
                        {t('subhead')}
                    </p>
                    <Link
                        href={Routes.PROJECTS}
                        className="border-foreground/20 text-foreground hover:bg-background-secondary focus-visible:ring-foreground/40 focus-visible:ring-offset-background inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                        {t('cta')}
                        <Icons.ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </motion.div>
            <div className="flex flex-col gap-20 md:gap-28">
                {FEATURE_KEYS.map((key, i) => (
                    <FeatureCard
                        key={key}
                        subtitle={t(`features.${key}.subtitle`)}
                        title={t(`features.${key}.title`)}
                        paragraph={t(`features.${key}.paragraph`)}
                        visual={FEATURE_VISUALS[key]}
                        backdrop={BACKDROPS[key]}
                        reverse={i % 2 === 1}
                    />
                ))}
            </div>
        </section>
    );
}
