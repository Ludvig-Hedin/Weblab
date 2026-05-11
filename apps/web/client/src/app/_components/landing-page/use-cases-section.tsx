'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUp, Plus, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';

interface UseCase {
    key: string;
    label: string;
    eyebrow: string;
    description: string;
    visual: React.ReactNode;
}

const AUTO_DELAY = 6000;

const USE_CASES: UseCase[] = [
    {
        key: 'landing-pages',
        label: 'Landing pages',
        eyebrow: 'Built for every kind of site',
        description:
            'Spin up a launch page in minutes. Edit copy, tweak layout, and ship to a real URL — no design handoff, no engineering ticket.',
        visual: <LandingPagesVisual />,
    },
    {
        key: 'marketing-sites',
        label: 'Marketing sites',
        eyebrow: 'Built for every kind of site',
        description:
            'Multi-page sites with shared components, CMS-backed content, and a brand system your team can extend without breaking anything.',
        visual: <MarketingVisual />,
    },
    {
        key: 'internal-tools',
        label: 'Internal tools',
        eyebrow: 'Built for every kind of site',
        description:
            'Dashboards, admin panels, and ops tools wired to your real data. Build the surface in Weblab, ship the same React code your team already runs.',
        visual: <InternalToolsVisual />,
    },
    {
        key: 'prototypes',
        label: 'Prototypes',
        eyebrow: 'Built for every kind of site',
        description:
            'Click-through prototypes that feel like the real product. Test flows with users on day one, then keep the same code through to launch.',
        visual: <PrototypesVisual />,
    },
    {
        key: 'production-apps',
        label: 'Production apps',
        eyebrow: 'Built for every kind of site',
        description:
            'Full-stack Next.js apps with auth, database, and AI baked in. Visual editing on a real codebase — pull requests at the end, not handoff docs.',
        visual: <ProductionAppsVisual />,
    },
];

