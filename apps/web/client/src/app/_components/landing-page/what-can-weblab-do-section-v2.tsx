'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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

function CmsVisual() {
    type Status = 'Published' | 'Draft' | 'Scheduled';
    const entries: { title: string; status: Status; updated: string }[] = [
        { title: 'Launching Weblab CMS', status: 'Published', updated: '2h' },
        { title: 'Design tokens, explained', status: 'Published', updated: '1d' },
        { title: 'How we built the canvas', status: 'Draft', updated: '3d' },
        { title: 'Q3 roadmap', status: 'Scheduled', updated: '5d' },
        { title: 'Hiring designers', status: 'Draft', updated: '1w' },
    ];
    const cycle = useAmbientCycle(entries.length, 2200);
    return (
        <div
            className="flex h-[360px] w-full max-w-sm flex-col overflow-hidden rounded-[16px] border border-black/[0.06] bg-white shadow-[0_6px_20px_-10px_rgba(0,0,0,0.18)] dark:border-0 dark:bg-[#1C1C1D] dark:shadow-[0_6px_20px_-10px_rgba(0,0,0,0.6)]"
            onMouseEnter={cycle.onMouseEnter}
            onMouseLeave={cycle.onMouseLeave}
        >
            <div className="flex shrink-0 items-center justify-between border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                    <span className="text-style-tagline">Posts</span>
                    <span className="text-foreground-tertiary font-mono text-[10px] tabular-nums">
                        {entries.length}
                    </span>
                </div>
                <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3" />
            </div>
            <div className="flex flex-1 flex-col gap-0.5 overflow-hidden p-1.5">
                {entries.map((entry, idx) => {
                    const isActive = idx === cycle.index;
                    return (
                        <button
                            key={entry.title}
                            type="button"
                            onClick={() => cycle.setIndex(idx)}
                            className="group/row hover:bg-foreground-primary/[0.04] relative flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors duration-150"
                        >
                            {isActive && (
                                <motion.span
                                    layoutId="cms-active"
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
                                <Icons.File
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
                                    'text-small relative flex-1 truncate font-light tracking-tight transition-colors duration-150',
                                    isActive
                                        ? 'text-foreground-primary'
                                        : 'text-foreground-secondary',
                                )}
                            >
                                {entry.title}
                            </span>
                            <CmsStatusDot status={entry.status} />
                            <span className="text-foreground-tertiary text-mini relative w-6 text-right font-mono tabular-nums">
                                {entry.updated}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function CmsStatusDot({ status }: { status: 'Published' | 'Draft' | 'Scheduled' }) {
    if (status === 'Published') {
        return (
            <span
                role="img"
                className="bg-foreground-brand relative h-1.5 w-1.5 shrink-0 rounded-full"
                aria-label="Published"
            />
        );
    }
    if (status === 'Scheduled') {
        return (
            <span
                role="img"
                className="border-foreground-primary/30 relative h-1.5 w-1.5 shrink-0 rounded-full border"
                aria-label="Scheduled"
            />
        );
    }
    return (
        <span
            role="img"
            className="bg-foreground-primary/20 relative h-1.5 w-1.5 shrink-0 rounded-full"
            aria-label="Draft"
        />
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

// ─── Code Panel — Figma-parity editor (228:17230) with token-reveal animation

type CodeTok = {
    t:
        | 'kw'
        | 'str'
        | 'quote'
        | 'text'
        | 'tag'
        | 'attr'
        | 'punct'
        | 'brace'
        | 'jsxvar'
        | 'destr'
        | 'destrvar'
        | 'ws';
    v: string;
};

const CODE_TOKEN_VARS: Record<CodeTok['t'], string> = {
    kw: 'var(--code-kw)',
    str: 'var(--code-str)',
    quote: 'var(--code-quote)',
    text: 'var(--code-text)',
    tag: 'var(--code-tag)',
    attr: 'var(--code-attr)',
    punct: 'var(--code-punct)',
    brace: 'var(--code-brace)',
    jsxvar: 'var(--code-jsxvar)',
    destr: 'var(--code-destr)',
    destrvar: 'var(--code-destrvar)',
    ws: 'inherit',
};

const HOME_TOKENS: CodeTok[] = [
    { t: 'quote', v: '"' },
    { t: 'str', v: 'use client' },
    { t: 'quote', v: '"' },
    { t: 'text', v: ';' },
    { t: 'ws', v: '\n\n' },

    { t: 'kw', v: 'import' },
    { t: 'text', v: ' React, { useState } ' },
    { t: 'kw', v: 'from' },
    { t: 'ws', v: ' ' },
    { t: 'quote', v: '"' },
    { t: 'str', v: 'react' },
    { t: 'quote', v: '"' },
    { t: 'text', v: ';' },
    { t: 'ws', v: '\n' },

    { t: 'kw', v: 'import' },
    { t: 'text', v: ' Navigation ' },
    { t: 'kw', v: 'from' },
    { t: 'ws', v: ' ' },
    { t: 'quote', v: '"' },
    { t: 'str', v: './Navigation' },
    { t: 'quote', v: '"' },
    { t: 'text', v: ';' },
    { t: 'ws', v: '\n' },

    { t: 'kw', v: 'import' },
    { t: 'text', v: ' SupportChat ' },
    { t: 'kw', v: 'from' },
    { t: 'ws', v: ' ' },
    { t: 'quote', v: '"' },
    { t: 'str', v: './SupportChat' },
    { t: 'quote', v: '"' },
    { t: 'text', v: ';' },
    { t: 'ws', v: '\n\n' },

    { t: 'kw', v: 'export default function' },
    { t: 'ws', v: ' ' },
    { t: 'destr', v: 'Dashboard() {' },
    { t: 'ws', v: '\n  ' },

    { t: 'kw', v: 'const' },
    { t: 'ws', v: ' ' },
    { t: 'destr', v: '[' },
    { t: 'destrvar', v: 'activeTab' },
    { t: 'destr', v: ', ' },
    { t: 'destrvar', v: 'setActiveTab' },
    { t: 'destr', v: '] ' },
    { t: 'text', v: '= ' },
    { t: 'destr', v: 'useState(' },
    { t: 'quote', v: '"' },
    { t: 'str', v: 'support' },
    { t: 'quote', v: '"' },
    { t: 'destr', v: ');' },
    { t: 'ws', v: '\n\n  ' },

    { t: 'kw', v: 'return' },
    { t: 'ws', v: ' ' },
    { t: 'destr', v: '(' },
    { t: 'ws', v: '\n    ' },

    { t: 'punct', v: '<' },
    { t: 'tag', v: 'div' },
    { t: 'ws', v: ' ' },
    { t: 'attr', v: 'className' },
    { t: 'text', v: '=' },
    { t: 'quote', v: '"' },
    { t: 'str', v: 'flex h-[600px] border rounded-lg overflow-hidden' },
    { t: 'quote', v: '"' },
    { t: 'punct', v: '>' },
    { t: 'ws', v: '\n      ' },

    { t: 'punct', v: '<' },
    { t: 'tag', v: 'div' },
    { t: 'ws', v: ' ' },
    { t: 'attr', v: 'className' },
    { t: 'text', v: '=' },
    { t: 'quote', v: '"' },
    { t: 'str', v: 'w-64 border-r' },
    { t: 'quote', v: '"' },
    { t: 'punct', v: '>' },
    { t: 'ws', v: '\n       ' },

    { t: 'punct', v: '<' },
    { t: 'tag', v: 'Navigation' },
    { t: 'ws', v: ' ' },
    { t: 'attr', v: 'activeTab' },
    { t: 'text', v: '=' },
    { t: 'brace', v: '{' },
    { t: 'jsxvar', v: 'activeTab' },
    { t: 'brace', v: '}' },
    { t: 'ws', v: ' ' },
    { t: 'attr', v: 'onSelectTab' },
    { t: 'text', v: '=' },
    { t: 'brace', v: '{' },
    { t: 'jsxvar', v: 'setActiveTab' },
    { t: 'brace', v: '}' },
    { t: 'punct', v: ' />' },
    { t: 'ws', v: '\n      ' },

    { t: 'punct', v: '</' },
    { t: 'tag', v: 'div' },
    { t: 'punct', v: '>' },
    { t: 'ws', v: '\n      ' },

    { t: 'punct', v: '<' },
    { t: 'tag', v: 'div' },
    { t: 'ws', v: ' ' },
    { t: 'attr', v: 'className' },
    { t: 'text', v: '=' },
    { t: 'quote', v: '"' },
    { t: 'str', v: 'w-80 border-l' },
    { t: 'quote', v: '"' },
    { t: 'punct', v: '>' },
    { t: 'ws', v: '\n        ' },

    { t: 'punct', v: '<' },
    { t: 'tag', v: 'Chat' },
    { t: 'punct', v: ' />' },
    { t: 'ws', v: '\n      ' },

    { t: 'punct', v: '</' },
    { t: 'tag', v: 'div' },
    { t: 'punct', v: '>' },
    { t: 'ws', v: '\n    ' },

    { t: 'punct', v: '</' },
    { t: 'tag', v: 'div' },
    { t: 'punct', v: '>' },
    { t: 'ws', v: '\n  ' },

    { t: 'destr', v: ');' },
    { t: 'ws', v: '\n' },
    { t: 'destr', v: '}' },
];

function escapeHtmlChars(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// `animateFromIndex` — only spans at/after this index get the fade-in keyframe.
// The loop rebuilds the whole innerHTML each tick, so animating every span would
// re-trigger the fade on all prior tokens (whole-block flicker). Animating only the
// newest token keeps the reveal clean — each glyph fades in exactly once.
function buildTokenHtml(count: number, opts: { animateFromIndex: number; withCaret: boolean }) {
    let html = '';
    for (let i = 0; i < count; i++) {
        const tok = HOME_TOKENS[i]!;
        if (tok.t === 'ws') {
            html += escapeHtmlChars(tok.v);
            continue;
        }
        const color = CODE_TOKEN_VARS[tok.t];
        const anim =
            i >= opts.animateFromIndex
                ? 'animation:code-token-in .24s cubic-bezier(.25,.46,.45,.94) both;'
                : '';
        html += `<span style="color:${color};white-space:pre;${anim}">${escapeHtmlChars(tok.v)}</span>`;
    }
    if (opts.withCaret) {
        const isComplete = count >= HOME_TOKENS.length;
        const caretAnim = isComplete
            ? 'animation:code-caret-blink 1s steps(1) infinite;'
            : '';
        html += `<span aria-hidden="true" contenteditable="false" data-caret="true" style="display:inline-block;width:1.5px;height:14px;background:var(--code-caret);vertical-align:middle;transform:translateY(2px);margin-left:1px;${caretAnim}"></span>`;
    }
    return html;
}

function CodePanelVisual() {
    const [interactive, setInteractive] = useState(false);
    const [selPos, setSelPos] = useState<{ top: number; left: number } | null>(null);
    const preRef = useRef<HTMLPreElement | null>(null);
    const revealedRef = useRef(0);
    const pausedRef = useRef(false);
    const interactiveRef = useRef(false);
    const timeoutRef = useRef<number | null>(null);
    const total = HOME_TOKENS.length;

    // Imperative animation — drives pre.innerHTML directly so React never re-renders the
    // editable surface. After the first user interaction the loop stops and the DOM is
    // owned by the browser (contentEditable edits survive subsequent React re-renders).
    const renderTokens = useCallback(
        (animateLast: boolean) => {
            const pre = preRef.current;
            if (!pre) return;
            pre.innerHTML = buildTokenHtml(revealedRef.current, {
                // Animate only the just-revealed token; everything before it is static.
                animateFromIndex: animateLast ? revealedRef.current - 1 : revealedRef.current,
                withCaret: true,
            });
        },
        [],
    );

    const scheduleNext = useCallback(() => {
        if (interactiveRef.current || pausedRef.current) return;
        // Clear any in-flight timer so resume-after-pause can't double-schedule.
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        const idx = revealedRef.current;
        if (idx >= total) {
            timeoutRef.current = window.setTimeout(() => {
                if (interactiveRef.current || pausedRef.current) return;
                revealedRef.current = 0;
                renderTokens(false);
                scheduleNext();
            }, 4500);
            return;
        }
        const delay = HOME_TOKENS[idx]?.t === 'ws' ? 24 : 52;
        timeoutRef.current = window.setTimeout(() => {
            if (interactiveRef.current || pausedRef.current) return;
            revealedRef.current = idx + 1;
            renderTokens(true);
            scheduleNext();
        }, delay);
    }, [total, renderTokens]);

    useEffect(() => {
        renderTokens(false);
        scheduleNext();
        return () => {
            if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
        };
    }, [renderTokens, scheduleNext]);

    // On enter-interactive: stop animation, render full content without caret, focus pre.
    useEffect(() => {
        if (!interactive) return;
        const pre = preRef.current;
        if (!pre) return;
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        pre.innerHTML = buildTokenHtml(total, { animateFromIndex: total, withCaret: false });
        pre.focus({ preventScroll: true });
        const range = document.createRange();
        range.selectNodeContents(pre);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    }, [interactive, total]);

    useEffect(() => {
        function onSelChange() {
            const pre = preRef.current;
            const sel = typeof window !== 'undefined' ? window.getSelection() : null;
            if (!pre || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
                setSelPos(null);
                return;
            }
            const range = sel.getRangeAt(0);
            if (!pre.contains(range.commonAncestorContainer)) {
                setSelPos(null);
                return;
            }
            const rect = range.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
                setSelPos(null);
                return;
            }
            const preRect = pre.getBoundingClientRect();
            setSelPos({
                top: rect.top - preRect.top,
                left: rect.left + rect.width / 2 - preRect.left,
            });
        }
        document.addEventListener('selectionchange', onSelChange);
        return () => document.removeEventListener('selectionchange', onSelChange);
    }, []);

    const enterInteractive = () => {
        if (interactiveRef.current) return;
        interactiveRef.current = true;
        setInteractive(true);
    };

    const dismissSelection = () => {
        if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
        setSelPos(null);
    };

    const onPanelEnter = () => {
        pausedRef.current = true;
    };
    const onPanelLeave = () => {
        pausedRef.current = false;
        // Resume the typing loop — pause alone dead-ends the timer chain.
        if (!interactiveRef.current) scheduleNext();
    };

    return (
        <div
            className="w-full max-w-[560px]"
            onMouseEnter={onPanelEnter}
            onMouseLeave={onPanelLeave}
        >
            <div
                className={cn(
                    'overflow-hidden rounded-[10px]',
                    'shadow-[0_28px_70px_-12px_rgba(0,0,0,0.14),0_14px_32px_-8px_rgba(0,0,0,0.1),0_0_0_1px_rgba(38,37,30,0.1)]',
                    'bg-[rgba(250,250,250,0.5)] backdrop-blur-[12px]',
                    'dark:bg-[rgba(28,28,29,0.55)]',
                    'dark:shadow-[0_28px_70px_-12px_rgba(0,0,0,0.45),0_14px_32px_-8px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)]',
                )}
                style={
                    {
                        '--code-kw': '#b3003f',
                        '--code-str': '#aa52a2',
                        '--code-quote': '#9e94d5',
                        '--code-text': 'rgba(20,20,20,0.92)',
                        '--code-tag': '#1f8a65',
                        '--code-attr': '#6049b3',
                        '--code-punct': 'rgba(20,20,20,0.68)',
                        '--code-brace': '#427986',
                        '--code-jsxvar': '#c08532',
                        '--code-destr': '#db704b',
                        '--code-destrvar': '#206595',
                        '--code-caret': '#26251e',
                    } as React.CSSProperties
                }
            >
                <style>{`
                  .dark .code-panel-root {
                    --code-kw: #c586c0;
                    --code-str: #ce9178;
                    --code-quote: #ce9178;
                    --code-text: rgba(229,229,229,0.92);
                    --code-tag: #4ec9b0;
                    --code-attr: #9cdcfe;
                    --code-punct: rgba(229,229,229,0.55);
                    --code-brace: #dcdcaa;
                    --code-jsxvar: #dcdcaa;
                    --code-destr: #569cd6;
                    --code-destrvar: #9cdcfe;
                    --code-caret: rgba(255,255,255,0.85);
                  }
                  @keyframes code-caret-blink {
                    0%, 50% { opacity: 1; }
                    50.01%, 100% { opacity: 0; }
                  }
                  @keyframes code-token-in {
                    from { opacity: 0; filter: blur(2px); }
                    to { opacity: 1; filter: blur(0); }
                  }
                  .code-panel-root pre::selection { background: rgba(38,37,30,0.18); }
                  .code-panel-root pre *::selection { background: rgba(38,37,30,0.18); }
                  .dark .code-panel-root pre::selection { background: rgba(86,156,214,0.32); }
                  .dark .code-panel-root pre *::selection { background: rgba(86,156,214,0.32); }
                `}</style>
                <div className="code-panel-root">
                    {/* Title bar — 28px */}
                    <div className="relative flex h-7 items-center justify-between border-b border-[rgba(38,37,30,0.1)] pr-3 pl-2 dark:border-white/[0.08]">
                        <div className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full bg-[rgba(38,37,30,0.2)] dark:bg-white/[0.22]" />
                            <span className="size-2.5 rounded-full bg-[rgba(38,37,30,0.2)] dark:bg-white/[0.22]" />
                            <span className="size-2.5 rounded-full bg-[rgba(38,37,30,0.2)] dark:bg-white/[0.22]" />
                        </div>
                        <span className="absolute left-1/2 -translate-x-1/2 text-[12px] leading-[16px] text-[#26251e]/70 dark:text-white/70">
                            Weblab
                        </span>
                    </div>
                    {/* Tab bar — 30px */}
                    <div className="relative flex h-[30px] items-stretch border-b border-[rgba(38,37,30,0.1)] dark:border-white/[0.08]">
                        <div className="flex items-center gap-2 border-r border-[rgba(38,37,30,0.1)] bg-[#f7f7f4] px-3 text-[12px] leading-[16px] text-[#26251e] dark:border-white/[0.08] dark:bg-[#1c1c1d] dark:text-white/90">
                            Home.tsx
                            <Icons.CrossS className="h-2.5 w-2.5 text-[#26251e]/40 dark:text-white/40" />
                        </div>
                        <div className="flex items-center gap-2 border-r border-[rgba(38,37,30,0.1)] px-3 text-[12px] leading-[16px] text-[#26251e]/60 dark:border-white/[0.08] dark:text-white/50">
                            Chat.tsx
                        </div>
                    </div>
                    {/* Code body — DOM is owned imperatively after first interaction so
                        contentEditable edits survive React re-renders. */}
                    <div className="relative">
                        <pre
                            ref={preRef}
                            className="relative min-h-[380px] cursor-text bg-[#f7f7f4] px-7 pt-3 pb-4 font-mono text-[12px] leading-[20px] whitespace-pre-wrap text-[var(--code-text)] outline-none dark:bg-[#1c1c1d]"
                            contentEditable
                            suppressContentEditableWarning
                            spellCheck={false}
                            onMouseDown={enterInteractive}
                            onFocus={enterInteractive}
                            onKeyDown={enterInteractive}
                        >
                            {/* DOM is owned by imperative useEffect — keep this body empty so
                                React never reconciles children into the editable surface. */}
                        </pre>
                        {selPos && (
                            <div
                                contentEditable={false}
                                className="pointer-events-none absolute z-20"
                                style={{
                                    top: Math.max(4, selPos.top - 38),
                                    left: selPos.left,
                                    transform: 'translateX(-50%)',
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                            >
                                <div className="pointer-events-auto flex items-stretch overflow-hidden rounded-[8px] border border-[rgba(38,37,30,0.12)] bg-[rgba(250,250,250,0.95)] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25),0_2px_8px_-2px_rgba(0,0,0,0.12)] backdrop-blur-md dark:border-white/10 dark:bg-[rgba(28,28,29,0.95)] dark:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]">
                                    <button
                                        type="button"
                                        onClick={dismissSelection}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 transition-colors hover:bg-[rgba(38,37,30,0.06)] dark:hover:bg-white/[0.06]"
                                    >
                                        <span className="text-[11px] leading-[14px] font-medium whitespace-nowrap text-[#26251e] dark:text-white/90">
                                            Add to Chat
                                        </span>
                                        <span className="text-[10.5px] leading-[14px] text-[#26251e]/45 dark:text-white/40">
                                            ⌘L
                                        </span>
                                    </button>
                                    <span className="my-1 w-px self-stretch bg-[rgba(38,37,30,0.12)] dark:bg-white/10" />
                                    <button
                                        type="button"
                                        onClick={dismissSelection}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 transition-colors hover:bg-[rgba(38,37,30,0.06)] dark:hover:bg-white/[0.06]"
                                    >
                                        <span className="text-[11px] leading-[14px] font-medium whitespace-nowrap text-[#26251e] dark:text-white/90">
                                            Quick Edit
                                        </span>
                                        <span className="text-[10.5px] leading-[14px] text-[#26251e]/45 dark:text-white/40">
                                            ⌘K
                                        </span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
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
    'cms',
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
    cms: <CmsVisual />,
    structure: <LayersVisual />,
    history: <RevisionVisual />,
};

const BACKDROPS: Record<(typeof FEATURE_KEYS)[number], string> = {
    aiAssistant: '/assets/landing/feature-backdrops/ivory.webp',
    canvas: '/assets/landing/feature-backdrops/sky.webp',
    code: '/assets/landing/feature-backdrops/sand.webp',
    components: '/assets/landing/feature-backdrops/mist.webp',
    cms: '/assets/landing/feature-backdrops/ivory.webp',
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
