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
    const collections: {
        name: string;
        count: string;
        Icon: React.ComponentType<{ className?: string }>;
        active?: boolean;
    }[] = [
        { name: 'Posts', count: '24', Icon: Icons.File, active: true },
        { name: 'Pages', count: '8', Icon: Icons.Copy },
        { name: 'Authors', count: '5', Icon: Icons.Person },
        { name: 'Media', count: '37', Icon: Icons.Image },
    ];
    const entries: { title: string; slug: string; status: Status; updated: string }[] = [
        {
            title: 'Launching Weblab CMS',
            slug: '/launching-weblab-cms',
            status: 'Published',
            updated: '2h',
        },
        {
            title: 'Design tokens, explained',
            slug: '/design-tokens',
            status: 'Published',
            updated: '1d',
        },
        {
            title: 'How we built the canvas',
            slug: '/building-the-canvas',
            status: 'Draft',
            updated: '3d',
        },
        { title: 'Q3 product roadmap', slug: '/q3-roadmap', status: 'Scheduled', updated: '5d' },
    ];
    const cycle = useAmbientCycle(entries.length, 2200);
    return (
        <div
            className="flex h-[360px] w-full max-w-sm flex-col overflow-hidden rounded-[16px] border border-black/[0.06] bg-white shadow-[0_6px_20px_-10px_rgba(0,0,0,0.18)] dark:border-0 dark:bg-[#1C1C1D] dark:shadow-[0_6px_20px_-10px_rgba(0,0,0,0.6)]"
            onMouseEnter={cycle.onMouseEnter}
            onMouseLeave={cycle.onMouseLeave}
        >
            {/* Header — workspace breadcrumb */}
            <div className="flex shrink-0 items-center gap-1.5 border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
                <Icons.Cube className="text-foreground-tertiary h-3.5 w-3.5 shrink-0" />
                <span className="text-style-tagline">Content</span>
                <Icons.ChevronRight className="text-foreground-tertiary/60 h-2.5 w-2.5 shrink-0" />
                <span className="text-foreground-secondary text-small truncate font-light tracking-tight">
                    Posts
                </span>
            </div>
            {/* Two-pane: collections rail + entries table */}
            <div className="flex min-h-0 flex-1">
                {/* Collections rail */}
                <div className="flex w-[108px] shrink-0 flex-col gap-0.5 border-r border-black/[0.05] p-1.5 dark:border-white/[0.06]">
                    <span className="text-foreground-tertiary px-1.5 pt-0.5 pb-1 text-[10px] font-medium tracking-wide uppercase">
                        Collections
                    </span>
                    {collections.map((c) => (
                        <div
                            key={c.name}
                            className={cn(
                                'relative flex items-center gap-1.5 rounded-[8px] px-1.5 py-1.5',
                                c.active &&
                                    'bg-foreground-primary/[0.06] ring-foreground-primary/10 ring-1 ring-inset',
                            )}
                        >
                            <c.Icon
                                className={cn(
                                    'h-3.5 w-3.5 shrink-0',
                                    c.active
                                        ? 'text-foreground-secondary'
                                        : 'text-foreground-tertiary',
                                )}
                            />
                            <span
                                className={cn(
                                    'text-small flex-1 truncate font-light tracking-tight',
                                    c.active
                                        ? 'text-foreground-primary'
                                        : 'text-foreground-secondary',
                                )}
                            >
                                {c.name}
                            </span>
                            <span className="text-foreground-tertiary font-mono text-[10px] tabular-nums">
                                {c.count}
                            </span>
                        </div>
                    ))}
                    <div className="text-foreground-tertiary mt-auto flex items-center gap-1.5 rounded-[8px] px-1.5 py-1.5">
                        <Icons.Plus className="h-3.5 w-3.5 shrink-0 opacity-80" />
                        <span className="text-small font-light tracking-tight">New</span>
                    </div>
                </div>
                {/* Entries table */}
                <div className="flex min-w-0 flex-1 flex-col">
                    {/* Toolbar — search + new */}
                    <div className="flex shrink-0 items-center gap-2 border-b border-black/[0.04] px-2.5 py-2 dark:border-white/[0.05]">
                        <div className="bg-foreground-primary/[0.04] ring-foreground-primary/[0.06] flex flex-1 items-center gap-1.5 rounded-[7px] px-2 py-1 ring-1 ring-inset">
                            <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3 shrink-0" />
                            <span className="text-foreground-tertiary text-[11px] font-light">
                                Search posts…
                            </span>
                        </div>
                        <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-medium text-white"
                            style={{ backgroundColor: 'var(--foreground-brand)' }}
                        >
                            <Icons.Plus className="h-3 w-3" />
                            New
                        </span>
                    </div>
                    {/* Column header */}
                    <div className="text-foreground-tertiary grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 border-b border-black/[0.04] px-3 py-1.5 text-[10px] font-medium tracking-wide uppercase dark:border-white/[0.05]">
                        <span>Title</span>
                        <span>Status</span>
                        <span className="text-right">Upd</span>
                    </div>
                    {/* Rows */}
                    <div className="flex flex-1 flex-col gap-0.5 overflow-hidden p-1">
                        {entries.map((entry, idx) => {
                            const isActive = idx === cycle.index;
                            return (
                                <button
                                    key={entry.title}
                                    type="button"
                                    onClick={() => cycle.setIndex(idx)}
                                    className="group/row hover:bg-foreground-primary/[0.04] relative grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left transition-colors duration-150"
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
                                            className="bg-foreground-primary/[0.06] ring-foreground-primary/10 pointer-events-none absolute inset-0 rounded-[8px] ring-1 ring-inset"
                                            aria-hidden
                                        />
                                    )}
                                    <span className="relative flex min-w-0 flex-col gap-0.5">
                                        <span
                                            className={cn(
                                                'text-small truncate font-light tracking-tight transition-colors duration-150',
                                                isActive
                                                    ? 'text-foreground-primary'
                                                    : 'text-foreground-secondary',
                                            )}
                                        >
                                            {entry.title}
                                        </span>
                                        <span className="text-foreground-tertiary truncate font-mono text-[10px]">
                                            {entry.slug}
                                        </span>
                                    </span>
                                    <CmsStatusBadge status={entry.status} />
                                    <span className="text-foreground-tertiary text-mini relative text-right font-mono tabular-nums">
                                        {entry.updated}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function CmsStatusBadge({ status }: { status: 'Published' | 'Draft' | 'Scheduled' }) {
    if (status === 'Draft') {
        return (
            <span className="bg-foreground-primary/[0.06] relative inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium">
                <span
                    className="bg-foreground-primary/40 h-1.5 w-1.5 shrink-0 rounded-full"
                    aria-hidden
                />
                <span className="text-foreground-secondary">Draft</span>
            </span>
        );
    }
    const color = status === 'Published' ? 'var(--foreground-brand)' : 'var(--foreground-warning)';
    return (
        <span
            className="relative inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
                backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
                color,
            }}
        >
            <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden
            />
            {status}
        </span>
    );
}

function LayersVisual() {
    const t = useTranslations('landing.whatCanWeblabDoV2');
    type LayerKind = 'body' | 'section' | 'div' | 'component' | 'text';
    const layers: {
        name: string;
        kind: LayerKind;
        level: number;
        hasChildren?: boolean;
        tag?: string;
        badges?: { label: string; brand?: boolean }[];
        hidden?: boolean;
    }[] = [
        { name: 'Home Page', kind: 'body', level: 0, hasChildren: true, tag: 'body' },
        {
            name: 'TopNavigation',
            kind: 'component',
            level: 1,
            badges: [{ label: 'B', brand: true }],
        },
        { name: 'Hero', kind: 'section', level: 1, hasChildren: true, tag: 'section' },
        { name: 'Heading', kind: 'text', level: 2, tag: 'p' },
        { name: 'ImageGrid', kind: 'div', level: 1, hasChildren: true, tag: 'div' },
        { name: 'ImageCard', kind: 'component', level: 2 },
        { name: 'ImageCard', kind: 'component', level: 2 },
        { name: 'Footer', kind: 'section', level: 1, hidden: true, tag: 'section' },
    ];
    // Cycle a selection through component-tagged rows.
    const componentIndices = layers
        .map((l, i) => (l.kind === 'component' ? i : -1))
        .filter((i) => i >= 0);
    const cycle = useAmbientCycle(componentIndices.length, 2400);
    const selectedIdx = componentIndices[cycle.index] ?? 1;

    return (
        <div
            className="flex h-[360px] w-full max-w-sm flex-col overflow-hidden rounded-[16px] border border-black/[0.06] bg-white shadow-[0_6px_20px_-10px_rgba(0,0,0,0.18)] dark:border-0 dark:bg-[#1C1C1D] dark:shadow-[0_6px_20px_-10px_rgba(0,0,0,0.6)]"
            onMouseEnter={cycle.onMouseEnter}
            onMouseLeave={cycle.onMouseLeave}
        >
            <div className="flex shrink-0 items-center justify-between border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                    <span className="text-style-tagline">{t('layersTitle')}</span>
                    <span className="text-foreground-tertiary bg-foreground-primary/[0.06] rounded-full px-1.5 py-0.5 font-mono text-[9px] leading-none tabular-nums">
                        {layers.length}
                    </span>
                </div>
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
                                'group/layer text-small relative flex h-8 w-full items-center rounded-[8px] pr-1.5 font-light tracking-tight transition-colors duration-150',
                                'hover:bg-foreground-primary/[0.04]',
                                isComponent
                                    ? 'text-foreground-skill'
                                    : l.hidden
                                      ? 'text-foreground-tertiary'
                                      : 'text-foreground-secondary',
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
                                    className="bg-foreground-primary/[0.06] ring-foreground-primary/10 pointer-events-none absolute inset-0 rounded-[8px] ring-1 ring-inset"
                                    aria-hidden
                                />
                            )}
                            {isSelected && (
                                <motion.span
                                    layoutId="layers-active-bar"
                                    transition={{
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 34,
                                        mass: 0.45,
                                    }}
                                    className="bg-foreground-brand pointer-events-none absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full"
                                    aria-hidden
                                />
                            )}
                            {/* Indent guide rails */}
                            {Array.from({ length: l.level }).map((_, i) => (
                                <span
                                    key={i}
                                    className="relative h-full w-3.5 shrink-0 self-stretch"
                                    aria-hidden
                                >
                                    <span className="bg-foreground-primary/10 absolute top-0 bottom-0 left-[7px] w-px dark:bg-white/10" />
                                </span>
                            ))}
                            {/* Disclosure chevron */}
                            <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                                {l.hasChildren ? (
                                    <Icons.ChevronRight className="text-foreground-tertiary h-2.5 w-2.5 rotate-90 opacity-70" />
                                ) : null}
                            </span>
                            {/* Icon */}
                            <LayerKindIcon
                                kind={l.kind}
                                className={cn(
                                    'relative mr-1.5 ml-0.5 h-3.5 w-3.5 shrink-0',
                                    isComponent
                                        ? 'text-foreground-skill'
                                        : 'text-foreground-tertiary',
                                    l.hidden && 'opacity-70',
                                )}
                            />
                            <span
                                className={cn(
                                    'relative flex-1 truncate text-left',
                                    isComponent && 'italic',
                                    l.hidden && 'opacity-70',
                                )}
                            >
                                {l.name}
                            </span>
                            {/* Right cluster: element tag / badges + visibility */}
                            <span className="relative ml-1 flex shrink-0 items-center gap-1.5">
                                {l.badges ? (
                                    l.badges.map((b) => (
                                        <LayerBadgeChip key={b.label} brand={b.brand}>
                                            {b.label}
                                        </LayerBadgeChip>
                                    ))
                                ) : l.tag ? (
                                    <span className="text-foreground-tertiary/70 font-mono text-[9px] leading-none">
                                        {l.tag}
                                    </span>
                                ) : null}
                                {l.hidden ? (
                                    <Icons.EyeClosed className="text-foreground-tertiary h-3 w-3 opacity-80" />
                                ) : isSelected ? (
                                    <Icons.EyeOpen className="text-foreground-secondary h-3 w-3" />
                                ) : (
                                    <Icons.EyeOpen className="text-foreground-tertiary h-3 w-3 opacity-0 transition-opacity duration-150 group-hover/layer:opacity-70" />
                                )}
                            </span>
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
    kind: 'body' | 'section' | 'div' | 'component' | 'text';
    className?: string;
}) {
    if (kind === 'body') return <Icons.Desktop className={className} />;
    if (kind === 'section') return <Icons.Section className={className} />;
    if (kind === 'component') return <Icons.Component className={className} />;
    if (kind === 'text') return <Icons.Text className={className} />;
    return <Icons.Box className={className} />;
}

