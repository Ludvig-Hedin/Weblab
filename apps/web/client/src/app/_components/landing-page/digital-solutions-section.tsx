'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { Icons } from '@weblab/ui/icons';

import { CarouselNavigator } from '@/components/ui/carousel-navigator';
import { Routes } from '@/utils/constants';

interface Slide {
    title: string;
    description: string;
    visual: React.ReactNode;
    badges: React.ReactNode;
}

const SLIDES: Slide[] = [
    {
        title: 'AI-native products',
        description:
            'Ship AI features users actually trust. We help you wire OpenAI, Claude, and Gemini into your product with the right guardrails — so the value is real, not a demo.',
        visual: (
            <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-orange-300 via-amber-200 to-blue-400">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(255,200,120,0.45),transparent_60%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_70%,rgba(80,140,255,0.35),transparent_55%)]" />
                <div className="absolute bottom-10 left-1/2 flex w-[80%] max-w-md -translate-x-1/2 items-center gap-2 rounded-full border border-white/40 bg-white/15 px-3 py-2 shadow-lg backdrop-blur-xl">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-white/30 text-white">
                        +
                    </div>
                    <span className="flex-1 text-sm text-white/90">Ask anything…</span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white">
                        <ArrowRight className="h-4 w-4" />
                    </div>
                </div>
            </div>
        ),
        badges: (
            <div className="flex items-center gap-2">
                <BadgeIcon label="Sparkles" className="bg-foreground-primary text-background">
                    <Icons.Sparkles className="h-4 w-4" />
                </BadgeIcon>
                <BadgeIcon label="Gemini" className="bg-white text-black">
                    <Icons.GeminiLogo className="h-4 w-4" />
                </BadgeIcon>
                <BadgeIcon label="Magic" className="bg-orange-500 text-white">
                    <Icons.MagicWand className="h-4 w-4" />
                </BadgeIcon>
            </div>
        ),
    },
    {
        title: 'Web that converts',
        description:
            'Marketing sites, dashboards, and SaaS surfaces built on a real codebase — pixel-tight in design, fast in production, and easy for your team to keep shipping.',
        visual: (
            <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-800 via-zinc-900 to-black">
                <div className="absolute inset-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                    <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
                        <span className="h-2 w-2 rounded-full bg-red-400/80" />
                        <span className="h-2 w-2 rounded-full bg-yellow-400/80" />
                        <span className="h-2 w-2 rounded-full bg-green-400/80" />
                    </div>
                    <div className="space-y-2 p-4">
                        <div className="h-3 w-2/3 rounded-full bg-white/15" />
                        <div className="h-3 w-1/2 rounded-full bg-white/10" />
                        <div className="mt-6 grid grid-cols-3 gap-2">
                            <div className="h-12 rounded-md bg-white/8" />
                            <div className="h-12 rounded-md bg-white/12" />
                            <div className="h-12 rounded-md bg-white/8" />
                        </div>
                    </div>
                </div>
            </div>
        ),
        badges: (
            <div className="flex items-center gap-2">
                <BadgeIcon label="Globe" className="bg-black text-white">
                    <Icons.Globe className="h-4 w-4" />
                </BadgeIcon>
                <BadgeIcon label="Code" className="bg-sky-500 text-white">
                    <Icons.Code className="h-4 w-4" />
                </BadgeIcon>
                <BadgeIcon label="Window" className="bg-cyan-500 text-white">
                    <Icons.LayoutWindow className="h-4 w-4" />
                </BadgeIcon>
            </div>
        ),
    },
    {
        title: 'Apps people open',
        description:
            'Native-feeling iOS and Android apps from one shared codebase. Tight UX, fast launches, and a single team that ships to every device your customers use.',
        visual: (
            <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-300 via-teal-300 to-blue-500">
                <div className="absolute top-1/2 left-1/2 h-[80%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-[2.5rem] border-4 border-black/70 bg-black/85 p-2 shadow-2xl">
                    <div className="h-full w-full rounded-[2rem] bg-gradient-to-b from-white/20 to-white/5 p-3">
                        <div className="mx-auto h-1 w-12 rounded-full bg-white/30" />
                        <div className="mt-4 space-y-2">
                            <div className="h-3 w-1/2 rounded-full bg-white/40" />
                            <div className="h-3 w-3/4 rounded-full bg-white/25" />
                        </div>
                        <div className="mt-6 grid grid-cols-2 gap-2">
                            <div className="aspect-square rounded-lg bg-white/20" />
                            <div className="aspect-square rounded-lg bg-white/30" />
                            <div className="aspect-square rounded-lg bg-white/30" />
                            <div className="aspect-square rounded-lg bg-white/20" />
                        </div>
                    </div>
                </div>
            </div>
        ),
        badges: (
            <div className="flex items-center gap-2">
                <BadgeIcon
                    label="Mobile"
                    className="bg-gradient-to-br from-zinc-200 to-zinc-400 text-black"
                >
                    <Icons.Mobile className="h-4 w-4" />
                </BadgeIcon>
                <BadgeIcon label="Laptop" className="bg-emerald-500 text-white">
                    <Icons.Laptop className="h-4 w-4" />
                </BadgeIcon>
            </div>
        ),
    },
    {
        title: 'Brand systems that scale',
        description:
            'A living design system instead of a static style guide. Tokens, components, and patterns your designers and developers share — the same on canvas and in code.',
        visual: (
            <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-fuchsia-400 via-purple-500 to-indigo-600">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
                <div className="absolute right-8 bottom-8 left-8 grid grid-cols-5 gap-2">
                    {[
                        'bg-zinc-900',
                        'bg-fuchsia-400',
                        'bg-amber-300',
                        'bg-emerald-400',
                        'bg-sky-400',
                    ].map((c) => (
                        <div
                            key={c}
                            className={`${c} aspect-square rounded-lg border border-white/30 shadow-md`}
                        />
                    ))}
                </div>
                <div className="absolute top-8 left-8 space-y-2">
                    <div className="h-3 w-24 rounded-full bg-white/40" />
                    <div className="h-2 w-16 rounded-full bg-white/25" />
                </div>
            </div>
        ),
        badges: (
            <div className="flex items-center gap-2">
                <BadgeIcon label="Figma" className="bg-zinc-900 text-white">
                    <Icons.Figma className="h-4 w-4" />
                </BadgeIcon>
                <BadgeIcon label="Brand" className="bg-foreground-primary text-background">
                    <Icons.Brand className="h-4 w-4" />
                </BadgeIcon>
                <BadgeIcon label="Layers" className="bg-purple-500 text-white">
                    <Icons.Layers className="h-4 w-4" />
                </BadgeIcon>
            </div>
        ),
    },
];

