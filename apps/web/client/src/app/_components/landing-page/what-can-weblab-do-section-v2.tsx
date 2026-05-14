'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';
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
                            'radial-gradient(circle, color-mix(in srgb, var(--foreground-primary) 6%, transparent) 1px, transparent 1px)',
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
                    <span className="text-style-tagline">{subtitle}</span>
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

const BRAND = 'var(--foreground-brand)';
const BRAND_SOFT = 'color-mix(in srgb, var(--foreground-brand) 16%, transparent)';

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
            className="flex w-full max-w-[380px] flex-col gap-3"
        >
            {/* Chat history — mirrors design-system chat demo */}
            <div className="flex min-h-[180px] flex-col gap-2.5">
                <AnimatePresence>
                    {showUserMsg && (
                        <motion.div
                            key={`user-${convIdx}`}
                            initial={{ opacity: 0, y: 8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                            className="flex justify-end"
                        >
                            <div className="bg-background-muted text-small text-foreground-primary flex max-w-[85%] flex-col rounded-xl px-3 py-2 leading-snug tracking-[-0.005em]">
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
                            className="flex items-center gap-1 px-3 pt-1"
                        >
                            <span className="bg-foreground-tertiary h-1.5 w-1.5 animate-pulse rounded-full [animation-delay:-0.3s] [animation-duration:1.2s]" />
                            <span className="bg-foreground-tertiary h-1.5 w-1.5 animate-pulse rounded-full [animation-delay:-0.15s] [animation-duration:1.2s]" />
                            <span className="bg-foreground-tertiary h-1.5 w-1.5 animate-pulse rounded-full [animation-duration:1.2s]" />
                        </motion.div>
                    )}
                </AnimatePresence>
                {showAiReply && (
                    <div className="text-small text-foreground-primary flex flex-col gap-1.5 px-3 py-2 leading-snug tracking-[-0.005em]">
                        {conv.reply.slice(0, replyLen)}
                        {phase === 'ai-typing' && (
                            <span
                                className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse"
                                style={{ backgroundColor: 'var(--foreground-primary)' }}
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
                            className="bg-background-secondary/40 flex flex-col gap-2 rounded-md p-3"
                        >
                            <div className="text-foreground-tertiary/80 flex items-center gap-2">
                                <span
                                    className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2"
                                    style={{
                                        borderColor:
                                            'color-mix(in srgb, var(--foreground-primary) 15%, transparent)',
                                        borderTopColor: BRAND,
                                    }}
                                    aria-hidden
                                />
                                <span className="text-regularPlus text-foreground-primary font-mono text-[11px]">
                                    Editing {conv.tool}
                                </span>
                                <span className="text-foreground-tertiary text-mini ml-auto font-mono">
                                    running
                                </span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            {/* Composer — matches the real AiPromptComposer surface */}
            <div className="bg-background-secondary border-foreground-primary/5 flex w-full cursor-text flex-col rounded-xl border">
                <div className="text-small text-foreground-primary min-h-[44px] px-3 pt-3 leading-snug tracking-[-0.005em]">
                    {phase === 'typing-prompt' || phase === 'send-pause' ? (
                        <>
                            {conv.prompt.slice(0, promptLen)}
                            <span
                                className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] animate-pulse"
                                style={{ backgroundColor: BRAND }}
                                aria-hidden
                            />
                        </>
                    ) : (
                        <span className="text-foreground-primary/50">Ask anything…</span>
                    )}
                </div>
                <div className="flex w-full items-center justify-between px-2 py-1.5">
                    <div className="flex items-center gap-1">
                        <span className="text-foreground-tertiary inline-flex h-7 w-7 items-center justify-center">
                            <Icons.Image className="h-4 w-4" />
                        </span>
                        <span className="text-foreground-tertiary inline-flex h-7 w-7 items-center justify-center">
                            <Icons.Plus className="h-4 w-4" />
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="border-foreground-primary/10 inline-flex items-center gap-1.5 rounded-md border px-2 py-1">
                            <ClaudeIcon className="text-foreground-secondary h-3 w-3" />
                            <span className="text-foreground-secondary text-mini tracking-tight">
                                Claude Opus 4.7
                            </span>
                            <Icons.ChevronDown className="text-foreground-tertiary h-3 w-3" />
                        </span>
                        <span
                            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-200"
                            style={{
                                backgroundColor: inputHasText
                                    ? 'var(--foreground-primary)'
                                    : 'color-mix(in srgb, var(--foreground-primary) 10%, transparent)',
                            }}
                            aria-hidden
                        >
                            <Icons.ArrowRight
                                className="h-3.5 w-3.5"
                                style={{
                                    color: inputHasText
                                        ? 'var(--background)'
                                        : 'var(--foreground-tertiary)',
                                }}
                            />
                        </span>
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
    const colorTokens: { name: string; hex: string; swatch: string; active?: boolean }[] = [
        { name: 'background', hex: '#131314', swatch: 'bg-background' },
        { name: 'background-secondary', hex: '#1F1F1F', swatch: 'bg-background-secondary' },
        { name: 'foreground', hex: '#F9F9F9', swatch: 'bg-foreground' },
        { name: 'foreground-secondary', hex: '#E8E8E8/60', swatch: 'bg-foreground-secondary' },
        { name: 'foreground-brand', hex: '#0F9BFF', swatch: 'bg-foreground-brand', active: true },
    ];
    const typeTokens: { name: string; sample: string; meta: string; mono?: boolean }[] = [
        { name: 'Inter', sample: 'Aa', meta: 'Sans · 16/24' },
        { name: 'Berkeley Mono', sample: 'Aa', meta: 'Mono · 13/20', mono: true },
    ];
    return (
        <div className="border-foreground-primary/10 bg-background flex w-full max-w-sm flex-col overflow-hidden rounded-xl border">
            {/* Header */}
            <div className="border-foreground-primary/10 flex items-center justify-between border-b px-3 py-2">
                <div className="text-style-tagline">
                    Tokens
                </div>
                <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3" />
            </div>

            {/* Colors */}
            <div className="flex flex-col gap-1 px-2 py-2.5">
                <div className="text-style-tagline mb-0.5 px-1.5">
                    Colors
                </div>
                {colorTokens.map((t) => (
                    <div
                        key={t.name}
                        className={cn(
                            'group/token relative flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors',
                            t.active
                                ? 'bg-foreground-primary/[0.04]'
                                : 'hover:bg-foreground-primary/[0.03]',
                        )}
                    >
                        {t.active && (
                            <span
                                className="absolute top-1/2 -left-0.5 h-1 w-1 -translate-y-1/2 rounded-full"
                                style={{ backgroundColor: BRAND }}
                                aria-hidden
                            />
                        )}
                        <span
                            className={cn(
                                'ring-foreground-primary/15 h-3.5 w-3.5 shrink-0 rounded-[4px] ring-1 ring-inset',
                                t.swatch,
                            )}
                        />
                        <span
                            className={cn(
                                'flex-1 truncate font-mono text-[10.5px]',
                                t.active ? 'text-foreground-primary' : 'text-foreground-secondary',
                            )}
                        >
                            {t.name}
                        </span>
                        <span className="text-foreground-tertiary font-mono text-[9.5px] tabular-nums">
                            {t.hex}
                        </span>
                    </div>
                ))}
            </div>

            {/* Typography */}
            <div className="border-foreground-primary/10 flex flex-col gap-1 border-t px-2 py-2.5">
                <div className="text-style-tagline mb-0.5 px-1.5">
                    Typography
                </div>
                {typeTokens.map((t) => (
                    <div
                        key={t.name}
                        className="hover:bg-foreground-primary/[0.03] flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors"
                    >
                        <span
                            className={cn(
                                'border-foreground-primary/10 bg-background-secondary text-foreground-primary inline-flex h-6 w-7 items-center justify-center rounded-[4px] border text-[13px] leading-none',
                                t.mono && 'font-mono',
                            )}
                        >
                            {t.sample}
                        </span>
                        <span className="text-foreground-secondary flex-1 text-[10.5px] tracking-tight">
                            {t.name}
                        </span>
                        <span className="text-foreground-tertiary font-mono text-[9.5px] tabular-nums">
                            {t.meta}
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
    const layers: { name: string; kind: LayerKind; level: number; hasChildren?: boolean }[] = [
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
            className="border-foreground-primary/10 bg-background w-full max-w-sm overflow-hidden rounded-xl border"
            onMouseEnter={cycle.onMouseEnter}
            onMouseLeave={cycle.onMouseLeave}
        >
            <div className="border-foreground-primary/10 flex items-center justify-between border-b px-3 py-2">
                <span className="text-style-tagline">
                    {t('layersTitle')}
                </span>
                <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3" />
            </div>
            <div className="flex flex-col py-1.5">
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
                                'group/layer relative mx-1.5 flex h-6 w-[calc(100%-0.75rem)] items-center rounded pr-1 text-[11px] tracking-tight transition-colors',
                                isSelected
                                    ? 'bg-foreground-brand text-foreground-primary'
                                    : isComponent
                                      ? 'hover:bg-foreground-primary/[0.04] text-purple-500 dark:text-purple-300'
                                      : 'text-foreground-secondary hover:bg-foreground-primary/[0.04]',
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
                                    className="absolute top-1/2 -left-2 h-1 w-1 -translate-y-1/2 rounded-full"
                                    style={{ backgroundColor: BRAND }}
                                    aria-hidden
                                />
                            )}
                            {/* Indent */}
                            <div style={{ width: `${l.level * 14}px` }} />
                            {/* Disclosure chevron */}
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                {l.hasChildren ? (
                                    <Icons.ChevronDown
                                        className={cn(
                                            'h-2.5 w-2.5 opacity-70',
                                            isSelected
                                                ? 'text-foreground-primary'
                                                : 'text-foreground-tertiary',
                                        )}
                                    />
                                ) : null}
                            </span>
                            {/* Icon */}
                            <LayerKindIcon
                                kind={l.kind}
                                className={cn(
                                    'mr-1.5 ml-0.5 h-3 w-3 shrink-0',
                                    isSelected
                                        ? 'text-foreground-primary'
                                        : isComponent
                                          ? 'text-purple-500 dark:text-purple-300'
                                          : 'text-foreground-tertiary',
                                )}
                            />
                            <span
                                className={cn(
                                    'flex-1 truncate text-left font-light',
                                    isComponent && 'italic',
                                )}
                            >
                                {l.name}
                            </span>
                            {/* Component "B" badge if interactive (Footer + ImageCards) — only show for first component to mimic real */}
                            {isComponent && isSelected && (
                                <span
                                    className={cn(
                                        'mr-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded border px-1 text-[9px] leading-none font-semibold',
                                        'border-foreground-primary/30 bg-foreground-primary/10 text-foreground-primary',
                                    )}
                                >
                                    B
                                </span>
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
            className="border-foreground-primary/10 bg-background w-full max-w-sm overflow-hidden rounded-xl border"
            onMouseEnter={cycle.onMouseEnter}
            onMouseLeave={cycle.onMouseLeave}
        >
            <div className="border-foreground-primary/10 flex items-center gap-2 border-b px-4 py-3">
                <Icons.CounterClockwiseClock className="text-foreground-tertiary h-3.5 w-3.5" />
                <span className="text-style-tagline">
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
