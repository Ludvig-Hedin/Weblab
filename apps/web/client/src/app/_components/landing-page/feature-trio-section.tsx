'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { ClaudeIcon, DeepSeekIcon, GeminiIcon, KimiIcon, OpenAIIcon } from './provider-icons';

const REVEAL = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

const BRAND = 'var(--foreground-brand)';

/* ──────────────────────────────────────────────────────────────────────────
 * Card shell — soft backdrop, theme-aware. Asset floats centered.
 * Backdrop: subtle top wash (light cool tint on light, deep wash on dark).
 * ────────────────────────────────────────────────────────────────────────── */

interface FeatureTrioCardProps {
    visual: React.ReactNode;
    eyebrow: string;
    title: string;
    body: string;
}

function FeatureTrioCard({ visual, eyebrow, title, body }: FeatureTrioCardProps) {
    return (
        <motion.div
            initial={REVEAL.initial}
            whileInView={REVEAL.whileInView}
            viewport={REVEAL.viewport}
            transition={REVEAL.transition}
            className="flex flex-col gap-5"
        >
            {/* Backdrop — soft gradient surface, 12px radius, ar 860/650 */}
            <div
                className={cn(
                    'relative w-full overflow-hidden rounded-[12px]',
                    'aspect-square',
                    'flex items-center justify-center',
                    // Light: soft cool wash like screenshots; light border for definition
                    'border border-black/5 bg-[radial-gradient(ellipse_120%_70%_at_50%_-10%,_#E6EAF0_0%,_#F2F0EA_60%,_#F2F0EA_100%)]',
                    // Dark: no border, deep wash only
                    'dark:border-0 dark:bg-[radial-gradient(ellipse_120%_70%_at_50%_-10%,_#262830_0%,_#1A1A1B_60%,_#1A1A1B_100%)]',
                )}
            >
                {/* Scale widget down on smaller cards so internal text/layout doesn't overflow */}
                <div className="origin-center scale-[0.85] sm:scale-90 md:scale-[0.85] lg:scale-95 xl:scale-100">
                    {visual}
                </div>
            </div>

            {/* Text */}
            <div className="flex flex-col gap-2 pt-1">
                <span className="text-style-tagline">{eyebrow}</span>
                <h3 className="text-foreground-primary text-lg font-medium tracking-tight">
                    {title}
                </h3>
                <p className="text-foreground-secondary text-sm leading-[1.4] font-light tracking-tight">
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
}: {
    label?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'overflow-hidden rounded-[12px] border shadow-[0_8px_28px_-12px_rgba(0,0,0,0.18)]',
                // Light
                'border-black/[0.06] bg-[#FBFAF6]',
                // Dark
                'dark:border-white/[0.08] dark:bg-[#161617] dark:shadow-[0_8px_28px_-12px_rgba(0,0,0,0.6)]',
                className,
            )}
        >
            {/* Title bar */}
            <div className="relative flex items-center border-b border-black/[0.05] px-2.5 py-2 dark:border-white/[0.06]">
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
            { text: 'Creating an optimized production build...', kind: 'mute' as const, delay: 380 },
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
            className="w-full max-w-[300px]"
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
                                    line.kind === 'head' &&
                                        'text-black/80 dark:text-white/85',
                                    line.kind === 'mute' &&
                                        'text-black/45 dark:text-white/45',
                                    line.kind === 'ok' &&
                                        'text-[color:var(--foreground-brand)]',
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

const MODELS: { name: string; key: ModelKey; Icon: React.ComponentType<{ className?: string }> }[] = [
    { name: 'Kimi k2.6', key: 'kimi', Icon: KimiIcon },
    { name: 'GPT-5.5', key: 'gpt', Icon: OpenAIIcon },
    { name: 'Opus 4.7', key: 'opus', Icon: ClaudeIcon },
    { name: 'Gemini 3.1 Pro', key: 'gemini', Icon: GeminiIcon },
    { name: 'DeepSeek V4', key: 'deepseek', Icon: DeepSeekIcon },
    { name: 'Sonnet 4.6', key: 'sonnet', Icon: ClaudeIcon },
];