const AUTO_DELAY = 6000;

function BadgeIcon({
    children,
    label,
    className,
}: {
    children: React.ReactNode;
    label: string;
    className?: string;
}) {
    return (
        <div
            aria-label={label}
            className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${className ?? ''}`}
        >
            {children}
        </div>
    );
}

export function DigitalSolutionsSection() {
    const [index, setIndex] = useState(0);
    const lastInteractionRef = useRef<number>(Date.now());

    const handleIndexChange = useCallback((next: number) => {
        lastInteractionRef.current = Date.now();
        setIndex(next);
    }, []);

    useEffect(() => {
        const tick = setInterval(() => {
            if (Date.now() - lastInteractionRef.current >= AUTO_DELAY - 100) {
                setIndex((prev) => (prev + 1) % SLIDES.length);
                lastInteractionRef.current = Date.now();
            }
        }, AUTO_DELAY);
        return () => clearInterval(tick);
    }, []);

    return (
        <section className="mx-auto w-full max-w-6xl px-8 py-32">
            {/* Heading row */}
            <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
                <h2 className="text-foreground-primary text-4xl leading-[1.05] font-light tracking-tight lg:text-6xl">
                    Digital products
                    <br />
                    users love &
                    <br />
                    teams grow with
                </h2>
                <div className="flex flex-col items-start justify-end gap-6">
                    <p className="text-foreground-secondary text-regular max-w-md font-light">
                        Want to ship digital experiences people actually use? Whether it&apos;s a
                        site that converts, an app that earns daily opens, or AI features that pull
                        weight — we take you the full way from idea to measurable impact.
                    </p>
                    <Link
                        href={Routes.PROJECTS}
                        className="text-foreground-primary group border-foreground-primary/15 bg-foreground-primary/5 hover:bg-foreground-primary/10 inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                    >
                        Start building
                        <span className="bg-foreground-primary text-background inline-flex h-7 w-7 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5">
                            <ArrowRight className="h-4 w-4" />
                        </span>
                    </Link>
                </div>
            </div>

            {/* Navigator row */}
            <div className="mt-16 flex items-center justify-between">
                <CarouselNavigator
                    totalSlides={SLIDES.length}
                    currentIndex={index}
                    onIndexChange={handleIndexChange}
                    autoDelay={AUTO_DELAY}
                />
                <div className="text-foreground-tertiary text-mini font-mono tabular-nums">
                    {String(index + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
                </div>
            </div>

            {/* Carousel */}
            <div className="mt-8 overflow-hidden">
                <div
                    className="flex transition-transform duration-700 ease-out"
                    style={{ transform: `translateX(calc(-${index} * (100% + 1.5rem)))` }}
                >
                    {SLIDES.map((slide, i) => {
                        const isActive = i === index;
                        return (
                            <div
                                key={slide.title}
                                aria-hidden={!isActive}
                                className="w-full shrink-0 pr-6"
                            >
                                <SlideCard slide={slide} isActive={isActive} />
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

function SlideCard({ slide, isActive }: { slide: Slide; isActive: boolean }) {
    return (
        <motion.div
            animate={{ opacity: isActive ? 1 : 0.4, scale: isActive ? 1 : 0.98 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="border-foreground-primary/10 bg-background-weblab/60 grid h-[28rem] grid-cols-1 gap-6 overflow-hidden rounded-3xl border p-6 backdrop-blur-md md:grid-cols-[1fr_1.4fr]"
        >
            <div className="flex flex-col justify-between">
                <div>
                    <h3 className="text-foreground-primary text-3xl font-light tracking-tight">
                        {slide.title}
                    </h3>
                    <p className="text-foreground-secondary text-regular mt-3 max-w-sm font-light">
                        {slide.description}
                    </p>
                </div>
                {slide.badges}
            </div>
            <AnimatePresence mode="wait">
                <motion.div
                    key={slide.title}
                    initial={{ opacity: 0, scale: 1.02 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    className="h-full w-full"
                >
                    {slide.visual}
                </motion.div>
            </AnimatePresence>
        </motion.div>
    );
}
