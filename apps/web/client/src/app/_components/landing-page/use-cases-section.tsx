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
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-20">
                {/* Left: visual */}
                <div className="border-foreground-primary/10 bg-background-secondary/40 relative aspect-[5/4] w-full overflow-hidden rounded-2xl border backdrop-blur-sm md:aspect-auto md:min-h-[36rem]">
                    <AnimatePresence initial={false}>
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
                    <span className="text-style-tagline">{t('eyebrow')}</span>

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
                        {/* Fixed-height description block prevents layout shift on tab change */}
                        <div className="relative min-h-[7rem] max-w-md md:min-h-[6rem]">
                            <AnimatePresence initial={false}>
                                <motion.p
                                    key={active.key}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                                    className="text-foreground-secondary text-regular absolute inset-0 font-light tracking-tight"
                                >
                                    {t(`${active.i18nKey}.description`)}
                                </motion.p>
                            </AnimatePresence>
                        </div>

                        <Link
                            href={Routes.PROJECTS}
                            className="text-foreground-primary group border-foreground-primary/15 bg-foreground-primary/5 hover:bg-foreground-primary/10 mt-8 inline-flex items-center gap-3 rounded-full border py-1 pr-1 pl-4 text-sm font-medium transition-colors"
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

/* ----------------------------- 1. References ----------------------------- */

function ReferencesVisual() {
    return (
        <VisualFrame>
            <div className="absolute inset-x-8 top-8 bottom-8 flex items-center justify-center">
                <div className="bg-background border-foreground-primary/10 w-full overflow-hidden rounded-xl border shadow-2xl shadow-black/30">
                    {/* Header */}
                    <div className="border-foreground-primary/10 flex items-center justify-between border-b px-3.5 py-2.5">
                        <div className="text-foreground-secondary flex items-center gap-1.5 text-[11px]">
                            <Icons.Sparkles className="h-3 w-3" />
                            <span className="font-medium">Ask AI</span>
                        </div>
                        <span className="text-foreground-tertiary font-mono text-[10px]">
                            claude-sonnet
                        </span>
                    </div>

                    {/* References row: big thumbnail + stacked chips */}
                    <div className="flex items-start gap-3 px-3.5 pt-3.5">
                        {/* Thumbnail — mini hero mock inside */}
                        <div className="border-foreground-primary/15 bg-background-secondary relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border shadow-md shadow-black/40">
                            <div className="absolute inset-0 flex flex-col px-2 pt-2">
                                <div className="bg-foreground-primary/30 h-[3px] w-6 rounded-full" />
                                <div className="mt-auto flex flex-col gap-0.5 pb-2">
                                    <div className="bg-foreground-primary/85 h-[5px] w-14 rounded-full" />
                                    <div className="bg-foreground-primary/85 h-[5px] w-10 rounded-full" />
                                    <div className="bg-foreground-primary/30 mt-1 h-[3px] w-12 rounded-full" />
                                    <div className="mt-1.5 flex items-center gap-1">
                                        <div className="bg-foreground-brand h-[5px] w-5 rounded-full" />
                                        <div className="bg-foreground-primary/15 h-[5px] w-3 rounded-full" />
                                    </div>
                                </div>
                            </div>
                            <span className="text-style-tagline bg-background/80 absolute top-1 right-1 rounded-sm px-1 py-0.5 backdrop-blur">
                                PNG
                            </span>
                        </div>

                        {/* Chip stack */}
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
                            <RefChip
                                icon={<Icons.File className="h-3 w-3" />}
                                title="brand-guide.pdf"
                                meta="p. 4-6"
                            />
                            <RefChip
                                icon={<Icons.Figma className="h-3 w-3" />}
                                title="Figma · hero-frame"
                                meta="frame 12"
                            />
                            <RefChip
                                icon={<Icons.Link className="h-3 w-3" />}
                                title="acme.com/about"
                                meta="link"
                                muted
                            />
                        </div>
                    </div>

                    {/* Composer */}
                    <div className="px-3.5 pt-3.5 pb-3.5">
                        <div className="text-foreground-primary text-[12.5px] leading-[1.55] tracking-tight">
                            Match the hero to this image, and follow the spacing in the brand guide.
                        </div>
                    </div>

                    {/* AI breadcrumb */}
                    <div className="border-foreground-primary/10 bg-foreground-primary/[0.02] border-t px-3.5 py-2.5">
                        <div className="text-style-tagline flex items-center gap-1.5">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="bg-foreground-brand/60 absolute inset-0 animate-ping rounded-full" />
                                <span className="bg-foreground-brand relative h-1.5 w-1.5 rounded-full" />
                            </span>
                            <span>Reading 3 references…</span>
                        </div>
                    </div>
                </div>
            </div>
        </VisualFrame>
    );
}

