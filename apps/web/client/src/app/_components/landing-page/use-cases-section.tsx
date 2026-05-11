'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';

interface UseCase {
    key: string;
    i18nKey: 'landingPages' | 'marketingSites' | 'internalTools' | 'prototypes' | 'productionApps';
    visual: React.ReactNode;
}

const AUTO_DELAY = 6000;

const USE_CASES: UseCase[] = [
    { key: 'landing-pages', i18nKey: 'landingPages', visual: <LandingPagesVisual /> },
    { key: 'marketing-sites', i18nKey: 'marketingSites', visual: <MarketingVisual /> },
    { key: 'internal-tools', i18nKey: 'internalTools', visual: <InternalToolsVisual /> },
    { key: 'prototypes', i18nKey: 'prototypes', visual: <PrototypesVisual /> },
    { key: 'production-apps', i18nKey: 'productionApps', visual: <ProductionAppsVisual /> },
];

export function UseCasesSection() {
    const t = useTranslations('landing.useCases');
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
        <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32">
            <div className="grid grid-cols-1 gap-16 md:grid-cols-2 md:gap-20">
                {/* Left: visual */}
                <div className="border-foreground-primary/10 bg-background-secondary/40 relative aspect-[4/5] w-full overflow-hidden rounded-2xl border backdrop-blur-sm md:aspect-auto md:min-h-[36rem]">
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
                        {t('eyebrow')}
                    </span>

                    <ul className="mt-5 flex flex-col">
                        {USE_CASES.map((u, idx) => {
                            const selected = idx === activeIdx;
                            return (
                                <li key={u.key}>
                                    <button
                                        onClick={() => handleSelect(idx)}
                                        className={`group flex w-full items-center gap-2 py-0 text-left text-2xl leading-[1.35] font-light transition-colors duration-300 lg:text-[28px] ${
                                            selected
                                                ? 'text-foreground-primary'
                                                : 'text-foreground-tertiary hover:text-foreground-secondary'
                                        }`}
                                    >
                                        <span
                                            className={`inline-flex items-center justify-center transition-all duration-300 ${
                                                selected
                                                    ? 'w-5 -translate-x-0 opacity-100'
                                                    : 'w-0 -translate-x-2 opacity-0'
                                            }`}
                                            aria-hidden
                                        >
                                            <Icons.ArrowRight className="h-4 w-4" />
                                        </span>
                                        {t(`${u.i18nKey}.label`)}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="mt-auto pt-10">
                        <AnimatePresence mode="wait">
                            <motion.p
                                key={active.key}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                                className="text-foreground-secondary text-regular max-w-md font-light tracking-tight"
                            >
                                {t(`${active.i18nKey}.description`)}
                            </motion.p>
                        </AnimatePresence>

                        <Link
                            href={Routes.PROJECTS}
                            className="text-foreground-primary group border-foreground-primary/15 bg-foreground-primary/5 hover:bg-foreground-primary/10 mt-8 inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                        >
                            {t('startBuilding')}
                            <span className="bg-foreground-primary text-background inline-flex h-7 w-7 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5">
                                <Icons.ArrowRight className="h-4 w-4" />
                            </span>
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* --------------------------------- Visuals --------------------------------- */
/**
 * Shared aesthetic:
 *  - Neutral dark surface w/ subtle grid + soft radial wash.
 *  - Single centered focal mockup w/ realistic content (real strings,
 *    real numbers, real chrome) — never just grey skeleton bars.
 *  - One whisper accent per tab.
 */

function VisualFrame({
    children,
    accent: _accent,
}: {
    children: React.ReactNode;
    /** @deprecated kept for API parity — accent glows removed for cleaner aesthetic */
    accent?: string;
}) {
    return (
        <div className="relative h-full w-full overflow-hidden">
            {/* Faint dot grid — single subtle texture, no glow */}
            <div
                className="absolute inset-0 opacity-[0.5]"
                style={{
                    backgroundImage:
                        'radial-gradient(circle, hsl(var(--foreground-primary) / 0.06) 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                }}
            />
            {children}
        </div>
    );
}

function BrowserChrome({ url, children }: { url: string; children: React.ReactNode }) {
    return (
        <div className="bg-background border-foreground-primary/8 w-full overflow-hidden rounded-lg border">
            <div className="border-foreground-primary/8 flex items-center justify-center border-b px-3 py-2">
                <div className="text-foreground-tertiary bg-foreground-primary/[0.04] flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px]">
                    <Icons.Globe className="h-2.5 w-2.5" />
                    {url}
                </div>
            </div>
            {children}
        </div>
    );
}

function LandingPagesVisual() {
    return (
        <VisualFrame accent="radial-gradient(circle at 75% 80%, hsl(var(--accent-orange) / 0.12), transparent 55%)">
            <div className="absolute inset-x-8 top-10 bottom-10 flex items-center justify-center">
                <BrowserChrome url="acme.com">
                    <div className="bg-background p-6">
                        {/* Nav */}
                        <div className="text-foreground-secondary flex items-center justify-between text-[11px]">
                            <span className="font-medium tracking-tight">Acme</span>
                            <div className="flex gap-4 opacity-80">
                                <span>Product</span>
                                <span>Pricing</span>
                                <span>Docs</span>
                            </div>
                            <span className="bg-foreground-primary text-background rounded-full px-2.5 py-1 text-[10px] font-medium">
                                Sign up
                            </span>
                        </div>
                        {/* Hero */}
                        <div className="relative mt-10">
                            <div className="text-foreground-primary text-2xl leading-[1.1] font-light tracking-tight">
                                Ship faster.
                                <br />
                                Care less about the&nbsp;stack.
                            </div>
                            <p className="text-foreground-tertiary mt-3 max-w-[18rem] text-[11px] leading-relaxed">
                                A workspace that turns your ideas into real, deployed sites — no
                                handoff.
                            </p>
                            <div className="mt-4 flex items-center gap-2">
                                <span className="bg-foreground-primary text-background rounded-full px-3 py-1 text-[11px] font-medium">
                                    Get started
                                </span>
                                <span className="text-foreground-secondary border-border rounded-full border px-3 py-1 text-[11px]">
                                    Watch demo →
                                </span>
                            </div>
                            {/* Selection handles on headline */}
                            <SelectionRing className="absolute -inset-x-2 -top-1 bottom-[6.5rem]" />
                        </div>
                    </div>
                </BrowserChrome>
            </div>
        </VisualFrame>
    );
}

function SelectionRing({ className }: { className?: string }) {
    return (
        <div
            className={`pointer-events-none absolute rounded-md ring-1 ring-[hsl(var(--foreground-brand))] ring-inset ${className ?? ''}`}
        >
            <span className="absolute -top-1.5 -left-1 h-2 w-2 rounded-sm bg-[hsl(var(--foreground-brand))]" />
            <span className="absolute -top-1.5 -right-1 h-2 w-2 rounded-sm bg-[hsl(var(--foreground-brand))]" />
            <span className="absolute -bottom-1 -left-1 h-2 w-2 rounded-sm bg-[hsl(var(--foreground-brand))]" />
            <span className="absolute -right-1 -bottom-1 h-2 w-2 rounded-sm bg-[hsl(var(--foreground-brand))]" />
            <span className="absolute -top-5 left-0 rounded-sm bg-[hsl(var(--foreground-brand))] px-1.5 py-0.5 font-mono text-[9px] text-white">
                h1.hero-title
            </span>
        </div>
    );
}

function MarketingVisual() {
    return (
        <VisualFrame accent="radial-gradient(circle at 20% 30%, hsl(var(--accent-sky) / 0.10), transparent 55%)">
            {/* Back window */}
            <div className="absolute top-16 left-14 w-[68%] origin-top-left -rotate-[2deg]">
                <BrowserChrome url="acme.com/pricing">
                    <div className="bg-background grid grid-cols-3 gap-2 p-4">
                        {['Starter', 'Team', 'Scale'].map((tier, i) => (
                            <div
                                key={tier}
                                className="border-border rounded-md border p-3"
                                style={{ opacity: i === 1 ? 1 : 0.85 }}
                            >
                                <div className="text-foreground-tertiary text-[10px]">{tier}</div>
                                <div className="text-foreground-primary mt-2 text-lg font-light">
                                    ${[0, 24, 96][i]}
                                </div>
                                <div className="mt-2 space-y-1">
                                    <div className="bg-foreground-tertiary/30 h-1 w-3/4 rounded-full" />
                                    <div className="bg-foreground-tertiary/30 h-1 w-2/3 rounded-full" />
                                    <div className="bg-foreground-tertiary/30 h-1 w-1/2 rounded-full" />
                                </div>
                            </div>
                        ))}
                    </div>
                </BrowserChrome>
            </div>
            {/* Front window */}
            <div className="absolute right-10 bottom-14 w-[72%] origin-bottom-right rotate-[2deg]">
                <BrowserChrome url="acme.com">
                    <div className="bg-background p-4">
                        <div className="text-foreground-secondary flex items-center justify-between text-[10px]">
                            <span className="font-medium">Acme</span>
                            <div className="flex gap-3 opacity-80">
                                <span>Pricing</span>
                                <span>Blog</span>
                                <span>About</span>
                            </div>
                        </div>
                        <div className="text-foreground-primary mt-4 text-lg leading-tight font-light">
                            One brand. Every&nbsp;page.
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-1.5">
                            <div className="bg-foreground-primary/5 aspect-[4/3] rounded" />
                            <div className="bg-foreground-primary/10 aspect-[4/3] rounded" />
                            <div className="bg-foreground-primary/5 aspect-[4/3] rounded" />
                        </div>
                    </div>
                </BrowserChrome>
            </div>
            {/* Page tabs floating */}
            <div className="border-border bg-background/70 absolute top-6 right-6 flex items-center gap-1.5 rounded-full border px-2 py-1 backdrop-blur">
                <span className="bg-foreground-primary h-1.5 w-1.5 rounded-full" />
                <span className="text-foreground-secondary font-mono text-[10px]">4 pages</span>
            </div>
        </VisualFrame>
    );
}

function InternalToolsVisual() {
    return (
        <VisualFrame accent="radial-gradient(circle at 80% 20%, rgba(74,222,128,0.10), transparent 55%)">
            <div className="absolute inset-x-8 top-10 bottom-10 flex items-center justify-center">
                <div className="bg-background border-border w-full overflow-hidden rounded-lg border shadow-2xl">
                    {/* Top bar */}
                    <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
                        <div className="flex items-center gap-2">
                            <div className="bg-foreground-primary/10 flex h-5 w-5 items-center justify-center rounded">
                                <Icons.LayoutWindow className="text-foreground-primary h-3 w-3" />
                            </div>
                            <span className="text-foreground-primary text-[11px] font-medium">
                                Customers
                            </span>
                        </div>
                        <div className="text-foreground-tertiary flex items-center gap-2 text-[10px]">
                            <span>Last 30 days</span>
                            <span className="bg-foreground-primary/8 rounded px-1.5 py-0.5">▾</span>
                        </div>
                    </div>
                    {/* Stats */}
                    <div className="border-border grid grid-cols-3 border-b">
                        <Stat label="MRR" value="$48.2k" delta="+12%" positive />
                        <Stat label="Active" value="1,284" delta="+38" positive />
                        <Stat label="Churn" value="1.4%" delta="-0.3" positive />
                    </div>
                    {/* Table */}
                    <div className="divide-border divide-y">
                        {[
                            ['Linear', '$1,920', 'Enterprise', 'now'],
                            ['Vercel', '$840', 'Team', '2m'],
                            ['Supabase', '$320', 'Pro', '14m'],
                            ['Cursor', '$96', 'Pro', '1h'],
                        ].map(([name, mrr, plan, ts]) => (
                            <div
                                key={name}
                                className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.6fr] items-center px-4 py-2 text-[11px]"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="bg-foreground-primary/10 h-4 w-4 rounded-full" />
                                    <span className="text-foreground-primary">{name}</span>
                                </div>
                                <span className="text-foreground-secondary tabular-nums">
                                    {mrr}
                                </span>
                                <span className="text-foreground-tertiary">{plan}</span>
                                <span className="text-foreground-tertiary text-right font-mono">
                                    {ts}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </VisualFrame>
    );
}

function Stat({
    label,
    value,
    delta,
    positive,
}: {
    label: string;
    value: string;
    delta: string;
    positive?: boolean;
}) {
    return (
        <div className="border-border border-r px-4 py-3 last:border-r-0">
            <div className="text-foreground-tertiary text-[10px]">{label}</div>
            <div className="text-foreground-primary mt-0.5 text-lg font-light tabular-nums">
                {value}
            </div>
            <div
                className={`mt-0.5 text-[10px] tabular-nums ${positive ? 'text-[hsl(var(--foreground-brand))]' : 'text-foreground-tertiary'}`}
            >
                {delta}
            </div>
        </div>
    );
}

function PrototypesVisual() {
    return (
        <VisualFrame accent="radial-gradient(circle at 30% 70%, rgba(168,85,247,0.10), transparent 55%)">
            {/* Phone A */}
            <div className="absolute top-1/2 left-[12%] h-[78%] w-[36%] -translate-y-1/2">
                <Phone>
                    <div className="space-y-3 px-3 pt-6">
                        <div className="text-foreground-primary text-[11px] font-medium">
                            Welcome back
                        </div>
                        <div className="text-foreground-tertiary text-[9px]">
                            Pick where to start
                        </div>
                        <div className="space-y-1.5 pt-2">
                            {['Browse', 'Continue · Onboarding', 'Settings'].map((row, i) => (
                                <div
                                    key={row}
                                    className={`border-foreground-primary/8 flex items-center justify-between rounded-md border p-2 text-[10px] ${
                                        i === 1
                                            ? 'bg-foreground-primary/[0.06] ring-1 ring-[hsl(var(--foreground-brand)/0.6)]'
                                            : ''
                                    }`}
                                >
                                    <span className="text-foreground-secondary">{row}</span>
                                    <span className="text-foreground-tertiary">›</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Phone>
            </div>
            {/* Phone B */}
            <div className="absolute top-1/2 right-[10%] h-[78%] w-[36%] -translate-y-1/2">
                <Phone>
                    <div className="space-y-2 px-3 pt-6">
                        <div className="text-foreground-primary text-[11px] font-medium">
                            Set up your team
                        </div>
                        <div className="bg-foreground-primary/5 border-border h-7 rounded border" />
                        <div className="bg-foreground-primary/5 border-border h-7 rounded border" />
                        <div className="bg-foreground-primary/5 border-border h-7 rounded border" />
                        <div className="bg-foreground-primary text-background mt-2 rounded py-1.5 text-center text-[10px] font-medium">
                            Continue
                        </div>
                    </div>
                </Phone>
            </div>
            {/* Flow arrow */}
            <svg
                className="absolute top-1/2 left-1/2 h-16 w-24 -translate-x-1/2 -translate-y-1/2"
                viewBox="0 0 100 60"
                fill="none"
            >
                <path
                    d="M5 30 C 35 5, 65 55, 95 30"
                    stroke="hsl(var(--foreground-brand) / 0.7)"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                />
                <path
                    d="M88 24 L97 30 L88 36"
                    stroke="hsl(var(--foreground-brand) / 0.9)"
                    strokeWidth="1.5"
                />
            </svg>
            {/* Hotspot label */}
            <div className="border-foreground-primary/8 bg-background/80 absolute top-6 left-6 flex items-center gap-1.5 rounded-full border px-2 py-1 backdrop-blur">
                <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inset-0 animate-ping rounded-full bg-[hsl(var(--foreground-brand))] opacity-70" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-[hsl(var(--foreground-brand))]" />
                </span>
                <span className="text-foreground-secondary font-mono text-[10px]">
                    tap → screen&nbsp;2
                </span>
            </div>
        </VisualFrame>
    );
}

function Phone({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-background border-foreground-primary/10 relative h-full w-full rounded-[1.8rem] border-2 p-1">
            <div className="bg-background h-full w-full overflow-hidden rounded-[1.5rem]">
                <div className="bg-foreground-primary/10 mx-auto mt-2 h-1 w-12 rounded-full" />
                {children}
            </div>
        </div>
    );
}

function ProductionAppsVisual() {
    return (
        <VisualFrame accent="radial-gradient(circle at 70% 70%, rgba(99,102,241,0.10), transparent 55%)">
            <div className="absolute inset-x-8 top-10 bottom-10 flex items-center justify-center">
                <div className="bg-background border-foreground-primary/8 w-full overflow-hidden rounded-lg border">
                    {/* Tabs */}
                    <div className="border-foreground-primary/8 bg-background-secondary/60 flex items-center gap-1 border-b px-2 pt-1.5">
                        <Tab active>app/page.tsx</Tab>
                        <Tab>checkout.ts</Tab>
                        <Tab>schema.sql</Tab>
                    </div>
                    {/* Code */}
                    <pre className="text-foreground-primary/80 font-mono text-[10.5px] leading-[1.55]">
                        <div className="grid grid-cols-[auto_1fr]">
                            <div className="text-foreground-tertiary border-border border-r px-2 py-3 text-right select-none">
                                {Array.from({ length: 10 }, (_, i) => (
                                    <div key={i}>{i + 1}</div>
                                ))}
                            </div>
                            <code className="px-3 py-3">
                                <Line>
                                    <K>import</K> {'{ stripe }'} <K>from</K>{' '}
                                    <S>&apos;@/lib/stripe&apos;</S>
                                </Line>
                                <Line>
                                    <K>import</K> {'{ auth }'} <K>from</K>{' '}
                                    <S>&apos;@/lib/auth&apos;</S>
                                </Line>
                                <Line>&nbsp;</Line>
                                <Line>
                                    <K>export async function</K>{' '}
                                    <span className="text-foreground-primary font-medium">
                                        POST
                                    </span>
                                    {'(req: Request) {'}
                                </Line>
                                <Line>
                                    {'  '}
                                    <K>const</K> user = <K>await</K> auth();
                                </Line>
                                <Line>
                                    {'  '}
                                    <K>const</K> session = <K>await</K> stripe.checkout
                                </Line>
                                <Line>
                                    {'    '}.sessions.create({'{'} customer: user.id {'}'});
                                </Line>
                                <Line>
                                    {'  '}
                                    <K>return</K> Response.json(session);
                                </Line>
                                <Line>{'}'}</Line>
                            </code>
                        </div>
                    </pre>
                </div>
            </div>
            {/* PR toast */}
            <div className="border-foreground-primary/8 bg-background absolute right-6 bottom-6 flex items-center gap-2 rounded-md border px-3 py-2">
                <div
                    className="flex h-5 w-5 items-center justify-center rounded-full"
                    style={{
                        backgroundColor: 'hsl(var(--foreground-brand) / 0.16)',
                        color: 'hsl(var(--foreground-brand))',
                    }}
                >
                    <Icons.Plus className="h-3 w-3" />
                </div>
                <div className="flex flex-col leading-tight">
                    <span className="text-foreground-primary text-[10.5px] font-medium">
                        PR #142 opened
                    </span>
                    <span className="text-foreground-tertiary text-[10px]">
                        feat: add stripe checkout
                    </span>
                </div>
            </div>
        </VisualFrame>
    );
}

function Tab({ children, active }: { children: React.ReactNode; active?: boolean }) {
    return (
        <div
            className={`rounded-t-md px-2.5 py-1 text-[10px] ${
                active
                    ? 'bg-background text-foreground-primary border-border border-x border-t'
                    : 'text-foreground-tertiary'
            }`}
        >
            {children}
        </div>
    );
}

function K({ children }: { children: React.ReactNode }) {
    return (
        <span className="text-foreground-primary font-medium" style={{ opacity: 0.85 }}>
            {children}
        </span>
    );
}
function S({ children }: { children: React.ReactNode }) {
    return <span className="text-foreground-tertiary">{children}</span>;
}
function Line({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
}
