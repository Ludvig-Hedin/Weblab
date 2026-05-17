'use client';

import type { PanInfo } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Pause, Play } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { CarouselNavigator } from '@/components/ui/carousel-navigator';
import { Routes } from '@/utils/constants';

interface Slide {
    eyebrow: string;
    title: string;
    description: string;
    visual: React.ReactNode;
    chips: string[];
}

const SLIDE_KEYS = ['collab', 'branches', 'cms', 'deploy'] as const;

const SLIDE_VISUALS: Record<(typeof SLIDE_KEYS)[number], React.ReactNode> = {
    collab: <CollabVisual />,
    branches: <BranchesVisual />,
    cms: <CmsVisual />,
    deploy: <DeployVisual />,
};

const SLIDE_CHIPS: Record<(typeof SLIDE_KEYS)[number], string[]> = {
    collab: ['Live cursors', 'Presence', 'Comments', 'Threads'],
    branches: ['Branches', 'Checkpoints', 'Diff view', 'Preview URLs'],
    cms: ['Collections', 'Fields', 'Bindings', 'Payload'],
    deploy: ['Preview URLs', 'Custom domains', 'One-click deploy'],
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

    const goTo = useCallback(
        (next: number) => {
            setIndex(((next % slides.length) + slides.length) % slides.length);
            setProgressKey((k) => k + 1);
        },
        [slides.length],
    );

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
    }, [paused, progressKey, slides.length]);

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
                        <p className="text-foreground-secondary max-w-md text-base leading-relaxed font-light tracking-tight">
                            {t('body')}
                        </p>
                        <Link
                            href={Routes.PROJECTS}
                            className="text-foreground-primary group border-foreground-primary/15 bg-foreground-primary/5 hover:bg-foreground-primary/10 inline-flex items-center gap-3 rounded-full border py-1 pr-1 pl-4 text-sm font-medium transition-colors"
                        >
                            {t('startBuilding')}
                            <span className="bg-foreground-primary text-background inline-flex h-7 w-7 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5">
                                <ArrowRight className="h-3.5 w-3.5" />
                            </span>
                        </Link>
                    </div>
                </div>

                {/* Navigator row */}
                <div className="mt-12 flex items-center justify-between gap-3">
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
                            className="bg-muted text-foreground-secondary hover:text-foreground-primary inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
                        >
                            {paused ? (
                                <Play className="h-4 w-4" fill="currentColor" strokeWidth={0} />
                            ) : (
                                <Pause className="h-4 w-4" fill="currentColor" strokeWidth={0} />
                            )}
                        </button>
                    </div>
                    <div className="text-foreground-tertiary text-mini tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                        <span className="text-foreground-quadranary mx-1">/</span>
                        {String(slides.length).padStart(2, '0')}
                    </div>
                </div>
            </div>

            {/* Carousel viewport — extends beyond container so neighboring cards peek */}
            <div className="mt-6 select-none">
                <motion.div
                    className="flex cursor-grab pr-4 pl-4 active:cursor-grabbing md:pr-[max(2rem,calc((100vw-72rem)/2+2rem))] md:pl-[max(2rem,calc((100vw-72rem)/2+2rem))]"
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.18}
                    onDragEnd={handleDragEnd}
                    animate={{ x: 0 }}
                >
                    <div
                        className="flex w-full gap-4 transition-transform duration-700 ease-out [--slide-stride:calc(94%+1rem)] md:gap-6 md:[--slide-stride:calc(88%+1.5rem)]"
                        style={{
                            transform: `translateX(calc(-${index} * var(--slide-stride)))`,
                            willChange: 'transform',
                        }}
                    >
                        {slides.map((slide, i) => {
                            const isActive = i === index;
                            return (
                                <div
                                    key={slide.title}
                                    aria-hidden={!isActive}
                                    className="w-[94%] shrink-0 md:w-[88%]"
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
            animate={{ opacity: isActive ? 1 : 0.4, scale: isActive ? 1 : 0.98 }}
            whileHover={isActive ? undefined : { opacity: 0.7, scale: 0.99 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className={`bg-background-secondary/40 border-foreground-primary/10 grid grid-cols-1 gap-4 overflow-hidden rounded-2xl border p-4 backdrop-blur-sm md:h-[30rem] md:grid-cols-[1fr_1.4fr] md:gap-6 md:p-8 ${
                isActive ? '' : 'cursor-pointer'
            }`}
        >
            <div className="flex flex-col justify-between gap-6 p-4">
                <div>
                    <h3 className="heading-style-h4 text-foreground-primary mt-3 leading-[110%] tracking-tight">
                        {slide.title}
                    </h3>
                    <p className="text-foreground-secondary mt-4 max-w-sm text-base tracking-tight">
                        {slide.description}
                    </p>
                </div>
            </div>
            <AnimatePresence mode="wait">
                <motion.div
                    key={slide.title}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="h-[18rem] w-full md:h-full md:min-h-[16rem]"
                >
                    {slide.visual}
                </motion.div>
            </AnimatePresence>
        </motion.div>
    );
}

// ─── Visuals ─────────────────────────────────────────────────────────────
// Glassy product miniatures. Brand blue carries the eye; green and red
// step in only where they read as real product semantics: added vs.
// removed, live, resolved.

const BRAND = 'var(--foreground-brand)';
const BRAND_SOFT = 'color-mix(in srgb, var(--foreground-brand) 16%, transparent)';
const BRAND_RING = 'color-mix(in srgb, var(--foreground-brand) 40%, transparent)';
const ADD = '#3fb950';
const ADD_SOFT = 'color-mix(in srgb, #3fb950 18%, transparent)';
const REMOVE = '#f0533f';
const REMOVE_SOFT = 'color-mix(in srgb, #f0533f 16%, transparent)';

function VisualChrome({
    label,
    right,
    children,
}: {
    label: string;
    right?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="border-foreground-primary/10 bg-background-secondary/40 relative h-full w-full overflow-hidden rounded-2xl border backdrop-blur-sm">
            <div className="border-foreground-primary/10 flex items-center justify-between border-b px-3.5 py-2.5">
                <span className="text-style-tagline">{label}</span>
                {right}
            </div>
            <div className="relative h-[calc(100%-2.5rem)]">{children}</div>
        </div>
    );
}

// Soft radiating dot — small looping pulse for "live / active" states.
function PulseDot({ color = BRAND, size = 6 }: { color?: string; size?: number }) {
    return (
        <span
            className="relative inline-flex shrink-0"
            style={{ width: size, height: size }}
            aria-hidden
        >
            <motion.span
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: color }}
                animate={{ opacity: [0.55, 0, 0.55], scale: [1, 2.6, 1] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
            />
            <span
                className="relative rounded-full"
                style={{ width: size, height: size, backgroundColor: color }}
            />
        </span>
    );
}

function CollabVisual() {
    return (
        <VisualChrome
            label="canvas · landing.tsx"
            right={
                <div className="flex -space-x-1.5">
                    <span className="border-background bg-foreground-secondary text-background inline-flex h-4 w-4 items-center justify-center rounded-full border text-[8px] font-medium">
                        A
                    </span>
                    <span
                        className="border-background inline-flex h-4 w-4 items-center justify-center rounded-full border text-[8px] font-medium text-white"
                        style={{ backgroundColor: BRAND }}
                    >
                        M
                    </span>
                    <span className="border-background border-foreground-primary/10 text-foreground-tertiary bg-background inline-flex h-4 w-4 items-center justify-center rounded-full border text-[8px] font-medium">
                        +1
                    </span>
                </div>
            }
        >
            {/* One artboard, one thread — not a wall of cards. */}
            <div className="h-full p-4">
                <div className="border-foreground-primary/10 bg-background/60 relative h-full overflow-hidden rounded-xl border p-4">
                    <div className="text-foreground-quadranary mb-2.5 text-[8px]">Home</div>
                    <div className="space-y-1.5">
                        <div className="bg-foreground-primary/15 h-1.5 w-3/4 rounded-full" />
                        <div className="bg-foreground-primary/15 h-1.5 w-1/2 rounded-full" />
                    </div>

                    {/* selected element — brand ring + handle */}
                    <div className="relative mt-4 inline-block">
                        <div className="bg-foreground-primary text-background rounded-md px-2.5 py-1 text-[9px] font-medium">
                            Get started
                        </div>
                        <div
                            className="pointer-events-none absolute -inset-1 rounded-md"
                            style={{ boxShadow: `inset 0 0 0 1.5px ${BRAND}` }}
                        />
                        <span
                            className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full"
                            style={{
                                backgroundColor: BRAND,
                                boxShadow: '0 0 0 1.5px var(--background)',
                            }}
                        />
                    </div>

                    {/* comment pin */}
                    <motion.div
                        className="absolute flex h-5 w-5 items-center justify-center rounded-full rounded-bl-none text-[9px] font-medium text-white"
                        style={{ top: 16, right: 16, backgroundColor: BRAND }}
                        animate={{ scale: [1, 1.12, 1] }}
                        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                    >
                        2
                    </motion.div>

                    {/* drifting teammate cursor */}
                    <motion.div
                        className="pointer-events-none absolute"
                        style={{ left: 96, top: 56 }}
                        animate={{ x: [0, 30, 14, 0], y: [0, 18, 44, 0] }}
                        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
                    >
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                            <path
                                d="M2 1.5L11 7.5L7 8.5L5.5 12.5L2 1.5Z"
                                fill={BRAND}
                                stroke="var(--background)"
                                strokeWidth="1.2"
                            />
                        </svg>
                        <span
                            className="ml-2 inline-block rounded-full px-1.5 py-0.5 text-[8px] font-medium text-white"
                            style={{ backgroundColor: BRAND }}
                        >
                            Alex
                        </span>
                    </motion.div>

                    {/* resolved thread */}
                    <div className="border-foreground-primary/10 bg-background absolute right-3 bottom-3 left-3 rounded-xl border p-2.5">
                        <div className="flex items-center gap-1.5">
                            <span
                                className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[7px] font-medium text-white"
                                style={{ backgroundColor: BRAND }}
                            >
                                M
                            </span>
                            <span className="text-foreground-primary text-[9px] font-medium">
                                Maya
                            </span>
                            <span className="text-foreground-quadranary text-[8px]">2m ago</span>
                            <span
                                className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-medium"
                                style={{ backgroundColor: ADD_SOFT, color: ADD }}
                            >
                                <svg
                                    width="7"
                                    height="7"
                                    viewBox="0 0 12 12"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M2 6.5L5 9.5L10 3.5" />
                                </svg>
                                resolved
                            </span>
                        </div>
                        <p className="text-foreground-secondary mt-1 text-[8px] leading-tight font-light">
                            Can we use the spacing-md token here?
                        </p>
                    </div>
                </div>
            </div>
        </VisualChrome>
    );
}

function BranchesVisual() {
    return (
        <VisualChrome
            label="branches · 2 active"
            right={
                <div className="text-foreground-tertiary flex items-center gap-1.5 text-[9px]">
                    <span className="bg-foreground-primary h-1.5 w-1.5 rounded-full" />
                    main
                </div>
            }
        >
            <div className="relative h-full px-6 py-6">
                {/* vertical stem connecting main → merge */}
                <div className="bg-foreground-primary/15 absolute top-9 bottom-10 left-[1.81rem] w-px" />

                {/* main */}
                <div className="relative flex items-center gap-3">
                    <div className="border-foreground-primary bg-background z-10 h-2.5 w-2.5 rounded-full border-2" />
                    <div>
                        <div className="text-foreground-primary text-[10px] font-medium">main</div>
                        <div className="text-foreground-quadranary text-[9px]">
                            latest release · 12m ago
                        </div>
                    </div>
                </div>

                {/* active feature branch — one preview thumb, not a stack */}
                <div className="relative mt-6 flex items-center gap-3 pl-5">
                    <div className="border-foreground-primary/20 absolute top-1 left-1.5 h-4 w-4 rounded-bl-md border-b border-l" />
                    <span className="relative z-10 flex h-2.5 w-2.5 shrink-0">
                        <motion.span
                            className="absolute inset-0 rounded-full"
                            style={{ backgroundColor: BRAND }}
                            animate={{ opacity: [0.5, 0, 0.5], scale: [1, 2.4, 1] }}
                            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
                        />
                        <span
                            className="relative h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: BRAND }}
                        />
                    </span>
                    <div className="flex flex-1 items-center gap-2.5">
                        <div
                            className="bg-background h-9 w-12 shrink-0 overflow-hidden rounded-md border"
                            style={{ borderColor: BRAND_RING }}
                        >
                            <div className="h-2.5" style={{ backgroundColor: BRAND_SOFT }} />
                            <div className="bg-foreground-primary/15 m-1.5 h-1 w-2/3 rounded-full" />
                            <div className="bg-foreground-primary/15 mx-1.5 h-1 w-1/2 rounded-full" />
                        </div>
                        <div className="flex-1">
                            <div className="text-foreground-primary text-[10px] font-medium">
                                feature/pricing-v2
                            </div>
                            <div className="text-foreground-quadranary text-[9px]">
                                checkpoint · 4m ago
                            </div>
                        </div>
                        <span
                            className="rounded-full px-2 py-0.5 text-[9px] font-medium"
                            style={{ backgroundColor: BRAND_SOFT, color: BRAND }}
                        >
                            restore
                        </span>
                    </div>
                </div>

                {/* merge ready — colored diff */}
                <div className="relative mt-6 flex items-center gap-3">
                    <div className="bg-foreground-primary z-10 h-2.5 w-2.5 rounded-full" />
                    <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-foreground-tertiary">merge ready</span>
                        <motion.span
                            className="rounded-full px-1.5 py-0.5 font-medium"
                            style={{ backgroundColor: ADD_SOFT, color: ADD }}
                            animate={{ opacity: [0.7, 1, 0.7] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                        >
                            +124
                        </motion.span>
                        <span
                            className="rounded-full px-1.5 py-0.5 font-medium"
                            style={{ backgroundColor: REMOVE_SOFT, color: REMOVE }}
                        >
                            -38
                        </span>
                    </div>
                </div>
            </div>
        </VisualChrome>
    );
}

function CmsVisual() {
    const collections = [
        { name: 'Posts', count: 28, active: true },
        { name: 'Authors', count: 6, active: false },
        { name: 'Pages', count: 12, active: false },
        { name: 'Tags', count: 19, active: false },
    ];
    const fields = [
        { label: 'Title', value: 'Launch week, day 3' },
        { label: 'Author', value: 'authors / maya' },
    ];
    return (
        <VisualChrome
            label="cms · collections"
            right={
                <div className="flex items-center gap-1.5">
                    <PulseDot color={ADD} size={5} />
                    <span className="text-foreground-quadranary text-[9px]">synced</span>
                </div>
            }
        >
            <div className="grid h-full grid-cols-[104px_1fr]">
                {/* Collections sidebar */}
                <div className="border-foreground-primary/10 bg-background/40 space-y-1 border-r p-2">
                    <div className="text-foreground-quadranary mb-1 px-2 text-[8px]">
                        Collections
                    </div>
                    {collections.map((c) => (
                        <div
                            key={c.name}
                            className={`flex items-center justify-between rounded-md px-2 py-1 text-[10px] ${
                                c.active
                                    ? 'bg-foreground-primary/[0.06] text-foreground-primary ring-foreground-primary/10 ring-1 ring-inset'
                                    : 'text-foreground-secondary'
                            }`}
                        >
                            <span className="font-light">{c.name}</span>
                            <span
                                className={`text-[9px] ${
                                    c.active
                                        ? 'text-foreground-tertiary'
                                        : 'text-foreground-quadranary'
                                }`}
                            >
                                {c.count}
                            </span>
                        </div>
                    ))}
                </div>
                {/* Item editor */}
                <div className="flex flex-col gap-1.5 overflow-hidden p-3">
                    <div className="text-foreground-quadranary text-[9px]">
                        Editing · post / launch-week
                    </div>
                    {fields.map((f) => (
                        <div
                            key={f.label}
                            className="border-foreground-primary/10 bg-background/60 rounded-lg border px-2.5 py-1.5"
                        >
                            <div className="text-foreground-quadranary text-[8px]">{f.label}</div>
                            <div className="text-foreground-primary mt-0.5 text-[10px] font-light">
                                {f.value}
                            </div>
                        </div>
                    ))}
                    <div className="border-foreground-primary/10 bg-background/60 rounded-lg border px-2.5 py-1.5">
                        <div className="text-foreground-quadranary text-[8px]">Body</div>
                        <div className="mt-1 space-y-1">
                            <div className="bg-foreground-primary/15 h-1 w-11/12 rounded-full" />
                            <div className="bg-foreground-primary/15 h-1 w-8/12 rounded-full" />
                        </div>
                    </div>
                    <div className="mt-auto flex items-center gap-2">
                        <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-medium"
                            style={{ backgroundColor: ADD_SOFT, color: ADD }}
                        >
                            <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: ADD }}
                            />
                            Published
                        </span>
                        <span className="text-foreground-quadranary text-[9px]">no code push</span>
                    </div>
                </div>
            </div>
        </VisualChrome>
    );
}

function DeployVisual() {
    const logLines: { text: string; tone: 'dim' | 'ok' | 'add' }[] = [
        { text: '$ bun run build', tone: 'dim' },
        { text: '✓ Compiled in 4.2s', tone: 'ok' },
        { text: '✓ Bundled · 248kb gzipped', tone: 'ok' },
        { text: '✓ Deployed to production', tone: 'add' },
    ];
    const toneColor: Record<'dim' | 'ok' | 'add', string> = {
        dim: 'var(--foreground-quadranary)',
        ok: 'var(--foreground-secondary)',
        add: ADD,
    };
    return (
        <VisualChrome
            label="deployments"
            right={
                <div
                    className="flex items-center gap-1.5 rounded-full px-2 py-0.5"
                    style={{ backgroundColor: ADD_SOFT }}
                >
                    <PulseDot color={ADD} size={5} />
                    <span className="text-[9px] font-medium" style={{ color: ADD }}>
                        Live · 14s ago
                    </span>
                </div>
            }
        >
            <div className="flex h-full flex-col gap-2.5 p-3">
                {/* Active deploy */}
                <div className="border-foreground-primary/10 bg-background/60 rounded-xl border p-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-foreground-primary text-[10px] font-medium">
                                feature/landing-redo
                            </span>
                            <span className="text-foreground-quadranary text-[9px]">7f3a92c</span>
                        </div>
                        <span
                            className="rounded-full px-2 py-0.5 text-[9px] font-medium"
                            style={{ backgroundColor: ADD_SOFT, color: ADD }}
                        >
                            Live
                        </span>
                    </div>
                    <div className="border-foreground-primary/10 bg-background-secondary/60 mt-2 flex items-center gap-1.5 rounded-lg border px-2 py-1.5">
                        <svg
                            width="10"
                            height="10"
                            viewBox="0 0 12 12"
                            className="text-foreground-quadranary"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                        >
                            <path d="M5 7L3 9C1.7 10.3 1.7 11.7 3 11C4.3 10.3 5 9 5 8" />
                            <path d="M7 5L9 3C10.3 1.7 11.7 1.7 11 3C10.3 4.3 9 5 8 5" />
                            <path d="M4.5 7.5L7.5 4.5" />
                        </svg>
                        <span className="text-foreground-secondary flex-1 truncate text-[9px]">
                            weblab.build/preview/7f3a
                        </span>
                        <span className="border-foreground-primary/10 bg-background text-foreground-tertiary rounded border px-1.5 py-0.5 text-[8px]">
                            copy
                        </span>
                    </div>
                </div>

                {/* Build log — lines stream in */}
                <div className="border-foreground-primary/10 bg-background-secondary/60 flex-1 rounded-xl border p-3 text-[9px] leading-relaxed">
                    {logLines.map((l, i) => (
                        <motion.div
                            key={l.text}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.4 + i * 0.4, duration: 0.4, ease: 'easeOut' }}
                            style={{ color: toneColor[l.tone] }}
                        >
                            {l.text}
                        </motion.div>
                    ))}
                </div>

                {/* Footer */}
                <div className="text-foreground-tertiary flex items-center gap-2 text-[9px]">
                    <span className="border-foreground-primary/10 bg-background rounded border px-1.5 py-0.5">
                        v1.6
                    </span>
                    <span className="border-foreground-primary/10 bg-background rounded border px-1.5 py-0.5">
                        v1.5
                    </span>
                    <span className="text-foreground-quadranary">domain weblab.build</span>
                </div>
            </div>
        </VisualChrome>
    );
}
