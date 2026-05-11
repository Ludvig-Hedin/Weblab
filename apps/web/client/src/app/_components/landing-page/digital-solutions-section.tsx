'use client';

import type { PanInfo } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowRight, Pause, Play } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { CarouselNavigator } from '@/components/ui/carousel-navigator';
import { Routes } from '@/utils/constants';

interface Slide {
    eyebrow: string;
    title: string;
    description: string;
    visual: React.ReactNode;
    chips: string[];
}

const SLIDE_KEYS = ['aiNative', 'web', 'apps', 'brand'] as const;

const SLIDE_VISUALS: Record<(typeof SLIDE_KEYS)[number], React.ReactNode> = {
    aiNative: <AiVisual />,
    web: <DashboardVisual />,
    apps: <PhoneVisual />,
    brand: <BrandVisual />,
};

const SLIDE_CHIPS: Record<(typeof SLIDE_KEYS)[number], string[]> = {
    aiNative: ['OpenAI', 'Anthropic', 'Gemini', 'RAG', 'Evals'],
    web: ['Next.js', 'React', 'Tailwind', 'tRPC', 'Postgres'],
    apps: ['Swift', 'Kotlin', 'React Native', 'Expo', 'TestFlight'],
    brand: ['Figma', 'Design Tokens', 'Storybook', 'Motion', 'Accessibility'],
};

const AUTO_DELAY = 6000;
const SWIPE_THRESHOLD = 64; // px
const SWIPE_VELOCITY = 0.25; // motion velocity