function RefChip({
    icon,
    title,
    meta,
    muted,
}: {
    icon: React.ReactNode;
    title: string;
    meta: string;
    muted?: boolean;
}) {
    return (
        <div
            className={`border-foreground-primary/10 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${
                muted ? 'bg-foreground-primary/[0.01]' : 'bg-foreground-primary/[0.03]'
            }`}
        >
            <span className="flex min-w-0 items-center gap-1.5">
                <span className="text-foreground-secondary">{icon}</span>
                <span className="text-foreground-secondary truncate text-[10.5px]">{title}</span>
            </span>
            <span className="text-foreground-tertiary font-mono text-[9px] whitespace-nowrap">
                {meta}
            </span>
        </div>
    );
}

/* -------------------------------- 2. Pages -------------------------------- */

function PagesVisual() {
    return (
        <VisualFrame>
            <div className="absolute inset-x-8 top-8 bottom-8 flex items-center justify-center">
                <div className="bg-background border-foreground-primary/10 relative w-full overflow-hidden rounded-xl border shadow-2xl shadow-black/30">
                    {/* Header */}
                    <div className="border-foreground-primary/10 flex items-center justify-between border-b px-3.5 py-2.5">
                        <div className="text-foreground-secondary flex items-center gap-1.5 text-[11px]">
                            <Icons.Directory className="h-3 w-3" />
                            <span className="font-medium">Pages</span>
                        </div>
                        <span className="text-foreground-tertiary font-mono text-[10px]">
                            6 routes
                        </span>
                    </div>

                    {/* Page list */}
                    <div className="flex flex-col py-2">
                        <PageRow label="Home" path="/" />
                        <PageRow label="Pricing" path="/pricing" />
                        <PageRow label="Blog" path="/blog" selected />
                        <PageRow label="Post" path="/blog/[slug]" indent />
                        <PageRow label="Dashboard" path="/dashboard" />
                        <PageRow label="Settings" path="/dashboard/settings" indent />
                    </div>

                    {/* Footer */}
                    <div className="border-foreground-primary/10 flex items-center justify-between border-t px-3.5 py-2.5">
                        <span className="text-foreground-tertiary font-mono text-[10px]">
                            App Router · file-based
                        </span>
                        <span className="border-foreground-primary/15 bg-foreground-primary/5 text-foreground-secondary inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]">
                            <Icons.Plus className="h-2.5 w-2.5" />
                            New page
                        </span>
                    </div>
                </div>
            </div>
        </VisualFrame>
    );
}

function PageRow({
    label,
    path,
    selected,
    indent,
}: {
    label: string;
    path: string;
    selected?: boolean;
    indent?: boolean;
}) {
    return (
        <div
            className={`relative mx-1.5 flex items-center gap-2 rounded-md px-2 py-1.5 ${
                selected
                    ? 'bg-foreground-primary/[0.04] ring-1 ring-[color-mix(in_srgb,_var(--foreground-brand)_40%,_transparent)] ring-inset'
                    : ''
            }`}
        >
            {indent && (
                <span aria-hidden className="text-foreground-tertiary ml-1 font-mono text-[10px]">
                    └
                </span>
            )}
            <PageGlyph />
            <span
                className={`text-[11px] ${
                    selected ? 'text-foreground-primary font-medium' : 'text-foreground-secondary'
                }`}
            >
                {label}
            </span>
            <span className="text-foreground-tertiary ml-auto font-mono text-[10px]">{path}</span>
        </div>
    );
}

function PageGlyph() {
    return (
        <span className="border-foreground-primary/20 bg-foreground-primary/[0.05] inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-[3px] border">
            <span className="bg-foreground-primary/40 h-[1.5px] w-2 rounded-full" />
        </span>
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
                        <div className="text-style-tagline border-foreground-primary/10 flex items-center justify-between border-b px-3 py-1.5">
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
        <span className="text-style-tagline border-foreground-primary/15 bg-foreground-primary/5 rounded-md border px-1.5 py-0.5">
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
            <div className="text-style-tagline mb-1 flex items-center gap-1 px-2">
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
                        <span className="text-style-tagline">Connect repository</span>
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

function DetectionChip({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
    return (
        <span
            className={`text-style-tagline rounded-full border px-2 py-0.5 ${
                muted
                    ? 'border-foreground-primary/10 bg-foreground-primary/[0.02] text-foreground-tertiary'
                    : 'border-[color-mix(in_srgb,_var(--foreground-brand)_30%,_transparent)] bg-[color-mix(in_srgb,_var(--foreground-brand)_6%,_transparent)] text-[var(--foreground-brand)]'
            }`}
        >
            {children}
        </span>
    );
}