function LayerBadgeChip({ children, brand }: { children: React.ReactNode; brand?: boolean }) {
    return (
        <span
            className={cn(
                'flex h-3.5 min-w-3.5 items-center justify-center rounded border px-1 text-[9px] leading-none font-medium',
                brand
                    ? 'border-foreground-brand/30 bg-foreground-brand/10 text-foreground-brand'
                    : 'border-foreground-primary/15 bg-foreground-primary/[0.04] text-foreground-secondary',
            )}
        >
            {children}
        </span>
    );
}

function RevisionVisual() {
    const t = useTranslations('landing.whatCanWeblabDoV2');
    type Tint = 'brand' | 'violet' | 'emerald' | 'amber' | 'neutral';
    const versions: {
        title: string;
        author: string;
        time: string;
        initial: string;
        tint: Tint;
        add: number;
        del: number;
        group: 'today' | 'earlier';
    }[] = [
        {
            title: 'New typography and layout',
            author: 'Alessandro',
            time: '3h ago',
            initial: 'A',
            tint: 'brand',
            add: 18,
            del: 4,
            group: 'today',
        },
        {
            title: 'Save before publishing',
            author: 'Weblab',
            time: '10h ago',
            initial: 'W',
            tint: 'neutral',
            add: 6,
            del: 2,
            group: 'today',
        },
        {
            title: 'Added background image',
            author: 'Sandra',
            time: '12h ago',
            initial: 'S',
            tint: 'emerald',
            add: 24,
            del: 9,
            group: 'today',
        },
        {
            title: 'Copy and branding tweaks',
            author: 'Jonathan',
            time: '3d ago',
            initial: 'J',
            tint: 'amber',
            add: 9,
            del: 3,
            group: 'earlier',
        },
        {
            title: 'Initial draft',
            author: 'Alessandro',
            time: '4d ago',
            initial: 'A',
            tint: 'violet',
            add: 120,
            del: 0,
            group: 'earlier',
        },
    ];
    const cycle = useAmbientCycle(versions.length, 3000);
    // Inline hex so avatar tints render identically regardless of which Tailwind
    // color palettes the theme ships.
    const TINT_HEX: Partial<Record<Tint, string>> = {
        violet: '#8b5cf6',
        emerald: '#10b981',
        amber: '#f59e0b',
    };
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
            <div className="flex flex-1 flex-col overflow-hidden p-2">
                {versions.map((v, idx) => {
                    const isCurrent = idx === 0;
                    const isActive = idx === cycle.index;
                    const isLast = idx === versions.length - 1;
                    const isGroupEnd = !isLast && versions[idx + 1]!.group !== v.group;
                    const showDivider = idx > 0 && versions[idx - 1]!.group !== v.group;
                    return (
                        <React.Fragment key={`${v.title}-${idx}`}>
                            {showDivider && (
                                <div className="text-foreground-tertiary px-1 pt-2 pb-1 text-[10px] font-medium tracking-wide uppercase">
                                    Earlier
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => cycle.setIndex(idx)}
                                className="group/row relative flex w-full gap-3 text-left"
                            >
                                {/* Timeline rail — avatar node + connector */}
                                <div className="relative flex w-5 shrink-0 flex-col items-center">
                                    <span
                                        className={cn(
                                            'relative z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-medium',
                                            isCurrent
                                                ? 'bg-foreground-brand text-white'
                                                : v.tint === 'neutral'
                                                  ? 'bg-foreground-primary/[0.06] text-foreground-secondary ring-foreground-primary/10 ring-1 ring-inset'
                                                  : '',
                                        )}
                                        style={
                                            !isCurrent && TINT_HEX[v.tint]
                                                ? {
                                                      backgroundColor: `color-mix(in srgb, ${TINT_HEX[v.tint]} 20%, transparent)`,
                                                      color: TINT_HEX[v.tint],
                                                      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${TINT_HEX[v.tint]} 38%, transparent)`,
                                                  }
                                                : undefined
                                        }
                                    >
                                        {v.initial}
                                    </span>
                                    {!isLast && !isGroupEnd && (
                                        <span
                                            className="bg-foreground-primary/10 mt-1 w-px flex-1"
                                            aria-hidden
                                        />
                                    )}
                                </div>
                                {/* Content */}
                                <div className="group-hover/row:bg-foreground-primary/[0.03] relative flex flex-1 items-start justify-between gap-2 rounded-[8px] px-2 pt-1 pb-4 transition-colors">
                                    {isActive && (
                                        <motion.span
                                            layoutId="revision-active-bg"
                                            transition={{
                                                type: 'spring',
                                                stiffness: 380,
                                                damping: 34,
                                                mass: 0.45,
                                            }}
                                            className="bg-foreground-primary/[0.06] ring-foreground-primary/10 pointer-events-none absolute inset-0 rounded-[8px] ring-1 ring-inset"
                                            aria-hidden
                                        />
                                    )}
                                    <div className="relative flex min-w-0 flex-col gap-1">
                                        <span className="text-foreground-primary text-small truncate font-light tracking-tight">
                                            {v.title}
                                        </span>
                                        <span className="text-mini flex min-w-0 items-center gap-1.5 font-mono">
                                            <span className="text-foreground-tertiary truncate">
                                                {v.author} · {v.time}
                                            </span>
                                            <span className="text-foreground-success shrink-0">
                                                +{v.add}
                                            </span>
                                            <span
                                                className="shrink-0"
                                                style={{ color: 'var(--destructive)' }}
                                            >
                                                −{v.del}
                                            </span>
                                        </span>
                                    </div>
                                    {isCurrent ? (
                                        <span
                                            className="text-mini relative shrink-0 rounded-full px-2 py-0.5 font-medium"
                                            style={{ backgroundColor: BRAND_SOFT, color: BRAND }}
                                        >
                                            {t('revisionCurrent')}
                                        </span>
                                    ) : (
                                        <span
                                            className={cn(
                                                'text-foreground-secondary border-foreground-primary/15 text-mini relative shrink-0 rounded-full border px-2 py-0.5 font-light transition-opacity duration-200',
                                                isActive
                                                    ? 'opacity-100'
                                                    : 'opacity-0 group-hover/row:opacity-100',
                                            )}
                                        >
                                            Restore
                                        </span>
                                    )}
                                </div>
                            </button>
                        </React.Fragment>
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

// Typewriter pacing. Char-by-char (not token chunks) so the reveal reads as smooth,
// deliberate typing instead of multi-character tokens popping in at once.
const CHAR_DELAY_MS = 28; // per visible character of the current token
const WS_DELAY_MS = 14; // whitespace/newline tokens reveal whole (typing spaces reads as a stall)
const HOLD_MS = 4500; // pause on the finished file before looping

// Renders the code up to `tokenIdx` fully-revealed tokens, plus the first `charIdx`
// characters of the in-progress token. The loop rebuilds innerHTML each tick, so only
// the single newest character carries the fade keyframe — animating more would re-fire
// the fade on already-typed glyphs (whole-block flicker).
function buildTokenHtml(
    tokenIdx: number,
    charIdx: number,
    opts: { withCaret: boolean; animateNewest: boolean },
) {
    let html = '';
    // Fully-revealed tokens.
    for (let i = 0; i < tokenIdx; i++) {
        const tok = HOME_TOKENS[i]!;
        if (tok.t === 'ws') {
            html += escapeHtmlChars(tok.v);
            continue;
        }
        html += `<span style="color:${CODE_TOKEN_VARS[tok.t]};white-space:pre;">${escapeHtmlChars(tok.v)}</span>`;
    }
    // In-progress token, typed one character at a time.
    const cur = HOME_TOKENS[tokenIdx];
    if (cur && cur.t !== 'ws' && charIdx > 0) {
        const shown = cur.v.slice(0, charIdx);
        const head = escapeHtmlChars(shown.slice(0, -1));
        const last = escapeHtmlChars(shown.slice(-1));
        const lastSpan = opts.animateNewest
            ? `<span style="animation:code-char-in .12s ease-out both;">${last}</span>`
            : last;
        html += `<span style="color:${CODE_TOKEN_VARS[cur.t]};white-space:pre;">${head}${lastSpan}</span>`;
    }
    if (opts.withCaret) {
        const isComplete = tokenIdx >= HOME_TOKENS.length;
        const caretAnim = isComplete ? 'animation:code-caret-blink 1s steps(1) infinite;' : '';
        html += `<span aria-hidden="true" contenteditable="false" data-caret="true" style="display:inline-block;width:1.5px;height:14px;background:var(--code-caret);vertical-align:middle;transform:translateY(2px);margin-left:1px;${caretAnim}"></span>`;
    }
    return html;
}

// Full source rendered once with the same markup as the live editor — drives an
// invisible spacer that reserves the panel's final height up front. Identical markup
// means identical wrapping, so the typewriter never shifts layout as lines appear.
const FULL_CODE_HTML = buildTokenHtml(HOME_TOKENS.length, 0, {
    withCaret: false,
    animateNewest: false,
});

function CodePanelVisual() {
    const [interactive, setInteractive] = useState(false);
    const [selPos, setSelPos] = useState<{ top: number; left: number } | null>(null);
    const preRef = useRef<HTMLPreElement | null>(null);
    const tokenIdxRef = useRef(0);
    const charIdxRef = useRef(0);
    const pausedRef = useRef(false);
    const interactiveRef = useRef(false);
    const timeoutRef = useRef<number | null>(null);
    const total = HOME_TOKENS.length;

    // Imperative animation — drives pre.innerHTML directly so React never re-renders the
    // editable surface. After the first user interaction the loop stops and the DOM is
    // owned by the browser (contentEditable edits survive subsequent React re-renders).
    const renderTokens = useCallback((animateNewest: boolean) => {
        const pre = preRef.current;
        if (!pre) return;
        pre.innerHTML = buildTokenHtml(tokenIdxRef.current, charIdxRef.current, {
            withCaret: true,
            animateNewest,
        });
    }, []);

    const scheduleNext = useCallback(() => {
        if (interactiveRef.current || pausedRef.current) return;
        // Clear any in-flight timer so resume-after-pause can't double-schedule.
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        // Finished the file — hold, then reset and loop.
        if (tokenIdxRef.current >= total) {
            timeoutRef.current = window.setTimeout(() => {
                if (interactiveRef.current || pausedRef.current) return;
                tokenIdxRef.current = 0;
                charIdxRef.current = 0;
                renderTokens(false);
                scheduleNext();
            }, HOLD_MS);
            return;
        }
        const cur = HOME_TOKENS[tokenIdxRef.current]!;
        // Whitespace reveals whole; advance straight to the next token.
        if (cur.t === 'ws') {
            timeoutRef.current = window.setTimeout(() => {
                if (interactiveRef.current || pausedRef.current) return;
                tokenIdxRef.current += 1;
                charIdxRef.current = 0;
                renderTokens(false);
                scheduleNext();
            }, WS_DELAY_MS);
            return;
        }
        // Reveal the next character of the current token.
        timeoutRef.current = window.setTimeout(() => {
            if (interactiveRef.current || pausedRef.current) return;
            charIdxRef.current += 1;
            renderTokens(true);
            // Token fully typed — promote it and move on.
            if (charIdxRef.current >= cur.v.length) {
                tokenIdxRef.current += 1;
                charIdxRef.current = 0;
            }
            scheduleNext();
        }, CHAR_DELAY_MS);
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
        pre.innerHTML = buildTokenHtml(total, 0, { withCaret: false, animateNewest: false });
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
                  @keyframes code-char-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                  }
                  .code-panel-root pre::selection { background: rgba(38,37,30,0.18); }
                  .code-panel-root pre *::selection { background: rgba(38,37,30,0.18); }
                  .dark .code-panel-root pre::selection { background: rgba(86,156,214,0.32); }
                  .dark .code-panel-root pre *::selection { background: rgba(86,156,214,0.32); }
                `}</style>
                <div className="code-panel-root">
                    {/* Title bar — 28px (opaque, matches the AI assistant chrome) */}
                    <div className="relative flex h-7 items-center justify-between border-b border-[rgba(38,37,30,0.1)] bg-white/80 pr-3 pl-2 backdrop-blur-[24px] dark:border-white/[0.08] dark:bg-[#161617]">
                        <div className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full bg-[rgba(38,37,30,0.2)] dark:bg-white/[0.22]" />
                            <span className="size-2.5 rounded-full bg-[rgba(38,37,30,0.2)] dark:bg-white/[0.22]" />
                            <span className="size-2.5 rounded-full bg-[rgba(38,37,30,0.2)] dark:bg-white/[0.22]" />
                        </div>
                        <span className="absolute left-1/2 -translate-x-1/2 text-[12px] leading-[16px] text-[#26251e]/70 dark:text-white/70">
                            Weblab
                        </span>
                    </div>
                    {/* Tab bar — 30px (opaque, matches the AI assistant chrome) */}
                    <div className="relative flex h-[30px] items-stretch border-b border-[rgba(38,37,30,0.1)] bg-white/80 backdrop-blur-[24px] dark:border-white/[0.08] dark:bg-[#161617]">
                        <div className="flex items-center gap-2 border-r border-[rgba(38,37,30,0.1)] bg-[#f7f7f4] px-3 text-[12px] leading-[16px] text-[#26251e] dark:border-white/[0.08] dark:bg-[#1c1c1d] dark:text-white/90">
                            Home.tsx
                            <Icons.CrossS className="h-2.5 w-2.5 text-[#26251e]/40 dark:text-white/40" />
                        </div>
                        <div className="flex items-center gap-2 border-r border-[rgba(38,37,30,0.1)] px-3 text-[12px] leading-[16px] text-[#26251e]/60 dark:border-white/[0.08] dark:text-white/50">
                            Chat.tsx
                        </div>
                    </div>
                    {/* Code body — DOM is owned imperatively after first interaction so
                        contentEditable edits survive React re-renders. The invisible
                        spacer reserves the full height; the live editor overlays it so
                        the typewriter never grows the panel. */}
                    <div className="relative bg-[#f7f7f4] dark:bg-[#1c1c1d]">
                        <pre
                            aria-hidden
                            className="invisible px-7 pt-3 pb-4 font-mono text-[12px] leading-[20px] whitespace-pre-wrap"
                            dangerouslySetInnerHTML={{ __html: FULL_CODE_HTML }}
                        />
                        {/* Faux editor surface in a marketing mockup, not a real form
                            control. role/aria/tabIndex give the contentEditable <pre>
                            textbox semantics; <pre> just isn't in jsx-a11y's role
                            allow-list, so scope-disable the role-transition rule here. */}
                        {/* eslint-disable jsx-a11y/no-noninteractive-element-to-interactive-role */}
                        <pre
                            ref={preRef}
                            role="textbox"
                            aria-label="Code editor"
                            tabIndex={0}
                            className="absolute inset-0 cursor-text overflow-hidden px-7 pt-3 pb-4 font-mono text-[12px] leading-[20px] whitespace-pre-wrap text-[var(--code-text)] outline-none"
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
                        {/* eslint-enable jsx-a11y/no-noninteractive-element-to-interactive-role */}
                        {selPos && (
                            // Faux selection toolbar in a marketing mockup, not a real control.
                            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
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
