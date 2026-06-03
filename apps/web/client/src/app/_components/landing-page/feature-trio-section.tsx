'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { FEATURE_BACKDROP_SRCS, FeatureBackdrop } from './feature-backdrop';
import { ClaudeIcon, DeepSeekIcon, GeminiIcon, KimiIcon, OpenAIIcon } from './provider-icons';

const REVEAL = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

/* ──────────────────────────────────────────────────────────────────────────
 * Card shell — soft backdrop, theme-aware. Asset floats centered.
 * Backdrop: subtle top wash (light cool tint on light, deep wash on dark).
 * ────────────────────────────────────────────────────────────────────────── */

interface FeatureTrioCardProps {
    visual: React.ReactNode;
    eyebrow: string;
    title: string;
    body: string;
    bgSrc: string;
}

function FeatureTrioCard({ visual, eyebrow, title, body, bgSrc }: FeatureTrioCardProps) {
    return (
        <motion.div
            initial={REVEAL.initial}
            whileInView={REVEAL.whileInView}
            viewport={REVEAL.viewport}
            transition={REVEAL.transition}
            className="flex flex-col gap-5"
        >
            <FeatureBackdrop src={bgSrc} className="aspect-square w-full rounded-[12px] p-6">
                {visual}
            </FeatureBackdrop>

            {/* Text */}
            <div className="flex flex-col gap-1 pt-1">
                <span className="text-style-tagline">{eyebrow}</span>
                <h3 className="text-foreground-primary text-lg font-medium tracking-tight">
                    {title}
                </h3>
                <p className="text-foreground-secondary text-sm leading-[1.3] font-light tracking-tight">
                    {body}
                </p>
            </div>
        </motion.div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Mac-style window chrome — used by Terminal + AI Assistant
 * 3 muted dots, label centered, soft border + shadow.
 * ────────────────────────────────────────────────────────────────────────── */

function MacChrome({
    label,
    children,
    className,
    glass,
}: {
    label?: string;
    children: React.ReactNode;
    className?: string;
    glass?: boolean;
}) {
    return (
        <div
            className={cn(
                'flex flex-col overflow-hidden rounded-[12px] border shadow-[0_8px_28px_-12px_rgba(0,0,0,0.18)]',
                // Light
                'border-black/[0.06]',
                !glass && 'bg-[#FBFAF6]',
                // Dark
                'dark:border-white/[0.08] dark:shadow-[0_8px_28px_-12px_rgba(0,0,0,0.6)]',
                !glass && 'dark:bg-[#161617]',
                className,
            )}
        >
            {/* Title bar */}
            <div
                className={cn(
                    'relative flex shrink-0 items-center border-b border-black/[0.05] px-2.5 py-2 dark:border-white/[0.06]',
                    glass && 'bg-white/80 backdrop-blur-[24px] dark:bg-[#161617]',
                )}
            >
                <div className="flex items-center gap-[5px]">
                    <span className="h-2 w-2 rounded-full bg-black/15 dark:bg-white/15" />
                    <span className="h-2 w-2 rounded-full bg-black/15 dark:bg-white/15" />
                    <span className="h-2 w-2 rounded-full bg-black/15 dark:bg-white/15" />
                </div>
                {label && (
                    <span className="absolute left-1/2 -translate-x-1/2 font-mono text-[10px] text-black/40 dark:text-white/40">
                        {label}
                    </span>
                )}
            </div>
            {children}
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 * TERMINAL ASSET — mac window, light cream/dark, mono text
 * Cycles bun install → build → deploy with typewriter command + output lines.
 * ────────────────────────────────────────────────────────────────────────── */

const TERMINAL_RUNS = [
    {
        cmd: 'bun run build',
        lines: [
            { text: '▲ Next.js 16.1.6', kind: 'head' as const, delay: 200 },
            {
                text: 'Creating an optimized production build...',
                kind: 'mute' as const,
                delay: 380,
            },
            { text: '✓ Compiled successfully', kind: 'ok' as const, delay: 520 },
        ],
    },
    {
        cmd: 'bun install',
        lines: [
            { text: 'added 1,247 packages in 12s', kind: 'mute' as const, delay: 380 },
            { text: '✓ found 0 vulnerabilities', kind: 'ok' as const, delay: 360 },
        ],
    },
    {
        cmd: 'weblab deploy --prod',
        lines: [
            { text: 'Weblab CLI 1.6.0', kind: 'mute' as const, delay: 280 },
            { text: '✓ Uploaded', kind: 'ok' as const, delay: 320 },
            { text: '✓ Live at weblab.build', kind: 'ok' as const, delay: 360 },
        ],
    },
];

function TerminalVisual() {
    const [runIdx, setRunIdx] = useState(0);
    const [charCount, setCharCount] = useState(0);
    const [visibleLines, setVisibleLines] = useState(0);
    const [paused, setPaused] = useState(false);

    const run = TERMINAL_RUNS[runIdx]!;

    useEffect(() => {
        if (paused) return;
        if (charCount < run.cmd.length) {
            const id = setTimeout(() => setCharCount((c) => c + 1), 45);
            return () => clearTimeout(id);
        }
        if (visibleLines < run.lines.length) {
            const id = setTimeout(
                () => setVisibleLines((n) => n + 1),
                run.lines[visibleLines]?.delay ?? 300,
            );
            return () => clearTimeout(id);
        }
        const id = setTimeout(() => {
            setCharCount(0);
            setVisibleLines(0);
            setRunIdx((i) => (i + 1) % TERMINAL_RUNS.length);
        }, 2400);
        return () => clearTimeout(id);
    }, [charCount, visibleLines, paused, run.cmd.length, run.lines]);

    const cmdTyping = charCount < run.cmd.length;

    return (
        <div
            className="w-[300px]"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <MacChrome label="">
                <div className="min-h-[150px] px-3.5 py-3 font-mono text-[11px] leading-[1.7]">
                    {/* Prompt */}
                    <div className="flex items-center gap-1.5 text-black/85 dark:text-white/90">
                        <span className="text-black/35 dark:text-white/35">$</span>
                        <span>{run.cmd.slice(0, charCount)}</span>
                        {cmdTyping && (
                            <span
                                className="ml-0.5 inline-block h-3 w-[6px] translate-y-[1px] bg-black/85 dark:bg-white/85"
                                aria-hidden
                            />
                        )}
                    </div>
                    {/* Output */}
                    <AnimatePresence initial={false}>
                        {run.lines.slice(0, visibleLines).map((line, i) => (
                            <motion.div
                                key={`${runIdx}-${i}`}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className={cn(
                                    'flex items-center gap-1.5',
                                    line.kind === 'head' && 'text-black/80 dark:text-white/85',
                                    line.kind === 'mute' && 'text-black/45 dark:text-white/45',
                                    line.kind === 'ok' && 'text-foreground-success',
                                )}
                            >
                                {line.text}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </MacChrome>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 * MODEL SELECTOR ASSET — composer + dropdown (light/dark)
 * Auto-cycles selected option. Click to pin.
 * ────────────────────────────────────────────────────────────────────────── */

type ModelKey = 'kimi' | 'gpt' | 'opus' | 'gemini' | 'deepseek' | 'sonnet';

const MODELS: { name: string; key: ModelKey; Icon: React.ComponentType<{ className?: string }> }[] =
    [
        { name: 'Kimi k2.6', key: 'kimi', Icon: KimiIcon },
        { name: 'GPT-5.5', key: 'gpt', Icon: OpenAIIcon },
        { name: 'Opus 4.8', key: 'opus', Icon: ClaudeIcon },
        { name: 'Gemini 3.1 Pro', key: 'gemini', Icon: GeminiIcon },
        { name: 'DeepSeek V4', key: 'deepseek', Icon: DeepSeekIcon },
        { name: 'Sonnet 4.6', key: 'sonnet', Icon: ClaudeIcon },
    ];

function ModelsVisual() {
    const [active, setActive] = useState<ModelKey>('opus');
    const [paused, setPaused] = useState(false);
    const [typed, setTyped] = useState('');

    useEffect(() => {
        if (paused) return;
        const id = setInterval(() => {
            setActive((cur) => {
                const idx = MODELS.findIndex((m) => m.key === cur);
                return MODELS[(idx + 1) % MODELS.length]!.key;
            });
        }, 2200);
        return () => clearInterval(id);
    }, [paused]);

    const activeModel = MODELS.find((m) => m.key === active)!;

    return (
        <div
            className="flex w-[300px] translate-y-4 flex-col items-stretch"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            {/* Composer */}
            <div
                className={cn(
                    'relative z-10 rounded-[12px] border px-2 py-2 shadow-[0_6px_20px_-10px_rgba(0,0,0,0.18)]',
                    'border-black/[0.06] bg-white',
                    'dark:border-white/[0.08] dark:bg-[#1C1C1D] dark:shadow-[0_6px_20px_-10px_rgba(0,0,0,0.6)]',
                )}
            >
                <input
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onFocus={() => setPaused(true)}
                    onBlur={() => setPaused(false)}
                    placeholder="Ask Weblab to build anything"
                    className={cn(
                        'mb-2 w-full bg-transparent px-1.5 text-[11px] outline-none',
                        'text-black/85 placeholder:text-black/35',
                        'dark:text-white/90 dark:placeholder:text-white/35',
                    )}
                />
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-black/65 dark:text-white/65">
                            <span
                                aria-hidden
                                className="inline-flex h-3 w-3 items-center justify-center text-[13px] leading-none"
                            >
                                ∞
                            </span>
                            Build
                            <Icons.ChevronDown className="h-2.5 w-2.5" />
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-black/65 dark:text-white/65">
                            <activeModel.Icon className="h-2.5 w-2.5" />
                            {activeModel.name}
                            <Icons.ChevronDown className="h-2.5 w-2.5" />
                        </span>
                    </div>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black">
                        <Icons.ArrowUp className="h-3 w-3" />
                    </span>
                </div>
            </div>

            {/* Dropdown — anchored just below the model chip, overlapping composer bottom.
                Host clips overflow + centers, so this stays in normal flow. An invisible
                clone of the Build chip (+ the inter-chip gap) offsets the dropdown so its
                left edge lines up with the model chip rather than the Build chip — robust
                to font metrics since it mirrors the real chip's markup. */}
            <div className="relative z-20 -mt-1 flex pl-[9px]">
                <span
                    aria-hidden
                    className="invisible mr-1.5 inline-flex shrink-0 items-center gap-1 self-start rounded-md px-1.5 py-0.5 text-[10px]"
                >
                    <span className="inline-flex h-3 w-3 items-center justify-center text-[13px] leading-none">
                        ∞
                    </span>
                    Build
                    <Icons.ChevronDown className="h-2.5 w-2.5" />
                </span>
                <div
                    className={cn(
                        'w-[176px] rounded-[12px] border p-1',
                        'border-black/[0.08] bg-white shadow-[0_12px_32px_-12px_rgba(0,0,0,0.28)]',
                        'dark:border-white/[0.1] dark:bg-[#1C1C1D] dark:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]',
                    )}
                >
                    {MODELS.map((m) => {
                        const isActive = m.key === active;
                        return (
                            <button
                                key={m.key}
                                type="button"
                                onClick={() => setActive(m.key)}
                                className={cn(
                                    'group/m relative flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left transition-colors',
                                    'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]',
                                )}
                            >
                                {isActive && (
                                    <motion.span
                                        layoutId="trio-model-bg"
                                        transition={{
                                            type: 'spring',
                                            stiffness: 380,
                                            damping: 32,
                                            mass: 0.45,
                                        }}
                                        className="pointer-events-none absolute inset-0 rounded-[8px] bg-black/[0.05] dark:bg-white/[0.06]"
                                        aria-hidden
                                    />
                                )}
                                <m.Icon
                                    className={cn(
                                        'relative h-3 w-3 shrink-0',
                                        isActive
                                            ? 'text-black/80 dark:text-white/85'
                                            : 'text-black/50 dark:text-white/50',
                                    )}
                                />
                                <span
                                    className={cn(
                                        'relative flex-1 text-[11px] leading-tight tracking-tight',
                                        isActive
                                            ? 'text-black dark:text-white'
                                            : 'text-black/65 dark:text-white/65',
                                    )}
                                >
                                    {m.name}
                                </span>
                                {isActive && (
                                    <Icons.Check className="relative h-3 w-3 text-black/70 dark:text-white/75" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 * AI ASSISTANT ASSET — smooth typewriter sequence:
 * type in composer → send → thinking dots → thought/explored → AI reply
 * typewriter → tool calls → hold → reset.
 * Composer is fixed-height at bottom — never jumps or resizes.
 * ────────────────────────────────────────────────────────────────────────── */

const AI_RUNS = [
    {
        tab: 'Add pricing',
        prompt: 'Add a pricing section with 3 tiers',
        reply: "I'll create a Pricing component and add it to the homepage.",
        thought: '5s',
        explored: '3 files',
        tools: [
            { kind: 'Created' as const, file: 'Pricing.tsx', add: 86, del: 0 },
            { kind: 'Edited' as const, file: 'Home.tsx', add: 12, del: 2 },
        ],
    },
    {
        tab: 'Hero size',
        prompt: 'Make the hero headline larger',
        reply: 'Bumping the h1 to text-7xl with tighter leading.',
        thought: '3s',
        explored: '2 files',
        tools: [{ kind: 'Edited' as const, file: 'Hero.tsx', add: 4, del: 2 }],
    },
    {
        tab: 'Teal accent',
        prompt: 'Style the cards with a teal accent',
        reply: 'Applying border-teal-300 to the Card component on hover.',
        thought: '2s',
        explored: '1 file',
        tools: [{ kind: 'Edited' as const, file: 'Card.tsx', add: 6, del: 3 }],
    },
];

type AiPhase =
    | 'typing'
    | 'pre-send'
    | 'thinking-dots'
    | 'thinking-text'
    | 'ai-typing'
    | 'tool-call'
    | 'hold';

export function AiAssistantVisual() {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inView = useInView(wrapperRef, { once: true, amount: 0.45 });
    const [hasStarted, setHasStarted] = useState(false);
    const [runIdx, setRunIdx] = useState(0);
    const [phase, setPhase] = useState<AiPhase>('typing');
    const [promptLen, setPromptLen] = useState(0);
    const [replyLen, setReplyLen] = useState(0);
    const [paused, setPaused] = useState(false);

    const run = AI_RUNS[runIdx]!;

    useEffect(() => {
        if (inView) setHasStarted(true);
    }, [inView]);

    const pickRun = (idx: number) => {
        if (idx === runIdx) return;
        setRunIdx(idx);
        setPromptLen(0);
        setReplyLen(0);
        setPhase('typing');
    };

    useEffect(() => {
        if (!hasStarted || paused) return;

        if (phase === 'typing') {
            if (promptLen < run.prompt.length) {
                const id = setTimeout(() => setPromptLen((n) => n + 1), 40);
                return () => clearTimeout(id);
            }
            const id = setTimeout(() => setPhase('pre-send'), 360);
            return () => clearTimeout(id);
        }
        if (phase === 'pre-send') {
            const id = setTimeout(() => setPhase('thinking-dots'), 420);
            return () => clearTimeout(id);
        }
        if (phase === 'thinking-dots') {
            const id = setTimeout(() => setPhase('thinking-text'), 800);
            return () => clearTimeout(id);
        }
        if (phase === 'thinking-text') {
            const id = setTimeout(() => setPhase('ai-typing'), 900);
            return () => clearTimeout(id);
        }
        if (phase === 'ai-typing') {
            if (replyLen < run.reply.length) {
                const id = setTimeout(() => setReplyLen((n) => n + 1), 22);
                return () => clearTimeout(id);
            }
            const id = setTimeout(() => setPhase('tool-call'), 380);
            return () => clearTimeout(id);
        }
        if (phase === 'tool-call') {
            const id = setTimeout(() => setPhase('hold'), 1800);
            return () => clearTimeout(id);
        }
        if (phase === 'hold') {
            const id = setTimeout(() => {
                setPromptLen(0);
                setReplyLen(0);
                setRunIdx((i) => (i + 1) % AI_RUNS.length);
                setPhase('typing');
            }, 2000);
            return () => clearTimeout(id);
        }
    }, [phase, promptLen, replyLen, paused, hasStarted, run.prompt, run.reply]);

    const composerText =
        phase === 'typing'
            ? run.prompt.slice(0, promptLen)
            : phase === 'pre-send'
              ? run.prompt
              : '';

    const sendActive = phase === 'typing' || phase === 'pre-send';
    const showUserMsg = !sendActive;
    const showDots = phase === 'thinking-dots';
    const showThoughtText =
        phase === 'thinking-text' ||
        phase === 'ai-typing' ||
        phase === 'tool-call' ||
        phase === 'hold';
    const showAiReply = phase === 'ai-typing' || phase === 'tool-call' || phase === 'hold';
    const showToolCalls = phase === 'tool-call' || phase === 'hold';

    return (
        <div
            ref={wrapperRef}
            className="relative w-full max-w-[300px]"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <MacChrome label="Weblab" glass className="h-[440px]">
                {/* Tabs row — click to swap which chat is active. */}
                <div
                    className={cn(
                        'flex shrink-0 items-center gap-0.5 border-b border-black/[0.05] px-1 py-0.5 dark:border-white/[0.06]',
                        'bg-white/80 backdrop-blur-[24px] dark:bg-[#161617]',
                    )}
                >
                    {AI_RUNS.map((r, idx) => {
                        const active = idx === runIdx;
                        return (
                            <button
                                key={r.tab}
                                type="button"
                                onClick={() => pickRun(idx)}
                                className={cn(
                                    'inline-flex h-5 items-center gap-1 rounded-[5px] px-1.5 text-[9px] whitespace-nowrap transition-colors',
                                    active
                                        ? 'bg-black/[0.06] text-black/85 dark:bg-white/[0.08] dark:text-white/90'
                                        : 'text-black/45 hover:bg-black/[0.04] hover:text-black/75 dark:text-white/45 dark:hover:bg-white/[0.05] dark:hover:text-white/75',
                                )}
                            >
                                {r.tab}
                                <Icons.CrossS className="h-2 w-2 opacity-60" />
                            </button>
                        );
                    })}
                </div>

                {/* Body — messages grow, composer pinned at bottom (never jumps) */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#FBFAF6] dark:bg-[#161617]">
                    {/* Messages area — scrollable, clipped */}
                    <div className="min-h-0 flex-1 overflow-hidden px-3.5 pt-3 pb-1">
                        <div className="flex flex-col gap-2">
                            {/* User message — fades in from right on send */}
                            <AnimatePresence>
                                {showUserMsg && (
                                    <motion.div
                                        key={`user-${runIdx}`}
                                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -4 }}
                                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                                        className="flex justify-end"
                                    >
                                        <div className="rounded-full bg-black/[0.06] px-3 py-1 text-[10px] text-black/85 dark:bg-white/[0.08] dark:text-white/90">
                                            {run.prompt}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Thinking dots */}
                            <AnimatePresence>
                                {showDots && (
                                    <motion.div
                                        key={`dots-${runIdx}`}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.18 }}
                                        className="flex items-center gap-1 px-1"
                                    >
                                        {[0, 1, 2].map((i) => (
                                            <span
                                                key={i}
                                                className="h-1.5 w-1.5 animate-pulse rounded-full bg-black/25 dark:bg-white/30"
                                                style={{
                                                    animationDelay: `${i * 220}ms`,
                                                    animationDuration: '1.3s',
                                                }}
                                            />
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Thought + Explored */}
                            <AnimatePresence>
                                {showThoughtText && (
                                    <motion.div
                                        key={`thought-${runIdx}`}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -4 }}
                                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                                        className="flex flex-col gap-0.5"
                                    >
                                        <span className="text-[10px] text-black/85 dark:text-white/85">
                                            <span className="font-semibold">Thought</span>{' '}
                                            <span className="font-normal text-black/40 dark:text-white/40">
                                                {run.thought}
                                            </span>
                                        </span>
                                        <span className="text-[10px] text-black/85 dark:text-white/85">
                                            <span className="font-semibold">Explored</span>{' '}
                                            <span className="font-normal text-black/40 dark:text-white/40">
                                                {run.explored}
                                            </span>
                                        </span>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* AI reply — typewriter */}
                            <AnimatePresence>
                                {showAiReply && (
                                    <motion.div
                                        key={`ai-${runIdx}`}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.35 }}
                                        className="text-[10px] leading-[1.55] text-black/80 dark:text-white/80"
                                    >
                                        {run.reply.slice(0, replyLen)}
                                        {phase === 'ai-typing' && (
                                            <span
                                                className="ml-0.5 inline-block h-3 w-px translate-y-px animate-pulse bg-black/60 align-middle dark:bg-white/60"
                                                aria-hidden
                                            />
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Tool calls — stagger in */}
                            <AnimatePresence>
                                {showToolCalls && (
                                    <motion.div
                                        key={`tools-${runIdx}`}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="flex flex-col gap-1.5"
                                    >
                                        {run.tools.map((tool, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{
                                                    duration: 0.28,
                                                    delay: i * 0.14,
                                                    ease: [0.22, 1, 0.36, 1],
                                                }}
                                                className="flex items-center justify-between gap-1.5 rounded-[6px] bg-black/[0.04] px-2 py-1 dark:bg-white/[0.05]"
                                            >
                                                <span className="flex min-w-0 items-center gap-1.5 text-[9.5px]">
                                                    <span className="font-medium text-black/50 dark:text-white/50">
                                                        {tool.kind}
                                                    </span>
                                                    <span className="truncate font-mono text-black/85 dark:text-white/85">
                                                        {tool.file}
                                                    </span>
                                                </span>
                                                <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] tabular-nums">
                                                    <span className="text-emerald-600 dark:text-emerald-400">
                                                        +{tool.add}
                                                    </span>
                                                    <span className="text-rose-500 dark:text-rose-400">
                                                        −{tool.del}
                                                    </span>
                                                </span>
                                            </motion.div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Composer — fixed height, pinned to bottom, never jumps */}
                    <div className="shrink-0 px-3.5 pb-3">
                        <div
                            className={cn(
                                'rounded-[10px] border',
                                'border-black/[0.06] bg-white',
                                'dark:border-white/[0.08] dark:bg-[#1F1F20]',
                            )}
                        >
                            {/* Text row — fixed height prevents layout shift */}
                            <div className="flex h-[30px] items-center px-2.5 pt-2 text-[10px]">
                                {composerText ? (
                                    <span className="truncate text-black/85 dark:text-white/90">
                                        {composerText}
                                        {phase === 'typing' && (
                                            <span
                                                className="ml-0.5 inline-block h-3 w-px translate-y-px animate-pulse bg-black/70 align-middle dark:bg-white/70"
                                                aria-hidden
                                            />
                                        )}
                                    </span>
                                ) : (
                                    <span className="text-black/30 dark:text-white/30">
                                        Describe what you want to build
                                    </span>
                                )}
                            </div>
                            {/* Footer controls */}
                            <div className="flex items-center justify-between px-2 pt-1 pb-2">
                                <div className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1 text-[9.5px] text-black/55 dark:text-white/55">
                                        <span aria-hidden className="text-[11px] leading-none">
                                            ∞
                                        </span>
                                        Build
                                        <Icons.ChevronDown className="h-2 w-2" />
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[9.5px] text-black/55 dark:text-white/55">
                                        <ClaudeIcon className="h-2.5 w-2.5" />
                                        Sonnet 4.6
                                        <Icons.ChevronDown className="h-2 w-2" />
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Icons.Image className="h-3 w-3 text-black/40 dark:text-white/40" />
                                    <Icons.Microphone className="h-3 w-3 text-black/40 dark:text-white/40" />
                                    <span
                                        className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black"
                                        aria-hidden
                                    >
                                        {sendActive ? (
                                            <Icons.ArrowRight className="h-2.5 w-2.5" />
                                        ) : (
                                            <Icons.Stop className="h-2 w-2" />
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </MacChrome>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 * TOKENS ASSET — design system tokens preview (color + type)
 * ────────────────────────────────────────────────────────────────────────── */

const TOKEN_COLORS = [
    { name: 'background', swatch: 'bg-[#0F1011]', hex: '#0F1011' },
    { name: 'surface', swatch: 'bg-[#1C1C1D]', hex: '#1C1C1D' },
    { name: 'foreground', swatch: 'bg-[#F9F9F9]', hex: '#F9F9F9' },
    { name: 'muted', swatch: 'bg-[#8a8a8a]', hex: '#8A8A8A' },
    {
        name: 'brand',
        swatch: 'bg-[color:var(--foreground-brand)]',
        hex: '#0F9BFF',
        active: true,
    },
];

function TokensVisual() {
    const [active, setActive] = useState('brand');
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (paused) return;
        const id = setInterval(() => {
            setActive((cur) => {
                const idx = TOKEN_COLORS.findIndex((c) => c.name === cur);
                return TOKEN_COLORS[(idx + 1) % TOKEN_COLORS.length]!.name;
            });
        }, 2200);
        return () => clearInterval(id);
    }, [paused]);

    return (
        <div
            className={cn(
                'flex w-[300px] flex-col overflow-hidden rounded-[12px] border shadow-[0_6px_20px_-10px_rgba(0,0,0,0.18)]',
                'border-black/[0.06] bg-white',
                'dark:border-white/[0.08] dark:bg-[#1C1C1D] dark:shadow-[0_6px_20px_-10px_rgba(0,0,0,0.6)]',
            )}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div className="flex items-center justify-between border-b border-black/[0.05] px-3 py-2 dark:border-white/[0.06]">
                <span className="text-style-tagline">Tokens</span>
                <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3" />
            </div>
            <div className="flex flex-col gap-0.5 p-1">
                <div className="text-style-tagline px-2 pt-1 pb-0.5">Colors</div>
                {TOKEN_COLORS.map((token) => {
                    const isActive = token.name === active;
                    return (
                        <button
                            key={token.name}
                            type="button"
                            onClick={() => setActive(token.name)}
                            className="group/tok relative flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left transition-colors"
                        >
                            {isActive && (
                                <motion.span
                                    layoutId="trio-token-bg"
                                    transition={{
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 32,
                                        mass: 0.45,
                                    }}
                                    className="pointer-events-none absolute inset-0 rounded-[8px] bg-black/[0.05] dark:bg-white/[0.06]"
                                    aria-hidden
                                />
                            )}
                            <span
                                className={cn(
                                    'relative h-3 w-3 shrink-0 rounded-[3px] ring-1 ring-inset',
                                    token.swatch,
                                    'ring-black/10 dark:ring-white/15',
                                )}
                            />
                            <span
                                className={cn(
                                    'relative truncate font-mono text-[10.5px]',
                                    isActive
                                        ? 'text-black dark:text-white'
                                        : 'text-black/65 dark:text-white/65',
                                )}
                            >
                                {token.name}
                            </span>
                            {isActive && (
                                <span className="bg-foreground-brand relative h-1.5 w-1.5 shrink-0 rounded-full" />
                            )}
                            <span className="text-foreground-tertiary relative ml-auto font-mono text-[9.5px] tabular-nums">
                                {token.hex}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Section
 * ────────────────────────────────────────────────────────────────────────── */

export function FeatureTrioSection() {
    const tModel = useTranslations('landing.modelAgnostic');
    const tTerm = useTranslations('landing.terminalSection');
    const tTrio = useTranslations('landing.featureTrio');

    return (
        <section
            className="mx-auto w-full max-w-[1400px] px-4 py-24 sm:px-6 md:px-8 md:py-32"
            id="feature-trio"
        >
            <motion.div
                initial={REVEAL.initial}
                whileInView={REVEAL.whileInView}
                viewport={REVEAL.viewport}
                transition={REVEAL.transition}
                className="mb-14 max-w-[50%]"
            >
                <div className="text-style-tagline mb-3">{tTrio('eyebrow')}</div>
                <h2 className="heading-style-h3 text-foreground-primary text-balance">
                    {tTrio('heading')}
                </h2>
            </motion.div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-x-4">
                <div className="md:col-span-4">
                    <FeatureTrioCard
                        visual={<ModelsVisual />}
                        eyebrow={tModel('eyebrow')}
                        title={tTrio('models.title')}
                        body={tTrio('models.body')}
                        bgSrc={FEATURE_BACKDROP_SRCS.ivory}
                    />
                </div>
                <div className="md:col-span-4">
                    <FeatureTrioCard
                        visual={<TerminalVisual />}
                        eyebrow={tTerm('eyebrow')}
                        title={tTrio('terminal.title')}
                        body={tTrio('terminal.body')}
                        bgSrc={FEATURE_BACKDROP_SRCS.sky}
                    />
                </div>
                <div className="md:col-span-4">
                    <FeatureTrioCard
                        visual={<TokensVisual />}
                        eyebrow={tTrio('tokens.eyebrow')}
                        title={tTrio('tokens.title')}
                        body={tTrio('tokens.body')}
                        bgSrc={FEATURE_BACKDROP_SRCS.sand}
                    />
                </div>
            </div>
        </section>
    );
}
