'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';
import { NodeIcon } from '@weblab/ui/node-icon';
import { cn } from '@weblab/ui/utils';

import { vujahdayScript } from '@/app/fonts';
import { DirectEditingInteractive } from '../shared/mockups/direct-editing-interactive';
import { ClaudeIcon } from './provider-icons';

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
    icon: React.ReactNode;
    reverse?: boolean;
}

function FeatureCard({ visual, subtitle, title, paragraph, icon, reverse }: FeatureCardProps) {
    return (
        <motion.div
            initial={REVEAL.initial}
            whileInView={REVEAL.whileInView}
            viewport={REVEAL.viewport}
            transition={REVEAL.transition}
            className={cn(
                'grid grid-cols-1 items-center gap-4 md:grid-cols-2',
                reverse && 'md:[&>*:first-child]:order-2',
            )}
        >
            {/* Image side — only this gets a card */}
            <div
                className={cn(
                    'group/imgcard relative w-full overflow-hidden',
                    'rounded-2xl backdrop-blur-sm',
                    'hover:border-foreground-primary/20 transition-colors duration-200',
                    'flex items-center justify-center',
                    'aspect-[5/4] p-5 md:aspect-[4/3] md:p-10',
                )}
            >
                {/* Subtle dot grid backdrop — adds texture without competing with the widget */}
                <div
                    className="pointer-events-none absolute inset-0 opacity-40"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle, hsl(var(--foreground-primary) / 0.06) 1px, transparent 1px)',
                        backgroundSize: '18px 18px',
                    }}
                    aria-hidden
                />
                <div className="relative flex w-full items-center justify-center">{visual}</div>
            </div>
            {/* Text side — flat, no card */}
            <div className="flex w-full max-w-md flex-col items-center justify-center gap-2 justify-self-center text-left">
                <div className="text-foreground-tertiary mb-2 flex w-full items-center gap-2">
                    {icon}
                    <span className="text-mini font-mono tracking-wider uppercase">{subtitle}</span>
                </div>
                <h3 className="heading-style-h4 text-foreground-primary w-full tracking-tight">
                    {title}
                </h3>
                <p className="text-foreground-secondary mr-auto w-full text-base leading-relaxed font-light tracking-tight text-balance">
                    {paragraph}
                </p>
            </div>
        </motion.div>
    );
}

// ─── Visuals ─────────────────────────────────────────────────────────────
// All visuals follow the Model Agnostic recipe: monochrome surface, one
// brand-blue focal point, mono captions, tight type, subtle ambient cycle.

const BRAND = 'hsl(var(--foreground-brand))';
const BRAND_SOFT = 'hsl(var(--foreground-brand) / 0.16)';

// ─── AI Assistant — full conversation choreography ──────────────────────
// Cycles through prompt → user message → AI thinking → AI reply (typed) →
// tool call. Pauses on hover. Matches the real Weblab composer styling
// (rounded-xl input, model chip, footer controls).

type AiPhase = 'typing-prompt' | 'send-pause' | 'thinking' | 'ai-typing' | 'tool-call' | 'hold';

const AI_CONVERSATIONS = [
    {
        prompt: 'Add a dark mode toggle',
        reply: "I'll add a system-aware dark mode toggle with a smooth color transition.",
        tool: 'app/layout.tsx',
    },
    {
        prompt: 'Make this a pricing grid',
        reply: 'Converting the section to a 3-column pricing grid with a featured tier.',
        tool: 'sections/pricing.tsx',
    },
    {
        prompt: 'Refactor the hero with a video',
        reply: 'Adding a muted hero video with a poster fallback for first paint.',
        tool: 'sections/hero.tsx',
    },
] as const;

