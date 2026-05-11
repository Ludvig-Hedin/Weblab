'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Reveal } from '@/components/motion/reveal';
import { SplitText } from '@/components/motion/split-text';
import { ClaudeIcon, DeepSeekIcon, GeminiIcon, KimiIcon, OpenAIIcon } from './provider-icons';

type DescriptionKey =
    | 'gpt'
    | 'gptMini'
    | 'gptNano'
    | 'sonnet'
    | 'opus'
    | 'haiku'
    | 'gemini'
    | 'geminiFlash'
    | 'deepseek'
    | 'deepseekCoder'
    | 'kimi'
    | 'kimiLong';

interface ModelOption {
    name: string;
    descriptionKey: DescriptionKey;
    icon: React.ReactNode;
}

const MODELS: ModelOption[] = [
    { name: 'GPT-5.5', descriptionKey: 'gpt', icon: <OpenAIIcon className="h-3.5 w-3.5" /> },
    {
        name: 'GPT-5.5 Mini',
        descriptionKey: 'gptMini',
        icon: <OpenAIIcon className="h-3.5 w-3.5" />,
    },
    {
        name: 'GPT-5.5 Nano',
        descriptionKey: 'gptNano',
        icon: <OpenAIIcon className="h-3.5 w-3.5" />,
    },
    {
        name: 'Claude Sonnet 4.6',
        descriptionKey: 'sonnet',
        icon: <ClaudeIcon className="h-3.5 w-3.5" />,
    },
    {
        name: 'Claude Opus 4.7',
        descriptionKey: 'opus',
        icon: <ClaudeIcon className="h-3.5 w-3.5" />,
    },
    {
        name: 'Claude Haiku 4',
        descriptionKey: 'haiku',
        icon: <ClaudeIcon className="h-3.5 w-3.5" />,
    },
    {
        name: 'Gemini 3.1 Pro',
        descriptionKey: 'gemini',
        icon: <GeminiIcon className="h-3.5 w-3.5" />,
    },
    {
        name: 'Gemini 3 Flash',
        descriptionKey: 'geminiFlash',
        icon: <GeminiIcon className="h-3.5 w-3.5" />,
    },
    {
        name: 'DeepSeek V4 Pro',
        descriptionKey: 'deepseek',
        icon: <DeepSeekIcon className="h-3.5 w-3.5" />,
    },
    {
        name: 'DeepSeek Coder',
        descriptionKey: 'deepseekCoder',
        icon: <DeepSeekIcon className="h-3.5 w-3.5" />,
    },
    { name: 'Kimi K2.6', descriptionKey: 'kimi', icon: <KimiIcon className="h-3.5 w-3.5" /> },
    {
        name: 'Kimi K2 Long',
        descriptionKey: 'kimiLong',
        icon: <KimiIcon className="h-3.5 w-3.5" />,
    },
];

const CYCLE_MS = 4000;

function ModelPicker() {
    const t = useTranslations('landing.modelAgnostic.models');
    const [activeIndex, setActiveIndex] = useState(0);
    const [isHovering, setIsHovering] = useState(false);
    const listRef = useRef<HTMLUListElement | null>(null);
    const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
    const mountedRef = useRef(false);

    // Auto-cycle when not hovering
    useEffect(() => {
        if (isHovering) return;
        const id = setInterval(() => {
            setActiveIndex((i) => (i + 1) % MODELS.length);
        }, CYCLE_MS);
        return () => clearInterval(id);
    }, [isHovering]);

    // Auto-scroll active row inside the list (NEVER scroll the page).
    // scrollIntoView would bubble up to the window and hijack page scroll —
    // scroll the <ul> directly via scrollTop math.
    useEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            return;
        }
        if (isHovering) return;
        const ul = listRef.current;
        const row = rowRefs.current[activeIndex];
        if (!ul || !row) return;
        const rowTop = row.offsetTop;
        const rowBottom = rowTop + row.offsetHeight;
        const viewTop = ul.scrollTop;
        const viewBottom = viewTop + ul.clientHeight;
        if (rowTop < viewTop) {
            ul.scrollTo({ top: rowTop, behavior: 'smooth' });
        } else if (rowBottom > viewBottom) {
            ul.scrollTo({ top: rowBottom - ul.clientHeight, behavior: 'smooth' });
        }
    }, [activeIndex, isHovering]);

    return (
        <div
            className="border-foreground-primary/10 bg-background-secondary/40 w-full max-w-sm rounded-2xl border p-1.5 backdrop-blur-sm"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            <ul
                ref={listRef}
                className="[&::-webkit-scrollbar-thumb]:bg-foreground-primary/10 relative max-h-[320px] overflow-y-auto select-none [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
            >
                {MODELS.map((m, idx) => {
                    const isActive = idx === activeIndex;
                    return (
                        <li
                            key={m.name}
                            ref={(el) => {
                                rowRefs.current[idx] = el;
                            }}
                            className="relative"
                        >
                            {isActive && (
                                <motion.span
                                    layoutId="model-active-bg"
                                    transition={{
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 34,
                                        mass: 0.45,
                                    }}
                                    className="bg-foreground-primary/[0.06] ring-foreground-primary/10 pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset"
                                    aria-hidden
                                />
                            )}
                            <button
                                type="button"
                                onClick={() => setActiveIndex(idx)}
                                aria-pressed={isActive}
                                className="hover:bg-foreground-primary/[0.04] relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--foreground-brand))]"
                            >
                                <span className="text-foreground-secondary flex h-5 w-5 shrink-0 items-center justify-center">
                                    {m.icon}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="text-small text-foreground-primary leading-tight font-light tracking-tight">
                                        {m.name}
                                    </div>
                                    <div className="text-mini text-foreground-tertiary mt-0.5 truncate font-light">
                                        {t(m.descriptionKey)}
                                    </div>
                                </div>
                                {isActive && (
                                    <motion.span
                                        layoutId="model-active-dot"
                                        transition={{
                                            type: 'spring',
                                            stiffness: 380,
                                            damping: 34,
                                            mass: 0.45,
                                        }}
                                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--foreground-brand))]"
                                        aria-hidden
                                    />
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function Headline() {
    const t = useTranslations('landing.modelAgnostic');
    return (
        <Reveal className="max-w-md">
            <div className="text-mini text-foreground-primary/70 font-mono tracking-wider uppercase">
                {t('eyebrow')}
            </div>
            <SplitText
                as="h2"
                delay={0.05}
                className="heading-style-h3 text-foreground-primary mt-3 text-balance"
            >
                {t('headline')}
            </SplitText>
            <p className="text-foreground-secondary mt-5 max-w-md text-base leading-relaxed font-light tracking-tight text-balance">
                {t('body')}
            </p>
        </Reveal>
    );
}

export function ModelAgnosticSection() {
    return (
        <section
            className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32"
            id="model-agnostic"
        >
            {/* Mobile: stacked */}
            <div className="flex flex-col gap-12 md:hidden">
                <Headline />
                <div>
                    <ModelPicker />
                </div>
            </div>

            {/* Desktop: split */}
            <div className="hidden md:grid md:grid-cols-2 md:items-center md:gap-16 lg:gap-24">
                <div className="flex justify-start lg:pl-4">
                    <ModelPicker />
                </div>
                <Headline />
            </div>
        </section>
    );
}