export function UseCasesSection() {
    const [activeIdx, setActiveIdx] = useState(0);
    const lastInteractionRef = useRef<number>(Date.now());

    const handleSelect = (idx: number) => {
        setActiveIdx(idx);
        lastInteractionRef.current = Date.now();
    };

    useEffect(() => {
        const tick = setInterval(() => {
            if (Date.now() - lastInteractionRef.current >= AUTO_DELAY - 100) {
                setActiveIdx((prev) => (prev + 1) % USE_CASES.length);
                lastInteractionRef.current = Date.now();
            }
        }, AUTO_DELAY);
        return () => clearInterval(tick);
    }, []);

    const active = USE_CASES[activeIdx]!;

    return (
        <section className="mx-auto w-full max-w-6xl px-8 py-32">
            <div className="grid grid-cols-1 gap-16 md:grid-cols-2 md:gap-20">
                {/* Left: visual */}
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-zinc-900 via-black to-zinc-950 md:aspect-auto md:min-h-[36rem]">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={active.key}
                            initial={{ opacity: 0, scale: 1.02 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
                            className="absolute inset-0"
                        >
                            {active.visual}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Right: copy + tabs */}
                <div className="flex flex-col">
                    <span className="text-mini text-foreground-primary/80 font-mono tracking-wide uppercase">
                        {active.eyebrow}
                    </span>

                    <ul className="mt-6 flex flex-col">
                        {USE_CASES.map((u, idx) => {
                            const selected = idx === activeIdx;
                            return (
                                <li key={u.key}>
                                    <button
                                        onClick={() => handleSelect(idx)}
                                        className={`group flex w-full items-center gap-3 py-1.5 text-left text-3xl leading-tight font-light transition-colors duration-300 lg:text-4xl ${
                                            selected
                                                ? 'text-foreground-primary'
                                                : 'text-foreground-tertiary hover:text-foreground-secondary'
                                        }`}
                                    >
                                        <span
                                            className={`inline-flex items-center justify-center transition-all duration-300 ${
                                                selected
                                                    ? 'w-7 -translate-x-0 opacity-100'
                                                    : 'w-0 -translate-x-2 opacity-0'
                                            }`}
                                            aria-hidden
                                        >
                                            <ArrowRight className="h-5 w-5" />
                                        </span>
                                        {u.label}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="mt-auto pt-16">
                        <AnimatePresence mode="wait">
                            <motion.p
                                key={active.key}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                                className="text-foreground-secondary text-regular max-w-md font-light"
                            >
                                {active.description}
                            </motion.p>
                        </AnimatePresence>

                        <Link
                            href={Routes.PROJECTS}
                            className="text-foreground-primary group border-foreground-primary/15 bg-foreground-primary/5 hover:bg-foreground-primary/10 mt-8 inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                        >
                            Start building
                            <span className="bg-foreground-primary text-background inline-flex h-7 w-7 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5">
                                <ArrowRight className="h-4 w-4" />
                            </span>
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* --------------------------------- Visuals --------------------------------- */

function PromptBar({ text }: { text: string }) {
    return (
        <div className="absolute right-6 bottom-6 left-6 flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-2 shadow-2xl backdrop-blur-xl">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80">
                <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="flex-1 truncate text-sm text-white/85">{text}</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black">
                <ArrowUp className="h-4 w-4" />
            </div>
        </div>
    );
}

function LandingPagesVisual() {
    return (
        <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-orange-300/90 via-amber-200/80 to-rose-400/80">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,220,180,0.45),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_70%,rgba(255,120,140,0.35),transparent_55%)]" />
            <div className="absolute top-8 right-8 left-8 rounded-xl border border-white/30 bg-white/15 p-5 shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-black/40" />
                    <div className="h-2 w-12 rounded-full bg-black/30" />
                    <div className="ml-auto flex gap-2">
                        <div className="h-2 w-10 rounded-full bg-black/20" />
                        <div className="h-2 w-10 rounded-full bg-black/20" />
                        <div className="h-2 w-14 rounded-full bg-black/40" />
                    </div>
                </div>
                <div className="mt-6 space-y-2">
                    <div className="h-4 w-3/4 rounded-full bg-black/40" />
                    <div className="h-4 w-1/2 rounded-full bg-black/30" />
                </div>
                <div className="mt-4 h-2 w-2/3 rounded-full bg-black/20" />
                <div className="mt-5 flex gap-2">
                    <div className="h-7 w-24 rounded-full bg-black/80" />
                    <div className="h-7 w-20 rounded-full border border-black/30" />
                </div>
            </div>
            <PromptBar text="Make the hero feel friendlier" />
        </div>
    );
}

function MarketingVisual() {
    return (
        <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-zinc-200 via-zinc-100 to-zinc-300">
            <div className="absolute top-10 left-10 rounded-xl border border-black/10 bg-white p-4 shadow-2xl">
                <div className="flex items-center gap-1.5 border-b border-black/10 pb-2">
                    <span className="h-2 w-2 rounded-full bg-red-400/80" />
                    <span className="h-2 w-2 rounded-full bg-yellow-400/80" />
                    <span className="h-2 w-2 rounded-full bg-green-400/80" />
                </div>
                <div className="mt-3 w-56 space-y-2">
                    <div className="h-3 w-2/3 rounded-full bg-black/30" />
                    <div className="h-3 w-1/2 rounded-full bg-black/20" />
                    <div className="mt-4 grid grid-cols-3 gap-1.5">
                        <div className="h-10 rounded-md bg-black/10" />
                        <div className="h-10 rounded-md bg-black/15" />
                        <div className="h-10 rounded-md bg-black/10" />
                    </div>
                </div>
            </div>
            <div className="absolute right-8 bottom-24 rounded-xl border border-black/10 bg-white p-4 shadow-2xl">
                <div className="w-48 space-y-2">
                    <div className="flex items-center gap-2">
                        <Icons.Globe className="h-4 w-4 text-black/60" />
                        <div className="h-2.5 w-24 rounded-full bg-black/30" />
                    </div>
                    <div className="h-2 w-full rounded-full bg-black/15" />
                    <div className="h-2 w-4/5 rounded-full bg-black/15" />
                    <div className="h-2 w-3/5 rounded-full bg-black/15" />
                </div>
            </div>
            <PromptBar text="Add a pricing page with three tiers" />
        </div>
    );
}

function InternalToolsVisual() {
    return (
        <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-emerald-300 via-teal-300 to-cyan-500">
            <div className="absolute inset-6 rounded-xl border border-white/20 bg-black/40 p-4 shadow-2xl backdrop-blur-sm">
                <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                    <Icons.LayoutWindow className="h-4 w-4 text-white/70" />
                    <div className="h-2.5 w-24 rounded-full bg-white/40" />
                    <div className="ml-auto h-6 w-16 rounded-md bg-white/15" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-white/10 p-3">
                        <div className="h-2 w-12 rounded-full bg-white/30" />
                        <div className="mt-2 h-5 w-16 rounded-full bg-white/60" />
                    </div>
                    <div className="rounded-lg bg-white/10 p-3">
                        <div className="h-2 w-10 rounded-full bg-white/30" />
                        <div className="mt-2 h-5 w-14 rounded-full bg-white/60" />
                    </div>
                    <div className="rounded-lg bg-white/10 p-3">
                        <div className="h-2 w-14 rounded-full bg-white/30" />
                        <div className="mt-2 h-5 w-12 rounded-full bg-white/60" />
                    </div>
                </div>
                <div className="mt-4 space-y-1.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center gap-2 rounded-md bg-white/5 p-2">
                            <div className="h-2 w-2 rounded-full bg-emerald-400" />
                            <div className="h-2 w-24 rounded-full bg-white/30" />
                            <div className="ml-auto h-2 w-10 rounded-full bg-white/20" />
                        </div>
                    ))}
                </div>
            </div>
            <PromptBar text="Show only customers from this quarter" />
        </div>
    );
}

function PrototypesVisual() {
    return (
        <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-violet-400 via-fuchsia-400 to-indigo-600">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.3),transparent_55%)]" />
            <div className="absolute top-1/2 left-1/2 h-[70%] w-[44%] -translate-x-1/2 -translate-y-1/2 rounded-[2.5rem] border-4 border-black/70 bg-black/85 p-2 shadow-2xl">
                <div className="h-full w-full rounded-[2rem] bg-gradient-to-b from-white/20 to-white/5 p-3">
                    <div className="mx-auto h-1 w-12 rounded-full bg-white/30" />
                    <div className="mt-5 space-y-2">
                        <div className="h-3 w-1/2 rounded-full bg-white/40" />
                        <div className="h-3 w-3/4 rounded-full bg-white/25" />
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-2">
                        <div className="aspect-square rounded-lg bg-white/25" />
                        <div className="aspect-square rounded-lg bg-white/35" />
                        <div className="aspect-square rounded-lg bg-white/35" />
                        <div className="aspect-square rounded-lg bg-white/25" />
                    </div>
                    <div className="mt-4 flex justify-center gap-1.5">
                        <div className="h-1.5 w-6 rounded-full bg-white/80" />
                        <div className="h-1.5 w-1.5 rounded-full bg-white/40" />
                        <div className="h-1.5 w-1.5 rounded-full bg-white/40" />
                    </div>
                </div>
            </div>
            <div className="absolute top-12 right-10 flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 backdrop-blur-md">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-mini font-mono text-white/90">Live preview</span>
            </div>
            <PromptBar text="Wire the onboarding flow end-to-end" />
        </div>
    );
}

function ProductionAppsVisual() {
    return (
        <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-zinc-800 via-zinc-900 to-black">
            <div className="absolute inset-6 rounded-xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-sm">
                <div className="flex items-center gap-1.5 border-b border-white/10 pb-2">
                    <span className="h-2 w-2 rounded-full bg-red-400/80" />
                    <span className="h-2 w-2 rounded-full bg-yellow-400/80" />
                    <span className="h-2 w-2 rounded-full bg-green-400/80" />
                    <div className="text-mini ml-3 font-mono text-white/50">
                        app/dashboard/page.tsx
                    </div>
                </div>
                <pre className="mt-3 font-mono text-[11px] leading-5 text-white/70">
                    {`export default async function Page() {
  const user = await getUser();
  const sites = await db.sites
    .where({ ownerId: user.id });

  return <Dashboard sites={sites} />;
}`}
                </pre>
            </div>
            <div className="absolute right-4 bottom-24 flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 backdrop-blur-md">
                <Plus className="h-3.5 w-3.5 text-white/70" />
                <span className="text-mini font-mono text-white/85">PR #142 ready</span>
            </div>
            <PromptBar text="Add Stripe checkout to the pricing page" />
        </div>
    );
}