function AiAssistantVisual() {
    const [convIdx, setConvIdx] = useState(0);
    const [phase, setPhase] = useState<AiPhase>('typing-prompt');
    const [paused, setPaused] = useState(false);
    const [promptLen, setPromptLen] = useState(0);
    const [replyLen, setReplyLen] = useState(0);

    const conv = AI_CONVERSATIONS[convIdx]!;

    useEffect(() => {
        if (paused) return;

        if (phase === 'typing-prompt') {
            if (promptLen < conv.prompt.length) {
                const id = setTimeout(() => setPromptLen((n) => n + 1), 38);
                return () => clearTimeout(id);
            }
            const id = setTimeout(() => setPhase('send-pause'), 380);
            return () => clearTimeout(id);
        }
        if (phase === 'send-pause') {
            const id = setTimeout(() => setPhase('thinking'), 480);
            return () => clearTimeout(id);
        }
        if (phase === 'thinking') {
            const id = setTimeout(() => setPhase('ai-typing'), 880);
            return () => clearTimeout(id);
        }
        if (phase === 'ai-typing') {
            if (replyLen < conv.reply.length) {
                const id = setTimeout(() => setReplyLen((n) => n + 1), 22);
                return () => clearTimeout(id);
            }
            const id = setTimeout(() => setPhase('tool-call'), 360);
            return () => clearTimeout(id);
        }
        if (phase === 'tool-call') {
            const id = setTimeout(() => setPhase('hold'), 1600);
            return () => clearTimeout(id);
        }
        if (phase === 'hold') {
            const id = setTimeout(() => {
                setPromptLen(0);
                setReplyLen(0);
                setConvIdx((i) => (i + 1) % AI_CONVERSATIONS.length);
                setPhase('typing-prompt');
            }, 1400);
            return () => clearTimeout(id);
        }
    }, [phase, promptLen, replyLen, paused, conv.prompt, conv.reply]);

    const showUserMsg =
        phase === 'thinking' || phase === 'ai-typing' || phase === 'tool-call' || phase === 'hold';
    const showThinking = phase === 'thinking';
    const showAiReply = phase === 'ai-typing' || phase === 'tool-call' || phase === 'hold';
    const showToolCall = phase === 'tool-call' || phase === 'hold';
    const inputHasText =
        phase === 'typing-prompt' || phase === 'send-pause' ? promptLen > 0 : false;

    return (
        <div
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            className="border-foreground-primary/10 bg-background flex w-full max-w-[300px] flex-col overflow-hidden rounded-xl border"
        >
            {/* Chat history */}
            <div className="flex min-h-[180px] flex-col gap-2 p-2.5">
                <AnimatePresence>
                    {showUserMsg && (
                        <motion.div
                            key={`user-${convIdx}`}
                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                            className="flex justify-end"
                        >
                            <div className="bg-background-secondary text-foreground-primary text-small max-w-[80%] rounded-2xl rounded-tr-sm px-3 py-1.5 font-light tracking-tight">
                                {conv.prompt}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <AnimatePresence>
                    {showThinking && (
                        <motion.div
                            key={`thinking-${convIdx}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center gap-1 px-1 pt-0.5"
                        >
                            <span className="bg-foreground-tertiary h-1.5 w-1.5 animate-pulse rounded-full [animation-delay:-0.3s] [animation-duration:1.2s]" />
                            <span className="bg-foreground-tertiary h-1.5 w-1.5 animate-pulse rounded-full [animation-delay:-0.15s] [animation-duration:1.2s]" />
                            <span className="bg-foreground-tertiary h-1.5 w-1.5 animate-pulse rounded-full [animation-duration:1.2s]" />
                        </motion.div>
                    )}
                </AnimatePresence>
                {showAiReply && (
                    <div className="text-foreground-primary text-small px-1 leading-snug font-light tracking-tight">
                        {conv.reply.slice(0, replyLen)}
                        {phase === 'ai-typing' && (
                            <span
                                className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse"
                                style={{ backgroundColor: 'hsl(var(--foreground-primary))' }}
                                aria-hidden
                            />
                        )}
                    </div>
                )}
                <AnimatePresence>
                    {showToolCall && (
                        <motion.div
                            key={`tool-${convIdx}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                            className="border-foreground-primary/10 bg-background-secondary/60 mt-1 flex items-center justify-between rounded-lg border px-2 py-1.5"
                        >
                            <div className="flex items-center gap-1.5">
                                <span
                                    className="h-2.5 w-2.5 animate-spin rounded-full border"
                                    style={{
                                        borderColor: 'hsl(var(--foreground-primary) / 0.15)',
                                        borderTopColor: BRAND,
                                    }}
                                    aria-hidden
                                />
                                <span className="text-foreground-primary font-mono text-[10px] tracking-tight">
                                    {conv.tool}
                                </span>
                            </div>
                            <Icons.ChevronDown className="text-foreground-tertiary h-3 w-3" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            {/* Composer — matches real Weblab prompt input */}
            <div className="border-foreground-primary/10 bg-background-secondary/40 border-t p-2">
                <div className="bg-background border-foreground-primary/10 rounded-xl border px-2.5 py-2">
                    {/* Input line */}
                    <div className="text-small text-foreground-primary min-h-[18px] leading-tight font-light tracking-tight">
                        {phase === 'typing-prompt' || phase === 'send-pause' ? (
                            <>
                                {conv.prompt.slice(0, promptLen)}
                                <span
                                    className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse"
                                    style={{ backgroundColor: BRAND }}
                                    aria-hidden
                                />
                            </>
                        ) : (
                            <span className="text-foreground-tertiary font-light">
                                Ask anything…
                            </span>
                        )}
                    </div>
                    {/* Footer */}
                    <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                            <span className="border-foreground-primary/10 text-foreground-tertiary inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] tracking-tight">
                                <Icons.Plus className="h-2.5 w-2.5" />
                                Edit
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="border-foreground-primary/10 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5">
                                <ClaudeIcon className="text-foreground-secondary h-2.5 w-2.5" />
                                <span className="text-foreground-secondary text-[10px] font-light tracking-tight">
                                    Claude Opus 4.7
                                </span>
                            </span>
                            <span
                                className="flex h-5 w-5 items-center justify-center rounded-md transition-colors duration-200"
                                style={{
                                    backgroundColor: inputHasText
                                        ? BRAND
                                        : 'hsl(var(--foreground-primary) / 0.08)',
                                }}
                                aria-hidden
                            >
                                <Icons.ArrowRight
                                    className="h-3 w-3"
                                    style={{
                                        color: inputHasText
                                            ? 'white'
                                            : 'hsl(var(--foreground-tertiary))',
                                    }}
                                />
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ComponentsVisual() {
    const items = [
        { label: 'Button' },
        { label: 'Card' },
        { label: 'Hero' },
        { label: 'Nav' },
        { label: 'Pricing' },
        { label: 'Footer' },
    ];
    const cycle = useAmbientCycle(items.length, 2200);
    return (
        <div
            className="grid w-full max-w-sm grid-cols-3 gap-2.5"
            onMouseEnter={cycle.onMouseEnter}
            onMouseLeave={cycle.onMouseLeave}
        >
            {items.map((it, idx) => {
                const isActive = idx === cycle.index;
                return (
                    <button
                        key={it.label}
                        type="button"
                        onClick={() => cycle.setIndex(idx)}
                        className={cn(
                            'group/tile border-foreground-primary/10 bg-background relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border p-3 transition-all duration-200',
                            'hover:bg-foreground-primary/[0.04] hover:-translate-y-0.5',
                        )}
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
                                className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset"
                                style={{
                                    boxShadow: `inset 0 0 0 1.5px ${BRAND}`,
                                }}
                                aria-hidden
                            />
                        )}
                        <Icons.Component className="text-foreground-tertiary h-5 w-5 transition-transform duration-200 group-hover/tile:scale-110" />
                        <span className="text-foreground-secondary text-mini group-hover/tile:text-foreground-primary font-light tracking-tight transition-colors duration-200">
                            {it.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

function BrandVisual() {
    const t = useTranslations('landing.whatCanWeblabDoV2.brandVisual');
    const palette = [
        {
            nameKey: 'background',
            shades: ['bg-background', 'bg-background-secondary', 'bg-background-tertiary'],
        },
        {
            nameKey: 'foreground',
            shades: ['bg-foreground', 'bg-foreground-secondary', 'bg-foreground-tertiary'],
        },
        {
            nameKey: 'brand',
            shades: ['bg-foreground-brand', 'bg-foreground-brand/70', 'bg-foreground-brand/40'],
        },
    ] as const;
    return (
        <div className="border-foreground-primary/10 bg-background flex w-full max-w-sm flex-col gap-3.5 rounded-xl border p-5">
            <div className="text-foreground-tertiary text-mini font-mono tracking-wider uppercase">
                {t('tokens')}
            </div>
            {palette.map((row) => (
                <div key={row.nameKey} className="flex items-center justify-between gap-3">
                    <span className="text-foreground-secondary text-small font-light tracking-tight">
                        {t(row.nameKey)}
                    </span>
                    <div className="flex gap-1.5">
                        {row.shades.map((s) => (
                            <div
                                key={s}
                                className={cn(
                                    'ring-foreground-primary/10 h-5 w-5 rounded-full ring-1 transition-transform hover:scale-110',
                                    s,
                                )}
                            />
                        ))}
                    </div>
                </div>
            ))}
            <div className="border-foreground-primary/10 mt-1 flex items-center gap-2 border-t pt-3">
                <span
                    className="flex h-3.5 w-3.5 items-center justify-center rounded-full"
                    style={{ backgroundColor: BRAND_SOFT }}
                >
                    <Icons.Check className="h-2.5 w-2.5" style={{ color: BRAND }} />
                </span>
                <span className="text-foreground-secondary text-small font-light tracking-tight">
                    {t('onBrand')}
                </span>
            </div>
        </div>
    );
}

function LayersVisual() {
    const t = useTranslations('landing.whatCanWeblabDoV2');
    const layers = [
        { name: 'Home Page', tag: 'DIV', level: 0 },
        { name: 'Top Navigation', tag: 'COMPONENT', level: 1 },
        { name: 'Hero', tag: 'COMPONENT', level: 1 },
        { name: 'Image Grid', tag: 'DIV', level: 1 },
        { name: 'Image Card 1', tag: 'COMPONENT', level: 2 },
        { name: 'Image Card 2', tag: 'COMPONENT', level: 2 },
        { name: 'Image Card 3', tag: 'COMPONENT', level: 2 },
        { name: 'Footer', tag: 'COMPONENT', level: 1 },
    ];
    // Cycle a selection through component-tagged rows (skip plain DIVs)
    const componentIndices = layers
        .map((l, i) => (l.tag === 'COMPONENT' ? i : -1))
        .filter((i) => i >= 0);
    const cycle = useAmbientCycle(componentIndices.length, 2400);
    const selectedIdx = componentIndices[cycle.index] ?? 2;
    return (
        <div
            className="border-foreground-primary/10 bg-background w-full max-w-sm rounded-xl border p-2"
            onMouseEnter={cycle.onMouseEnter}
            onMouseLeave={cycle.onMouseLeave}
        >
            <div className="border-foreground-primary/10 flex items-center justify-between border-b px-2 pb-2">
                <span className="text-foreground-tertiary text-mini font-mono tracking-wider uppercase">
                    {t('layersTitle')}
                </span>
                <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3" />
            </div>
            <div className="mt-1.5 flex flex-col gap-0.5">
                {layers.map((l, idx) => {
                    const isSelected = idx === selectedIdx;
                    return (
                        <button
                            key={l.name}
                            type="button"
                            onClick={() =>
                                cycle.setIndex(
                                    componentIndices.includes(idx)
                                        ? componentIndices.indexOf(idx)
                                        : cycle.index,
                                )
                            }
                            className={cn(
                                'group/layer text-mini relative flex h-6 w-full items-center rounded-md px-1.5 tracking-tight transition-colors',
                                isSelected
                                    ? 'bg-foreground-primary/[0.06] text-foreground-primary'
                                    : 'text-foreground-secondary hover:bg-foreground-primary/[0.03]',
                            )}
                        >
                            {isSelected && (
                                <motion.span
                                    layoutId="layers-active-dot"
                                    transition={{
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 34,
                                        mass: 0.45,
                                    }}
                                    className="absolute top-1/2 -left-1 h-1 w-1 -translate-y-1/2 rounded-full"
                                    style={{ backgroundColor: BRAND }}
                                    aria-hidden
                                />
                            )}
                            <div style={{ width: `${l.level * 14}px` }} />
                            <NodeIcon
                                iconClass={cn(
                                    'mr-1.5 h-3 w-3 shrink-0',
                                    isSelected ? '' : 'text-foreground-tertiary',
                                )}
                                tagName={l.tag}
                            />
                            <span className="flex-1 truncate text-left font-light">{l.name}</span>
                            <span className="text-foreground-quadranary ml-1 font-mono text-[9px] opacity-0 transition-opacity duration-200 group-hover/layer:opacity-100">
                                {l.tag}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
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
            className="border-foreground-primary/10 bg-background w-full max-w-sm overflow-hidden rounded-xl border"
            onMouseEnter={cycle.onMouseEnter}
            onMouseLeave={cycle.onMouseLeave}
        >
            <div className="border-foreground-primary/10 flex items-center gap-2 border-b px-4 py-3">
                <Icons.CounterClockwiseClock className="text-foreground-tertiary h-3.5 w-3.5" />
                <span className="text-foreground-tertiary text-mini font-mono tracking-wider uppercase">
                    {t('revisionToday')}
                </span>
            </div>
            <div className="flex flex-col">
                {versions.map((v, idx) => {
                    const isActive = idx === cycle.index;
                    return (
                        <button
                            key={v.title}
                            type="button"
                            onClick={() => cycle.setIndex(idx)}
                            className={cn(
                                'group/row border-foreground-primary/10 relative flex items-center justify-between border-b px-4 py-3 text-left transition-colors last:border-b-0',
                                isActive
                                    ? 'bg-foreground-primary/[0.04]'
                                    : 'hover:bg-foreground-primary/[0.02]',
                            )}
                        >
                            {isActive && (
                                <motion.span
                                    layoutId="revision-active-dot"
                                    transition={{
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 34,
                                        mass: 0.45,
                                    }}
                                    className="absolute top-1/2 left-1.5 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
                                    style={{ backgroundColor: BRAND }}
                                    aria-hidden
                                />
                            )}
                            <div className="flex flex-col gap-0.5">
                                <span className="text-foreground-primary text-small font-light tracking-tight">
                                    {v.title}
                                </span>
                                <span className="text-foreground-tertiary font-mono text-[10px] tracking-tight">
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
                                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                    style={{
                                        backgroundColor: BRAND_SOFT,
                                        color: BRAND,
                                    }}
                                >
                                    {t('revisionCurrent')}
                                </motion.span>
                            ) : (
                                <span className="text-foreground-tertiary border-foreground-primary/10 rounded-full border px-2 py-0.5 text-[10px] font-light opacity-0 transition-opacity duration-200 group-hover/row:opacity-100">
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

const FEATURE_KEYS = [
    'aiAssistant',
    'canvas',
    'components',
    'brand',
    'structure',
    'history',
] as const;

const FEATURE_ICONS: Record<(typeof FEATURE_KEYS)[number], React.ReactNode> = {
    aiAssistant: <Icons.Sparkles className="h-4 w-4" />,
    canvas: <Icons.DirectManipulation className="h-4 w-4" />,
    components: <Icons.Component className="h-4 w-4" />,
    brand: <Icons.Brand className="h-4 w-4" />,
    structure: <Icons.Layers className="h-4 w-4" />,
    history: <Icons.CounterClockwiseClock className="h-4 w-4" />,
};

const FEATURE_VISUALS: Record<(typeof FEATURE_KEYS)[number], React.ReactNode> = {
    aiAssistant: <AiAssistantVisual />,
    canvas: (
        <div className="w-full max-w-sm">
            <DirectEditingInteractive />
        </div>
    ),
    components: <ComponentsVisual />,
    brand: <BrandVisual />,
    structure: <LayersVisual />,
    history: <RevisionVisual />,
};

export function WhatCanWeblabDoSectionV2() {
    const t = useTranslations('landing.whatCanWeblabDoV2') as (key: string) => string;
    return (
        <section className="mx-auto w-full max-w-6xl px-4 py-32 md:px-8">
            <motion.div
                initial={REVEAL.initial}
                whileInView={REVEAL.whileInView}
                viewport={REVEAL.viewport}
                transition={REVEAL.transition}
                className="mb-20 flex flex-col items-start gap-4"
            >
                <h2 className="heading-style-h2 text-foreground-primary">
                    <span className="text-foreground-primary">{t('headingAi')}</span>{' '}
                    <span className="text-foreground-tertiary">•</span>{' '}
                    <span className="font-mono">{t('headingCode')}</span>{' '}
                    <span className="text-foreground-tertiary">•</span>{' '}
                    <span
                        className={`${vujahdayScript.className} text-5xl not-italic md:text-6xl lg:text-7xl`}
                    >
                        {t('headingDesign')}
                    </span>
                    <br />
                    {t('headingSideBySide')}
                </h2>
                <p className="text-foreground-secondary max-w-xl text-base leading-relaxed font-light tracking-tight md:text-lg">
                    {t('subhead')}
                </p>
            </motion.div>
            <div className="flex flex-col gap-20 md:gap-28">
                {FEATURE_KEYS.map((key, i) => (
                    <FeatureCard
                        key={key}
                        icon={FEATURE_ICONS[key]}
                        subtitle={t(`features.${key}.subtitle`)}
                        title={t(`features.${key}.title`)}
                        paragraph={t(`features.${key}.paragraph`)}
                        visual={FEATURE_VISUALS[key]}
                        reverse={i % 2 === 1}
                    />
                ))}
            </div>
        </section>
    );
}
