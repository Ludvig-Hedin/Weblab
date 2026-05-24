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

// ─── Card shell ─────────────────────────────────────────────────────────
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
            {/* Asset — light, contained, rounded 12 */}
            <div
                className={cn(
                    'border-foreground-primary/10 bg-background-secondary/40 relative w-full overflow-hidden rounded-[12px] border',
                    // 4:3-ish — tighter card height, image dominates
                    'aspect-[860/650]',
                    'flex items-end justify-center px-5 pt-7 pb-0 md:px-8 md:pt-10',
                )}
            >
                {visual}
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

// ─── Visual: Models picker — compact ────────────────────────────────────
type DescriptionKey = 'gpt' | 'sonnet' | 'opus' | 'gemini' | 'deepseek' | 'kimi';

const MODELS: {
    name: string;
    descriptionKey: DescriptionKey;
    icon: React.ReactNode;
}[] = [
    {
        name: 'Claude Opus 4.7',
        descriptionKey: 'opus',
        icon: <ClaudeIcon className="h-3 w-3" />,
    },
    {
        name: 'GPT-5.5',
        descriptionKey: 'gpt',
        icon: <OpenAIIcon className="h-3 w-3" />,
    },
    {
        name: 'Gemini 3.1 Pro',
        descriptionKey: 'gemini',
        icon: <GeminiIcon className="h-3 w-3" />,
    },
    {
        name: 'DeepSeek V4',
        descriptionKey: 'deepseek',
        icon: <DeepSeekIcon className="h-3 w-3" />,
    },
    {
        name: 'Kimi K2.6',
        descriptionKey: 'kimi',
        icon: <KimiIcon className="h-3 w-3" />,
    },
];