export function DigitalSolutionsSection() {
    const t = useTranslations('landing.digitalSolutions') as (key: string) => string;
    const slides: Slide[] = useMemo(
        () =>
            SLIDE_KEYS.map((key) => ({
                eyebrow: t(`slides.${key}.eyebrow`),
                title: t(`slides.${key}.title`),
                description: t(`slides.${key}.description`),
                visual: SLIDE_VISUALS[key],
                chips: SLIDE_CHIPS[key],
            })),
        [t],
    );

    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const [progressKey, setProgressKey] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const goTo = useCallback((next: number) => {
        setIndex(((next % slides.length) + slides.length) % slides.length);
        setProgressKey((k) => k + 1);
    }, [slides.length]);

    const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
    const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);

    useEffect(() => {
        if (paused) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }
        intervalRef.current = setInterval(() => {
            setIndex((prev) => (prev + 1) % slides.length);
            setProgressKey((k) => k + 1);
        }, AUTO_DELAY);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [paused, progressKey]);

    const handleDragEnd = useCallback(
        (_: unknown, info: PanInfo) => {
            const { offset, velocity } = info;
            if (offset.x < -SWIPE_THRESHOLD || velocity.x < -SWIPE_VELOCITY) {
                goNext();
            } else if (offset.x > SWIPE_THRESHOLD || velocity.x > SWIPE_VELOCITY) {
                goPrev();
            }
        },
        [goNext, goPrev],
    );

    return (
        // outer wrapper clips horizontal overflow so the peeking carousel
        // can extend past the page container without causing horizontal scroll
        <section className="relative overflow-x-clip py-32">
            <div className="mx-auto w-full max-w-6xl px-8">
                {/* Heading row */}
                <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
                    <h2 className="heading-style-h2 text-foreground-primary">
                        {t('titleLine1')}
                        <br />
                        {t('titleLine2')}
                        <br />
                        {t('titleLine3')}
                    </h2>
                    <div className="flex flex-col items-start justify-end gap-6">
                        <p className="text-foreground-secondary text-regular max-w-md font-light">
                            {t('body')}
                        </p>
                        <Link
                            href={Routes.PROJECTS}
                            className="text-foreground-primary group border-foreground-primary/15 bg-foreground-primary/5 hover:bg-foreground-primary/10 inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                        >
                            {t('startBuilding')}
                            <span className="bg-foreground-primary text-background inline-flex h-7 w-7 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5">
                                <ArrowRight className="h-3.5 w-3.5" />
                            </span>
                        </Link>
                    </div>
                </div>

                {/* Navigator row */}
                <div className="mt-16 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <CarouselNavigator
                            totalSlides={slides.length}
                            currentIndex={index}
                            onIndexChange={goTo}
                            autoDelay={AUTO_DELAY}
                            paused={paused}
                            progressKey={progressKey}
                        />
                        <button
                            type="button"
                            onClick={() => setPaused((p) => !p)}
                            aria-label={paused ? t('play') : t('pause')}
                            aria-pressed={paused}
                            className="border-foreground-primary/10 bg-background-weblab/60 text-foreground-primary hover:bg-foreground-primary/10 inline-flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition-colors"
                        >
                            {paused ? (
                                <Play className="h-3.5 w-3.5" />
                            ) : (
                                <Pause className="h-3.5 w-3.5" />
                            )}
                        </button>
                    </div>
                    <div className="text-foreground-tertiary text-mini font-mono tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                        <span className="text-foreground-quadranary mx-1">/</span>
                        {String(slides.length).padStart(2, '0')}
                    </div>
                </div>
            </div>

            {/* Carousel viewport — extends beyond container so neighboring cards peek */}
            <div className="mt-8 select-none">
                <motion.div
                    className="flex cursor-grab pr-[max(2rem,calc((100vw-72rem)/2+2rem))] pl-[max(2rem,calc((100vw-72rem)/2+2rem))] active:cursor-grabbing"
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.18}
                    onDragEnd={handleDragEnd}
                    animate={{ x: 0 }}
                >
                    <div
                        className="flex w-full gap-6 transition-transform duration-700 ease-out"
                        style={{
                            transform: `translateX(calc(-${index} * (88% + 1.5rem)))`,
                            willChange: 'transform',
                        }}
                    >
                        {slides.map((slide, i) => {
                            const isActive = i === index;
                            return (
                                <div
                                    key={slide.title}
                                    aria-hidden={!isActive}
                                    className="w-[88%] shrink-0"
                                >
                                    <SlideCard
                                        slide={slide}
                                        isActive={isActive}
                                        onActivate={() => goTo(i)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            </div>
        </section>
    );
}

function SlideCard({
    slide,
    isActive,
    onActivate,
}: {
    slide: Slide;
    isActive: boolean;
    onActivate: () => void;
}) {
    return (
        <motion.div
            onClick={isActive ? undefined : onActivate}
            animate={{ opacity: isActive ? 1 : 0.35, scale: isActive ? 1 : 0.97 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className={`border-foreground-primary/10 bg-background-weblab/60 grid h-[30rem] grid-cols-1 gap-6 overflow-hidden rounded-3xl border p-6 backdrop-blur-md md:grid-cols-[1fr_1.4fr] ${
                isActive ? '' : 'cursor-pointer'
            }`}
        >
            <div className="flex flex-col justify-between gap-6">
                <div>
                    <span className="text-foreground-tertiary text-mini font-mono tracking-[0.18em] uppercase">
                        {slide.eyebrow}
                    </span>
                    <h3 className="heading-style-h4 text-foreground-primary mt-3">
                        {slide.title}
                    </h3>
                    <p className="text-foreground-secondary text-regular mt-4 max-w-sm font-light">
                        {slide.description}
                    </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {slide.chips.map((chip) => (
                        <span
                            key={chip}
                            className="border-foreground-primary/10 bg-foreground-primary/[0.04] text-foreground-secondary text-mini rounded-full border px-2.5 py-1 font-mono tracking-tight"
                        >
                            {chip}
                        </span>
                    ))}
                </div>
            </div>
            <AnimatePresence mode="wait">
                <motion.div
                    key={slide.title}
                    initial={{ opacity: 0, scale: 1.02 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    className="h-full min-h-[16rem] w-full"
                >
                    {slide.visual}
                </motion.div>
            </AnimatePresence>
        </motion.div>
    );
}

// ─── Visuals ─────────────────────────────────────────────────────────────

function AiVisual() {
    return (
        <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-orange-300 via-amber-200 to-blue-400">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(255,200,120,0.45),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_70%,rgba(80,140,255,0.35),transparent_55%)]" />
            <div className="absolute bottom-8 left-1/2 flex w-[78%] max-w-md -translate-x-1/2 items-center gap-2 rounded-full border border-white/40 bg-white/15 px-3 py-2 shadow-lg backdrop-blur-xl">
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-white/30 text-white">
                    +
                </div>
                <span className="flex-1 text-sm text-white/90">Summarize this customer call…</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white">
                    <ArrowRight className="h-4 w-4" />
                </div>
            </div>
            <div className="absolute top-6 right-6 left-6 flex flex-col gap-2">
                <div className="text-mini font-mono tracking-[0.18em] text-white/70 uppercase">
                    Agent · gpt-4o · 12ms
                </div>
                <div className="space-y-1.5">
                    <div className="h-2 w-3/4 rounded-full bg-white/40" />
                    <div className="h-2 w-2/3 rounded-full bg-white/25" />
                    <div className="h-2 w-1/2 rounded-full bg-white/20" />
                </div>
            </div>
        </div>
    );
}

function DashboardVisual() {
    const bars = [38, 56, 42, 70, 64, 88, 72, 95, 80, 110, 92, 124];
    return (
        <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-600 to-fuchsia-500">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(255,255,255,0.25),transparent_55%)]" />
            <div className="absolute inset-5 rounded-2xl border border-white/15 bg-zinc-950/70 shadow-2xl backdrop-blur-xl">
                {/* App chrome */}
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-red-400/80" />
                        <div className="h-2 w-2 rounded-full bg-yellow-400/80" />
                        <div className="h-2 w-2 rounded-full bg-green-400/80" />
                        <div className="ml-3 h-2 w-32 rounded-full bg-white/10" />
                    </div>
                    <div className="text-mini font-mono text-white/40">app.weblab.build</div>
                </div>
                <div className="grid h-[calc(100%-2.75rem)] grid-cols-[120px_1fr]">
                    {/* Sidebar */}
                    <div className="space-y-1.5 border-r border-white/10 p-3">
                        {['Overview', 'Pipeline', 'Reports', 'Settings'].map((label, idx) => (
                            <div
                                key={label}
                                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                                    idx === 0 ? 'bg-white/15 text-white' : 'text-white/50'
                                }`}
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                                {label}
                            </div>
                        ))}
                    </div>
                    {/* Body */}
                    <div className="flex flex-col gap-3 p-4">
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: 'MRR', value: '$48.2k', delta: '+12%' },
                                { label: 'Active', value: '1,284', delta: '+3.4%' },
                                { label: 'Churn', value: '1.8%', delta: '-0.4%' },
                            ].map((kpi) => (
                                <div
                                    key={kpi.label}
                                    className="rounded-lg border border-white/10 bg-white/5 p-2.5"
                                >
                                    <div className="text-mini text-white/40">{kpi.label}</div>
                                    <div className="mt-1 text-base font-medium text-white">
                                        {kpi.value}
                                    </div>
                                    <div className="text-mini text-emerald-300/90">{kpi.delta}</div>
                                </div>
                            ))}
                        </div>
                        <div className="flex-1 rounded-lg border border-white/10 bg-white/5 p-3">
                            <div className="flex h-full items-end gap-1.5">
                                {bars.map((h, i) => (
                                    <div
                                        key={i}
                                        className="flex-1 rounded-sm bg-gradient-to-t from-fuchsia-400/80 to-indigo-300/80"
                                        style={{ height: `${(h / 130) * 100}%` }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PhoneVisual() {
    const apps = [
        { name: 'Messages', cls: 'bg-gradient-to-br from-green-400 to-green-600' },
        { name: 'Calendar', cls: 'bg-white text-zinc-900' },
        { name: 'Photos', cls: 'bg-gradient-to-br from-pink-400 to-yellow-300' },
        { name: 'Camera', cls: 'bg-gradient-to-br from-zinc-700 to-zinc-900' },
        { name: 'Maps', cls: 'bg-gradient-to-br from-emerald-300 to-blue-400' },
        { name: 'Music', cls: 'bg-gradient-to-br from-pink-500 to-rose-400' },
        { name: 'Health', cls: 'bg-zinc-900' },
        { name: 'Wallet', cls: 'bg-gradient-to-br from-zinc-800 to-black' },
    ];
    return (
        <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-teal-300 via-sky-400 to-indigo-500">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
            {/* Phone */}
            <div className="absolute top-1/2 left-1/2 h-[88%] w-[48%] -translate-x-1/2 -translate-y-1/2 rounded-[2.5rem] border border-black/40 bg-black p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)]">
                <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-gradient-to-b from-sky-300 via-indigo-400 to-violet-500">
                    {/* Status bar */}
                    <div className="flex items-center justify-between px-5 pt-2.5 text-[10px] font-semibold text-white">
                        <span>9:41</span>
                        <span className="inline-flex h-3 w-12 rounded-full bg-black/40" />
                        <span className="inline-flex items-center gap-0.5">
                            <span className="h-2 w-1 rounded-sm bg-white/80" />
                            <span className="h-2 w-1 rounded-sm bg-white/80" />
                            <span className="h-2 w-1 rounded-sm bg-white/60" />
                            <span className="ml-1 h-2 w-4 rounded-sm bg-white/80" />
                        </span>
                    </div>
                    {/* Widget */}
                    <div className="mx-3 mt-4 rounded-2xl bg-white/85 p-3 text-zinc-900 shadow">
                        <div className="text-[9px] tracking-wider text-zinc-500 uppercase">
                            Today
                        </div>
                        <div className="mt-0.5 text-[13px] leading-tight font-semibold">
                            Standup · 9:30
                        </div>
                        <div className="mt-1.5 h-1 w-3/4 rounded-full bg-zinc-200" />
                        <div className="mt-1 h-1 w-1/2 rounded-full bg-zinc-200" />
                    </div>
                    {/* Grid */}
                    <div className="mt-4 grid grid-cols-4 gap-3 px-4">
                        {apps.map((app) => (
                            <div key={app.name} className="flex flex-col items-center gap-1">
                                <div
                                    className={`flex h-8 w-8 items-center justify-center rounded-[10px] shadow-md ${app.cls}`}
                                />
                                <span className="text-[8px] text-white/85">{app.name}</span>
                            </div>
                        ))}
                    </div>
                    {/* Dock */}
                    <div className="absolute inset-x-3 bottom-3 flex justify-around rounded-2xl bg-white/15 p-2 backdrop-blur-md">
                        {[
                            'bg-gradient-to-br from-blue-400 to-blue-600',
                            'bg-gradient-to-br from-zinc-700 to-zinc-900',
                            'bg-gradient-to-br from-fuchsia-400 to-purple-500',
                            'bg-gradient-to-br from-emerald-300 to-teal-500',
                        ].map((cls, i) => (
                            <div key={i} className={`h-8 w-8 rounded-[10px] shadow ${cls}`} />
                        ))}
                    </div>
                    {/* Home indicator */}
                    <div className="absolute bottom-1 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-white/70" />
                </div>
            </div>
        </div>
    );
}

function BrandVisual() {
    const palette = [
        'bg-zinc-900',
        'bg-orange-400',
        'bg-amber-200',
        'bg-emerald-400',
        'bg-sky-500',
        'bg-violet-500',
    ];
    return (
        <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-100 via-zinc-50 to-zinc-200">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(255,255,255,0.7),transparent_55%)]" />
            <div className="absolute inset-5 grid grid-cols-2 grid-rows-3 gap-3">
                {/* Type sample */}
                <div className="row-span-2 flex flex-col justify-between rounded-xl bg-white p-4 shadow-sm">
                    <div className="font-mono text-[10px] tracking-[0.2em] text-zinc-400 uppercase">
                        Typography
                    </div>
                    <div className="flex items-end gap-2 text-zinc-900">
                        <span className="leading-none font-light" style={{ fontSize: '6rem' }}>
                            Aa
                        </span>
                        <div className="mb-2 flex flex-col text-[10px] text-zinc-500">
                            <span>Display · 96</span>
                            <span>Body · 16</span>
                            <span>Caption · 12</span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="h-1.5 w-4/5 rounded-full bg-zinc-200" />
                        <div className="h-1.5 w-3/5 rounded-full bg-zinc-200" />
                    </div>
                </div>
                {/* Logo card */}
                <div className="flex items-center justify-center rounded-xl bg-zinc-900 p-4 text-white shadow-sm">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white text-zinc-900">
                            <span className="text-base font-semibold">w</span>
                        </span>
                        <span className="text-base font-medium tracking-tight">weblab</span>
                    </div>
                </div>
                {/* Component pills */}
                <div className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow-sm">
                    <div className="font-mono text-[10px] tracking-[0.2em] text-zinc-400 uppercase">
                        Components
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        <span className="rounded-md bg-zinc-900 px-2 py-1 text-[10px] text-white">
                            Button
                        </span>
                        <span className="rounded-md border border-zinc-200 px-2 py-1 text-[10px] text-zinc-700">
                            Outline
                        </span>
                        <span className="rounded-md bg-orange-400 px-2 py-1 text-[10px] text-white">
                            Badge
                        </span>
                        <span className="rounded-full border border-zinc-200 px-2 py-1 text-[10px] text-zinc-700">
                            Chip
                        </span>
                    </div>
                </div>
                {/* Palette */}
                <div className="col-span-2 flex flex-col gap-2 rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="font-mono text-[10px] tracking-[0.2em] text-zinc-400 uppercase">
                            Palette · Tokens
                        </div>
                        <div className="font-mono text-[10px] text-zinc-400">12 / 24</div>
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                        {palette.map((c) => (
                            <div
                                key={c}
                                className={`aspect-square rounded-md border border-black/5 shadow-sm ${c}`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
