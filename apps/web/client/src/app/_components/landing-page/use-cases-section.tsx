'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';

interface UseCase {
    key: string;
    i18nKey: 'references' | 'pages' | 'code' | 'search' | 'connect';
    visual: React.ReactNode;
}

const AUTO_DELAY = 6000;

const USE_CASES: UseCase[] = [
    { key: 'references', i18nKey: 'references', visual: <ReferencesVisual /> },
    { key: 'pages', i18nKey: 'pages', visual: <PagesVisual /> },
    { key: 'code', i18nKey: 'code', visual: <CodeVisual /> },
    { key: 'search', i18nKey: 'search', visual: <SearchVisual /> },
    { key: 'connect', i18nKey: 'connect', visual: <ConnectVisual /> },
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
 *  - Neutral dark surface w/ subtle dot grid.
 *  - Single centered focal mockup w/ realistic content (real strings,
 *    real numbers, real chrome) — never just grey skeleton bars.
 *  - One whisper accent per tab.
 */

function VisualFrame({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative h-full w-full overflow-hidden">
            <div
                className="absolute inset-0 opacity-[0.5]"
                style={{
                    backgroundImage:
                        'radial-gradient(circle, color-mix(in srgb, var(--foreground-primary) 6%, transparent) 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                }}
            />
            {children}
        </div>
    );
}

function BrowserChrome({ url, children }: { url: string; children: React.ReactNode }) {
    return (
        <div className="bg-background border-foreground-primary/10 w-full overflow-hidden rounded-lg border">
            <div className="border-foreground-primary/10 flex items-center justify-center border-b px-3 py-2">
                <div className="text-foreground-tertiary bg-foreground-primary/[0.04] flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px]">
                    <Icons.Globe className="h-2.5 w-2.5" />
                    {url}
                </div>
            </div>
            {children}
        </div>
    );
}

function SelectionRing({ label, className }: { label?: string; className?: string }) {
    return (
        <div
            className={`pointer-events-none absolute rounded-md ring-1 ring-[var(--foreground-brand)] ring-inset ${className ?? ''}`}
        >
            <span className="absolute -top-1.5 -left-1 h-2 w-2 rounded-sm bg-[var(--foreground-brand)]" />
            <span className="absolute -top-1.5 -right-1 h-2 w-2 rounded-sm bg-[var(--foreground-brand)]" />
            <span className="absolute -bottom-1 -left-1 h-2 w-2 rounded-sm bg-[var(--foreground-brand)]" />
            <span className="absolute -right-1 -bottom-1 h-2 w-2 rounded-sm bg-[var(--foreground-brand)]" />
            {label && (
                <span className="absolute -top-5 left-0 rounded-sm bg-[var(--foreground-brand)] px-1.5 py-0.5 font-mono text-[9px] text-white">
                    {label}
                </span>
            )}
        </div>
    );
}

/* ----------------------------- 1. References ----------------------------- */

function ReferencesVisual() {
    return (
        <VisualFrame>
            <div className="absolute inset-x-8 top-10 bottom-10 flex items-center justify-center">
                <div className="bg-background border-foreground-primary/10 w-full overflow-hidden rounded-xl border">
                    {/* Header */}
                    <div className="border-foreground-primary/10 flex items-center justify-between border-b px-3 py-2">
                        <div className="text-foreground-secondary flex items-center gap-1.5 text-[11px]">
                            <Icons.Sparkles className="h-3 w-3" />
                            <span className="font-medium">Ask AI</span>
                        </div>
                        <span className="text-foreground-tertiary font-mono text-[10px]">
                            claude-sonnet
                        </span>
                    </div>

                    {/* Reference strip */}
                    <div className="px-3 pt-3">
                        <div className="flex items-center gap-2">
                            {/* Dominant image thumbnail w/ mini hero mock inside */}
                            <div className="border-foreground-primary/15 bg-foreground-primary/[0.04] relative h-16 w-24 shrink-0 overflow-hidden rounded-md border">
                                <div className="absolute inset-1.5 flex flex-col justify-center gap-1">
                                    <div className="bg-foreground-primary/30 h-1 w-12 rounded-full" />
                                    <div className="bg-foreground-primary/50 h-1.5 w-16 rounded-full" />
                                    <div className="bg-foreground-primary/15 h-1 w-10 rounded-full" />
                                    <div className="bg-foreground-brand mt-0.5 h-1.5 w-5 rounded-full" />
                                </div>
                                <span className="bg-background/70 text-foreground-tertiary absolute right-1 bottom-1 rounded-sm px-1 py-0.5 font-mono text-[8px] backdrop-blur">
                                    PNG
                                </span>
                            </div>

                            {/* Doc chip */}
                            <div className="border-foreground-primary/10 bg-foreground-primary/[0.03] flex items-center gap-1.5 rounded-md border px-2 py-1.5">
                                <Icons.File className="text-foreground-secondary h-3 w-3" />
                                <span className="text-foreground-secondary text-[10px]">
                                    brand-guide.pdf
                                </span>
                            </div>
                            {/* Link chip */}
                            <div className="border-foreground-primary/10 bg-foreground-primary/[0.03] flex items-center gap-1.5 rounded-md border px-2 py-1.5">
                                <Icons.Figma className="text-foreground-secondary h-3 w-3" />
                                <span className="text-foreground-secondary text-[10px]">
                                    Figma frame
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Composer */}
                    <div className="px-3 pt-3 pb-3">
                        <div className="text-foreground-primary text-[12px] leading-relaxed">
                            Match the hero to this image, and follow the spacing in the brand
                            guide.
                        </div>
                    </div>

                    {/* AI breadcrumb */}
                    <div className="border-foreground-primary/10 bg-foreground-primary/[0.02] border-t px-3 py-2">
                        <div className="text-foreground-tertiary flex items-center gap-1.5 font-mono text-[10px]">
                            <span className="bg-foreground-brand relative flex h-1.5 w-1.5">
                                <span className="bg-foreground-brand/60 absolute inset-0 animate-ping rounded-full" />
                                <span className="bg-foreground-brand relative h-1.5 w-1.5 rounded-full" />
                            </span>
                            <span>
                                Reading 3 references… hero-ref.png · brand-guide.pdf p.4–6 · Figma
                                frame
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </VisualFrame>
    );
}

/* -------------------------------- 2. Pages -------------------------------- */

function PagesVisual() {
    return (
        <VisualFrame>
            <div className="absolute inset-x-6 top-8 bottom-8 flex items-center justify-center">
                <div className="bg-background border-foreground-primary/10 relative w-full overflow-hidden rounded-xl border px-5 py-5">
                    {/* Eyebrow */}
                    <div className="text-foreground-tertiary mb-4 flex items-center justify-between">
                        <span className="font-mono text-[10px] tracking-wide uppercase">
                            Sitemap
                        </span>
                        <span className="font-mono text-[10px]">6 pages</span>
                    </div>

                    {/* Sitemap */}
                    <div className="flex flex-col items-center gap-3">
                        <SitemapNode label="Home" />
                        <Connector />
                        <div className="grid w-full grid-cols-3 gap-3">
                            <div className="flex flex-col items-center gap-2">
                                <SitemapNode label="Pricing" />
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <div className="relative">
                                    <SitemapNode label="Blog" selected />
                                    <span className="border-foreground-primary/10 bg-background absolute top-1/2 left-[calc(100%+0.5rem)] -translate-y-1/2 rounded-full border px-1.5 py-0.5 font-mono text-[9px] whitespace-nowrap text-[var(--foreground-brand)]">
                                        /blog/the-launch
                                    </span>
                                </div>
                                <Connector short />
                                <SitemapNode label="Post" small />
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <SitemapNode label="Dashboard" />
                                <Connector short />
                                <SitemapNode label="Settings" small />
                            </div>
                        </div>
                    </div>

                    {/* New page button */}
                    <div className="border-foreground-primary/10 bg-foreground-primary/5 text-foreground-secondary absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px]">
                        <Icons.Plus className="h-2.5 w-2.5" />
                        <span>New page</span>
                    </div>
                </div>
            </div>
        </VisualFrame>
    );
}

function SitemapNode({
    label,
    selected,
    small,
}: {
    label: string;
    selected?: boolean;
    small?: boolean;
}) {
    return (
        <div
            className={`relative flex flex-col gap-1 rounded-md border px-2 py-1.5 ${
                small ? 'w-16' : 'w-20'
            } ${
                selected
                    ? 'border-[var(--foreground-brand)] bg-[color-mix(in_srgb,_var(--foreground-brand)_4%,_transparent)]'
                    : 'border-foreground-primary/15 bg-foreground-primary/[0.03]'
            }`}
        >
            <div className="bg-foreground-primary/40 h-0.5 w-3/5 rounded-full" />
            <div className="bg-foreground-primary/15 h-0.5 w-4/5 rounded-full" />
            <div className="bg-foreground-primary/15 h-0.5 w-2/3 rounded-full" />
            <div
                className={`mt-0.5 text-center ${small ? 'text-[8.5px]' : 'text-[9.5px]'} ${
                    selected ? 'text-foreground-primary' : 'text-foreground-secondary'
                } font-medium`}
            >
                {label}
            </div>
        </div>
    );
}

function Connector({ short }: { short?: boolean }) {
    return (
        <span
            className={`bg-foreground-primary/15 inline-block w-px ${short ? 'h-3' : 'h-4'}`}
            aria-hidden
        />
    );
}

/* --------------------------------- 3. Code -------------------------------- */

function CodeVisual() {
    return (
        <VisualFrame>
            <div className="absolute inset-x-6 top-10 bottom-10 flex items-center justify-center">
                <div className="bg-background border-foreground-primary/10 grid w-full grid-cols-[1fr_1.2fr] overflow-hidden rounded-xl border">
                    {/* Code pane */}
                    <div className="border-foreground-primary/10 border-r">
                        <div className="border-foreground-primary/10 bg-background-secondary/60 flex items-center gap-1 border-b px-2 pt-1.5">
                            <div className="bg-background text-foreground-primary border-foreground-primary/10 rounded-t-md border-x border-t px-2.5 py-1 text-[10px]">
                                Hero.tsx
                            </div>
                        </div>
                        <pre className="text-foreground-primary/80 font-mono text-[9.5px] leading-[1.55]">
                            <div className="grid grid-cols-[auto_1fr]">
                                <div className="text-foreground-tertiary border-foreground-primary/10 border-r px-2 py-2.5 text-right select-none">
                                    {Array.from({ length: 9 }, (_, i) => (
                                        <div key={i}>{i + 1}</div>
                                    ))}
                                </div>
                                <code className="px-2.5 py-2.5">
                                    <Line>
                                        <K>export function</K>{' '}
                                        <span className="text-foreground-primary font-medium">
                                            Hero
                                        </span>
                                        () {'{'}
                                    </Line>
                                    <Line>
                                        {'  '}
                                        <K>return</K> (
                                    </Line>
                                    <Line>
                                        {'    '}
                                        <S>&lt;section&gt;</S>
                                    </Line>
                                    <Line>
                                        {'      '}
                                        <S>&lt;h1&gt;</S>Ship faster.<S>&lt;/h1&gt;</S>
                                    </Line>
                                    <Line>
                                        {'      '}
                                        <S>&lt;p&gt;</S>Care less about the&nbsp;stack.
                                        <S>&lt;/p&gt;</S>
                                    </Line>
                                    <Line>
                                        {'      '}
                                        <S>&lt;Button&gt;</S>Get started<S>&lt;/Button&gt;</S>
                                    </Line>
                                    <Line>
                                        {'    '}
                                        <S>&lt;/section&gt;</S>
                                    </Line>
                                    <Line>{'  '})</Line>
                                    <Line>{'}'}</Line>
                                </code>
                            </div>
                        </pre>
                    </div>

                    {/* Preview pane */}
                    <div className="bg-background relative flex flex-col">
                        <div className="border-foreground-primary/10 text-foreground-tertiary flex items-center justify-between border-b px-3 py-1.5 font-mono text-[10px]">
                            <span>Preview</span>
                            <span className="flex items-center gap-1.5">
                                <span className="bg-foreground-brand h-1.5 w-1.5 rounded-full" />
                                in sync
                            </span>
                        </div>
                        <div className="flex flex-1 flex-col justify-center px-5 py-6">
                            <div className="text-foreground-primary text-xl leading-[1.1] font-light tracking-tight">
                                Ship faster.
                            </div>
                            <p className="text-foreground-tertiary mt-2 text-[11px] leading-relaxed">
                                Care less about the&nbsp;stack.
                            </p>
                            <div className="mt-4">
                                <span className="bg-foreground-primary text-background inline-block rounded-full px-3 py-1 text-[11px] font-medium">
                                    Get started
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </VisualFrame>
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

/* -------------------------------- 4. Search ------------------------------- */

function SearchVisual() {
    return (
        <VisualFrame>
            <div className="absolute inset-x-8 top-12 bottom-12 flex items-center justify-center">
                <div className="bg-background border-foreground-primary/10 w-full overflow-hidden rounded-xl border">
                    {/* Search input */}
                    <div className="border-foreground-primary/10 flex items-center gap-2 border-b px-3 py-2.5">
                        <Icons.MagnifyingGlass className="text-foreground-tertiary h-3.5 w-3.5" />
                        <div className="text-foreground-primary flex-1 text-[12px]">
                            Button
                            <span className="text-foreground-primary ml-px inline-block h-3 w-px animate-pulse bg-current align-middle" />
                        </div>
                        <KeyCap>⌘K</KeyCap>
                    </div>

                    {/* Groups */}
                    <div className="px-2 py-2">
                        <ResultGroup icon={<Icons.File className="h-2.5 w-2.5" />} label="Files">
                            <ResultRow title="Button.tsx" snippet="components/ui/" />
                            <ResultRow title="button-styles.css" snippet="styles/" />
                        </ResultGroup>
                        <ResultGroup
                            icon={<Icons.Component className="h-2.5 w-2.5" />}
                            label="Components"
                        >
                            <ResultRow title="<Button />" snippet="6 usages" />
                            <ResultRow title="<IconButton />" snippet="3 usages" />
                        </ResultGroup>
                        <ResultGroup
                            icon={<Icons.ChatBubble className="h-2.5 w-2.5" />}
                            label="Strings"
                        >
                            <ResultRow
                                title="“Click to continue”"
                                snippet="onboarding/step-2.tsx"
                            />
                            <ResultRow title="“Submit form”" snippet="checkout/form.tsx" />
                        </ResultGroup>
                    </div>
                </div>
            </div>
        </VisualFrame>
    );
}

function KeyCap({ children }: { children: React.ReactNode }) {
    return (
        <span className="border-foreground-primary/15 bg-foreground-primary/5 text-foreground-tertiary rounded-md border px-1.5 py-0.5 font-mono text-[9px]">
            {children}
        </span>
    );
}

function ResultGroup({
    icon,
    label,
    children,
}: {
    icon: React.ReactNode;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="px-1 py-1.5">
            <div className="text-foreground-tertiary mb-1 flex items-center gap-1 px-2 font-mono text-[9px] tracking-wide uppercase">
                <span className="opacity-70">{icon}</span>
                <span>{label}</span>
            </div>
            <div>{children}</div>
        </div>
    );
}

function ResultRow({ title, snippet }: { title: string; snippet: string }) {
    return (
        <div className="hover:bg-foreground-primary/[0.04] flex items-center justify-between rounded-md px-2 py-1.5">
            <span className="text-foreground-primary text-[11px]">{title}</span>
            <span className="text-foreground-tertiary font-mono text-[10px]">{snippet}</span>
        </div>
    );
}

/* ------------------------------- 5. Connect ------------------------------- */

function ConnectVisual() {
    return (
        <VisualFrame>
            <div className="absolute inset-x-8 top-12 bottom-12 flex items-center justify-center">
                <div className="bg-background border-foreground-primary/10 relative w-full overflow-hidden rounded-xl border">
                    {/* Whisper brand line on left edge */}
                    <span className="absolute top-4 bottom-4 left-0 w-[2px] rounded-r bg-[var(--foreground-brand)]" />

                    <div className="px-5 pt-5 pb-5">
                        <span className="text-foreground-tertiary font-mono text-[10px] tracking-wide uppercase">
                            Connect repository
                        </span>
                        <div className="text-foreground-primary mt-2 text-[14px] font-light tracking-tight">
                            Open the project you already have.
                        </div>

                        {/* Repo input */}
                        <div className="border-foreground-primary/15 bg-foreground-primary/[0.03] mt-4 flex items-center gap-2 rounded-md border px-3 py-2">
                            <Icons.GitHubLogo className="text-foreground-secondary h-3.5 w-3.5" />
                            <span className="text-foreground-primary font-mono text-[11px]">
                                github.com/acme/marketing
                            </span>
                            <span className="text-foreground-primary ml-px inline-block h-3 w-px animate-pulse bg-current align-middle" />
                        </div>

                        {/* Detection chips */}
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            <DetectionChip>Next.js 15</DetectionChip>
                            <DetectionChip>Tailwind</DetectionChip>
                            <DetectionChip>App Router</DetectionChip>
                            <DetectionChip muted>42 files</DetectionChip>
                        </div>

                        {/* Connect row */}
                        <div className="border-foreground-primary/10 mt-5 flex items-center justify-between border-t pt-4">
                            <span className="text-foreground-tertiary text-[10px]">
                                We&apos;ll detect your framework and pick up where you left off.
                            </span>
                            <span className="bg-foreground-primary text-background inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium">
                                Connect
                                <Icons.ArrowRight className="h-3 w-3" />
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </VisualFrame>
    );
}

function DetectionChip({
    children,
    muted,
}: {
    children: React.ReactNode;
    muted?: boolean;
}) {
    return (
        <span
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                muted
                    ? 'border-foreground-primary/10 bg-foreground-primary/[0.02] text-foreground-tertiary'
                    : 'border-[color-mix(in_srgb,_var(--foreground-brand)_30%,_transparent)] bg-[color-mix(in_srgb,_var(--foreground-brand)_6%,_transparent)] text-[var(--foreground-brand)]'
            }`}
        >
            {children}
        </span>
    );
}