function ModelsVisual() {
    const t = useTranslations('landing.modelAgnostic.models');
    const [activeIndex, setActiveIndex] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (paused) return;
        const id = setInterval(() => {
            setActiveIndex((i) => (i + 1) % MODELS.length);
        }, 2600);
        return () => clearInterval(id);
    }, [paused]);

    return (
        <div
            className="border-foreground-primary/10 bg-background/70 w-full max-w-[260px] overflow-hidden rounded-[12px] border p-1 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)] backdrop-blur-sm"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <ul className="relative">
                {MODELS.map((m, idx) => {
                    const isActive = idx === activeIndex;
                    return (
                        <li key={m.name} className="relative">
                            {isActive && (
                                <motion.span
                                    layoutId="trio-model-active"
                                    transition={{
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 34,
                                        mass: 0.45,
                                    }}
                                    className="bg-foreground-primary/[0.06] ring-foreground-primary/10 pointer-events-none absolute inset-0 rounded-[7px] ring-1 ring-inset"
                                    aria-hidden
                                />
                            )}
                            <button
                                type="button"
                                onClick={() => setActiveIndex(idx)}
                                className="group/picker-row hover:bg-foreground-primary/[0.04] relative flex w-full cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-left focus:outline-none"
                            >
                                <span className="text-foreground-secondary flex h-4 w-4 shrink-0 items-center justify-center">
                                    {m.icon}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="text-foreground-primary text-[11px] leading-tight font-light tracking-tight">
                                        {m.name}
                                    </div>
                                    <div className="text-foreground-tertiary mt-0.5 truncate text-[10px] leading-tight font-light">
                                        {t(m.descriptionKey)}
                                    </div>
                                </div>
                                {isActive && (
                                    <span
                                        className="relative flex h-1.5 w-1.5 shrink-0"
                                        aria-hidden
                                    >
                                        <span
                                            className="absolute inset-0 animate-ping rounded-full opacity-70"
                                            style={{
                                                backgroundColor:
                                                    'color-mix(in srgb, var(--foreground-brand) 50%, transparent)',
                                            }}
                                        />
                                        <span className="bg-foreground-brand relative h-1.5 w-1.5 rounded-full" />
                                    </span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

// ─── Visual: Terminal — compact, looping commands ───────────────────────
const TERMINAL_RUNS = [
    {
        cmd: 'bun install',
        out: ['added 1,247 packages in 12s', '✓ found 0 vulnerabilities'],
    },
    {
        cmd: 'bun run build',
        out: ['▲ Next.js 16.1.6', '✓ Compiled successfully', '✓ Build complete · 4.2s'],
    },
    {
        cmd: 'weblab deploy --prod',
        out: ['✓ Uploaded', '✓ Live at weblab.build'],
    },
];

function TerminalVisual() {
    const [runIdx, setRunIdx] = useState(0);
    const [charCount, setCharCount] = useState(0);
    const [showOutput, setShowOutput] = useState(false);
    const [paused, setPaused] = useState(false);

    const run = TERMINAL_RUNS[runIdx]!;

    useEffect(() => {
        if (paused) return;
        // Type out the command
        if (charCount < run.cmd.length) {
            const id = setTimeout(() => setCharCount((c) => c + 1), 50);
            return () => clearTimeout(id);
        }
        if (!showOutput) {
            const id = setTimeout(() => setShowOutput(true), 320);
            return () => clearTimeout(id);
        }
        // Hold then loop
        const id = setTimeout(() => {
            setCharCount(0);
            setShowOutput(false);
            setRunIdx((i) => (i + 1) % TERMINAL_RUNS.length);
        }, 2400);
        return () => clearTimeout(id);
    }, [charCount, showOutput, paused, run.cmd.length]);

    return (
        <div
            className="border-foreground-primary/10 w-full max-w-[280px] overflow-hidden rounded-[12px] border bg-[#0E0E10] shadow-[0_8px_30px_-12px_rgba(0,0,0,0.4)]"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            {/* Title bar */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
                <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-white/15" />
                    <span className="h-2 w-2 rounded-full bg-white/15" />
                    <span className="h-2 w-2 rounded-full bg-white/15" />
                </div>
                <span className="font-mono text-[9px] text-white/40">~/weblab</span>
            </div>
            {/* Body */}
            <div className="min-h-[120px] p-3 font-mono text-[10px] leading-[1.55]">
                <div className="flex items-center gap-1.5">
                    <span className="text-white/40">$</span>
                    <span className="text-white">{run.cmd.slice(0, charCount)}</span>
                    {charCount < run.cmd.length && (
                        <span
                            className="ml-0.5 inline-block h-2.5 w-[1.5px] translate-y-[1px] animate-pulse"
                            style={{ backgroundColor: BRAND }}
                            aria-hidden
                        />
                    )}
                </div>
                <AnimatePresence>
                    {showOutput &&
                        run.out.map((line, i) => (
                            <motion.div
                                key={`${runIdx}-${i}`}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18, delay: i * 0.12 }}
                                className={cn(
                                    'mt-1',
                                    line.startsWith('✓')
                                        ? 'text-[color:var(--foreground-brand)]'
                                        : 'text-white/60',
                                )}
                            >
                                {line}
                            </motion.div>
                        ))}
                </AnimatePresence>
            </div>
        </div>
    );
}

// ─── Visual: Real Components — components list w/ live preview chip ─────
const COMP_ITEMS: {
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
}[] = [
    { label: 'Button', Icon: Icons.Button },
    { label: 'Card', Icon: Icons.Box },
    { label: 'Input', Icon: Icons.Input },
    { label: 'Layers', Icon: Icons.Layers },
    { label: 'Dialog', Icon: Icons.Frame },
    { label: 'Avatar', Icon: Icons.Person },
];

function ComponentsVisual() {
    const [activeIdx, setActiveIdx] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (paused) return;
        const id = setInterval(() => {
            setActiveIdx((i) => (i + 1) % COMP_ITEMS.length);
        }, 2400);
        return () => clearInterval(id);
    }, [paused]);

    return (
        <div
            className="border-foreground-primary/10 bg-background/70 flex w-full max-w-[260px] flex-col overflow-hidden rounded-[12px] border shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)] backdrop-blur-sm"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div className="border-foreground-primary/10 flex items-center justify-between border-b px-3 py-2">
                <span className="text-style-tagline">Components</span>
                <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3" />
            </div>
            <div className="grid grid-cols-3 gap-1 p-1.5">
                {COMP_ITEMS.map((it, idx) => {
                    const isActive = idx === activeIdx;
                    return (
                        <button
                            key={it.label}
                            type="button"
                            onClick={() => setActiveIdx(idx)}
                            className="group/comp relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-[7px] p-1.5 transition-colors duration-150"
                        >
                            {isActive && (
                                <motion.span
                                    layoutId="trio-comp-active"
                                    transition={{
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 34,
                                        mass: 0.45,
                                    }}
                                    className="bg-foreground-primary/[0.06] ring-foreground-primary/15 pointer-events-none absolute inset-0 rounded-[7px] ring-1 ring-inset"
                                    aria-hidden
                                />
                            )}
                            <span
                                className={cn(
                                    'relative flex h-7 w-7 items-center justify-center rounded-[5px] border transition-colors duration-150',
                                    isActive
                                        ? 'border-foreground-primary/20 bg-foreground-primary/[0.04]'
                                        : 'border-foreground-primary/10 bg-foreground-primary/[0.02]',
                                )}
                            >
                                <it.Icon
                                    className={cn(
                                        'h-3.5 w-3.5 transition-colors duration-150',
                                        isActive
                                            ? 'text-foreground-primary'
                                            : 'text-foreground-tertiary',
                                    )}
                                />
                            </span>
                            <span
                                className={cn(
                                    'relative text-[9.5px] leading-none font-light tracking-tight transition-colors duration-150',
                                    isActive
                                        ? 'text-foreground-primary'
                                        : 'text-foreground-secondary',
                                )}
                            >
                                {it.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Section ────────────────────────────────────────────────────────────
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
                className="mb-14 max-w-2xl"
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
                        visual={<ComponentsVisual />}
                        eyebrow={tTrio('components.eyebrow' as never)}
                        title={tTrio('components.title' as never)}
                        body={tTrio('components.body' as never)}
                    />
                </div>
            </div>
        </section>
    );
}