function ModelsVisual() {
    const [active, setActive] = useState<ModelKey>('opus');
    const [paused, setPaused] = useState(false);

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
            className="flex w-full max-w-[280px] flex-col items-stretch gap-2"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            {/* Composer */}
            <div
                className={cn(
                    'rounded-[12px] border px-3 py-2 shadow-[0_6px_20px_-10px_rgba(0,0,0,0.18)]',
                    'border-black/[0.06] bg-white',
                    'dark:border-white/[0.08] dark:bg-[#1C1C1D] dark:shadow-[0_6px_20px_-10px_rgba(0,0,0,0.6)]',
                )}
            >
                <div className="mb-2 text-[11px] text-black/35 dark:text-white/35">
                    Ask Weblab to build anything
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-black/55 dark:text-white/55">
                            <span aria-hidden className="text-[10px] leading-none">
                                ∞
                            </span>{' '}
                            Build
                            <Icons.ChevronDown className="h-2.5 w-2.5" />
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-black/65 dark:text-white/65">
                            <activeModel.Icon className="h-3 w-3" />
                            {activeModel.name}
                            <Icons.ChevronDown className="h-2.5 w-2.5" />
                        </span>
                    </div>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black">
                        <Icons.ArrowUp className="h-3 w-3" />
                    </span>
                </div>
            </div>

            {/* Dropdown — anchored under the Opus chip */}
            <div
                className={cn(
                    'ml-[44px] rounded-[12px] border p-1 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.22)]',
                    'border-black/[0.06] bg-white',
                    'dark:border-white/[0.08] dark:bg-[#1C1C1D] dark:shadow-[0_8px_24px_-10px_rgba(0,0,0,0.6)]',
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
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 * AI ASSISTANT ASSET — Weblab chat window, tabs, message + tool calls
 * ────────────────────────────────────────────────────────────────────────── */

const AI_RUNS = [
    {
        prompt: 'Add a pricing section with 3 tiers',
        reply: "I'll create a Pricing component and add it to the homepage.",
        thought: '5s',
        explored: '3 files',
        tools: [
            { kind: 'Created' as const, file: 'Pricing.tsx' },
            { kind: 'Edited' as const, file: 'Home.tsx' },
        ],
        done: 'Done. Added a `Pricing section` with Starter, Pro, and Enterprise tiers below the hero.',
    },
    {
        prompt: 'Make the hero darker',
        reply: 'Tuning the hero background and copy contrast.',
        thought: '3s',
        explored: '2 files',
        tools: [
            { kind: 'Edited' as const, file: 'Hero.tsx' },
            { kind: 'Edited' as const, file: 'theme.css' },
        ],
        done: 'Done. `Hero` background is deeper and copy has higher contrast.',
    },
];

export function AiAssistantVisual() {
    const [runIdx, setRunIdx] = useState(0);
    const [stage, setStage] = useState<'sending' | 'thinking' | 'tools' | 'done' | 'hold'>(
        'sending',
    );
    const [paused, setPaused] = useState(false);

    const run = AI_RUNS[runIdx]!;

    useEffect(() => {
        if (paused) return;
        const next: Record<typeof stage, [typeof stage, number]> = {
            sending: ['thinking', 700],
            thinking: ['tools', 1100],
            tools: ['done', 1100],
            done: ['hold', 1600],
            hold: ['sending', 0],
        };
        const [n, ms] = next[stage]!;
        const id = setTimeout(() => {
            if (stage === 'hold') {
                setRunIdx((i) => (i + 1) % AI_RUNS.length);
            }
            setStage(n);
        }, ms);
        return () => clearTimeout(id);
    }, [stage, paused]);

    const showThinking = stage !== 'sending';
    const showTools = stage === 'tools' || stage === 'done' || stage === 'hold';
    const showDone = stage === 'done' || stage === 'hold';

    const firstFile = run.tools[0]?.file ?? '';

    return (
        <div
            className="relative w-full max-w-[300px]"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            {/* Floating "Pricing.tsx Created" chip — top-left, outside window */}
            <AnimatePresence>
                {showTools && (
                    <motion.div
                        key={`f1-${runIdx}`}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className={cn(
                            'absolute -top-4 -left-4 z-10 flex items-center gap-2 rounded-full px-2.5 py-1.5 text-[10px] shadow-[0_6px_16px_-4px_rgba(0,0,0,0.18)]',
                            'bg-white text-black/85',
                            'dark:bg-[#1F1F20] dark:text-white/90',
                        )}
                    >
                        <span className="font-mono font-medium">{firstFile}</span>
                        <span className="text-black/45 dark:text-white/45">Created</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating "Home.tsx +24 -2" chip — bottom-right, outside window */}
            <AnimatePresence>
                {showDone && (
                    <motion.div
                        key={`f2-${runIdx}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className={cn(
                            'absolute -right-4 -bottom-4 z-10 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-[10px] shadow-[0_6px_16px_-4px_rgba(0,0,0,0.18)]',
                            'bg-white text-black/85',
                            'dark:bg-[#1F1F20] dark:text-white/90',
                        )}
                    >
                        <span className="font-medium">Home.tsx</span>
                        <span className="text-emerald-600 dark:text-emerald-400">+24</span>
                        <span className="text-rose-500 dark:text-rose-400">-2</span>
                    </motion.div>
                )}
            </AnimatePresence>

            <MacChrome label="Weblab">
                {/* Tabs row — pill style */}
                <div className="flex items-center gap-1 border-b border-black/[0.05] px-2 py-1.5 dark:border-white/[0.06]">
                    {[
                        { label: 'Add pricing section', active: true },
                        { label: 'Add dark mode', active: false },
                        { label: 'Translate to english', active: false },
                    ].map((t) => (
                        <div
                            key={t.label}
                            className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] whitespace-nowrap',
                                t.active
                                    ? 'bg-black/[0.06] text-black/85 dark:bg-white/[0.08] dark:text-white/90'
                                    : 'text-black/45 dark:text-white/45',
                            )}
                        >
                            {t.label}
                            <Icons.CrossS className="h-2 w-2 opacity-60" />
                        </div>
                    ))}
                </div>

                {/* Body */}
                <div className="flex min-h-[200px] flex-col gap-2.5 px-3.5 py-3">
                    {/* Centered user prompt pill */}
                    <div className="flex justify-center">
                        <div className="rounded-full bg-black/[0.05] px-3 py-1 text-[10px] text-black/85 dark:bg-white/[0.06] dark:text-white/90">
                            {run.prompt}
                        </div>
                    </div>
                    {/* AI reply */}
                    <div className="text-[10px] leading-[1.5] text-black/80 dark:text-white/80">
                        {run.reply}
                    </div>
                    {/* Thought + Explored */}
                    <AnimatePresence>
                        {showThinking && (
                            <motion.div
                                key={`th-${runIdx}`}
                                initial={{ opacity: 0, y: 3 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18 }}
                                className="flex flex-col gap-0.5"
                            >
                                <span className="text-[10px] text-black/85 dark:text-white/85">
                                    <span className="font-semibold">Thought</span>{' '}
                                    <span className="font-normal text-black/45 dark:text-white/45">
                                        {run.thought}
                                    </span>
                                </span>
                                <span className="text-[10px] text-black/85 dark:text-white/85">
                                    <span className="font-semibold">Explored</span>{' '}
                                    <span className="font-normal text-black/45 dark:text-white/45">
                                        {run.explored}
                                    </span>
                                </span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {/* Tool calls — bigger, padded */}
                    <AnimatePresence>
                        {showTools && (
                            <motion.div
                                key={`to-${runIdx}`}
                                initial={{ opacity: 0, y: 3 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18 }}
                                className="flex flex-col gap-1.5"
                            >
                                {run.tools.map((tool, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between gap-2 rounded-[8px] bg-black/[0.04] px-2.5 py-1.5 dark:bg-white/[0.05]"
                                    >
                                        <span className="text-[10px]">
                                            <span className="mr-1.5 font-medium text-black/55 dark:text-white/55">
                                                {tool.kind}
                                            </span>
                                            <span className="font-mono text-black/85 dark:text-white/85">
                                                {tool.file}
                                            </span>
                                        </span>
                                        <Icons.Check className="h-2.5 w-2.5 text-black/55 dark:text-white/55" />
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {/* Done */}
                    <AnimatePresence>
                        {showDone && (
                            <motion.div
                                key={`d-${runIdx}`}
                                initial={{ opacity: 0, y: 3 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18 }}
                                className="text-[10px] leading-[1.5] text-black/80 dark:text-white/80"
                            >
                                {run.done.split(/(`[^`]+`)/g).map((seg, i) =>
                                    seg.startsWith('`') ? (
                                        <code
                                            key={i}
                                            className="rounded bg-black/[0.06] px-1 py-px font-mono text-[10px] text-black/85 dark:bg-white/[0.07] dark:text-white/85"
                                        >
                                            {seg.slice(1, -1)}
                                        </code>
                                    ) : (
                                        <span key={i}>{seg}</span>
                                    ),
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Composer at bottom */}
                    <div
                        className={cn(
                            'mt-auto rounded-[10px] border px-2.5 py-2',
                            'border-black/[0.06] bg-white',
                            'dark:border-white/[0.08] dark:bg-[#1F1F20]',
                        )}
                    >
                        <div className="mb-2 text-[10px] text-black/35 dark:text-white/35">
                            Describe what you want to build
                        </div>
                        <div className="flex items-center justify-between">
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
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black">
                                    <Icons.ArrowRight className="h-2.5 w-2.5" />
                                </span>
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
                'flex w-full max-w-[280px] flex-col overflow-hidden rounded-[12px] border shadow-[0_6px_20px_-10px_rgba(0,0,0,0.18)]',
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
                                    'relative flex-1 truncate font-mono text-[10.5px]',
                                    isActive
                                        ? 'text-black dark:text-white'
                                        : 'text-black/65 dark:text-white/65',
                                )}
                            >
                                {token.name}
                            </span>
                            <span className="text-foreground-tertiary relative font-mono text-[9.5px] tabular-nums">
                                {token.hex}
                            </span>
                            {isActive && (
                                <span className="bg-foreground-brand relative h-1.5 w-1.5 shrink-0 rounded-full" />
                            )}
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
            className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32"
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

            <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-x-6">
                <div className="md:col-span-4">
                    <FeatureTrioCard
                        visual={<ModelsVisual />}
                        eyebrow={tModel('eyebrow')}
                        title={tTrio('models.title')}
                        body={tTrio('models.body')}
                    />
                </div>
                <div className="md:col-span-4">
                    <FeatureTrioCard
                        visual={<TerminalVisual />}
                        eyebrow={tTerm('eyebrow')}
                        title={tTrio('terminal.title')}
                        body={tTrio('terminal.body')}
                    />
                </div>
                <div className="md:col-span-4">
                    <FeatureTrioCard
                        visual={<TokensVisual />}
                        eyebrow={tTrio('tokens.eyebrow')}
                        title={tTrio('tokens.title')}
                        body={tTrio('tokens.body')}
                    />
                </div>
            </div>
        </section>
    );
}
