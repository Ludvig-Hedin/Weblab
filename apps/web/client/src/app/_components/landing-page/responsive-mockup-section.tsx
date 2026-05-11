'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import { Reveal } from '@/components/motion/reveal';
import { ClaudeIcon } from './provider-icons';

const PROMPTS = [
    'Make the hero darker',
    'Add a contact form section',
    'Tighten the spacing on cards',
    'Use a softer accent color',
];

const TYPE_INTERVAL_MS = 50;
const HOLD_MS = 1600;
const ERASE_INTERVAL_MS = 25;

function useTypewriter(lines: string[]) {
    const [lineIndex, setLineIndex] = useState(0);
    const [text, setText] = useState('');
    const [phase, setPhase] = useState<'typing' | 'holding' | 'erasing'>('typing');

    useEffect(() => {
        const current = lines[lineIndex] ?? '';
        if (phase === 'typing') {
            if (text.length < current.length) {
                const id = setTimeout(
                    () => setText(current.slice(0, text.length + 1)),
                    TYPE_INTERVAL_MS,
                );
                return () => clearTimeout(id);
            }
            const id = setTimeout(() => setPhase('holding'), 0);
            return () => clearTimeout(id);
        }
        if (phase === 'holding') {
            const id = setTimeout(() => setPhase('erasing'), HOLD_MS);
            return () => clearTimeout(id);
        }
        // erasing
        if (text.length > 0) {
            const id = setTimeout(() => setText(text.slice(0, -1)), ERASE_INTERVAL_MS);
            return () => clearTimeout(id);
        }
        const id = setTimeout(() => {
            setLineIndex((i) => (i + 1) % lines.length);
            setPhase('typing');
        }, 200);
        return () => clearTimeout(id);
    }, [text, phase, lineIndex, lines]);

    return text;
}

function PromptOnCanvasAsset() {
    const promptText = useTypewriter(PROMPTS);
    return (
        <div className="border-foreground-primary/10 bg-background-secondary/40 mx-auto w-full max-w-sm overflow-hidden rounded-2xl border backdrop-blur-sm">
            {/* Canvas region */}
            <div className="bg-background-secondary/30 relative aspect-[16/10] w-full overflow-hidden">
                {/* Faint dot grid */}
                <div
                    className="absolute inset-0 opacity-50"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle, hsl(var(--foreground-primary) / 0.08) 1px, transparent 1px)',
                        backgroundSize: '14px 14px',
                    }}
                    aria-hidden
                />
                {/* Small artboard */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="border-foreground-primary/10 bg-background w-[68%] rounded-md border p-3 shadow-sm shadow-black/[0.03]">
                        <div className="bg-foreground-primary/80 mb-2 h-1.5 w-12 rounded-full" />
                        <div className="bg-foreground-primary/15 mb-1 h-1 w-full rounded-full" />
                        <div className="bg-foreground-primary/15 mb-3 h-1 w-3/4 rounded-full" />
                        <div className="bg-foreground-primary inline-block h-3 w-10 rounded-sm" />
                    </div>
                </div>
            </div>
            {/* Divider */}
            <div className="border-foreground-primary/10 border-t" aria-hidden />
            {/* Prompt input region */}
            <div className="p-2.5">
                <div className="bg-background border-foreground-primary/10 rounded-xl border px-3 py-2.5">
                    {/* Typed prompt line */}
                    <div className="text-small text-foreground-primary min-h-[20px] leading-tight font-light tracking-tight">
                        {promptText}
                        <span
                            className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse bg-[hsl(var(--foreground-brand))]"
                            aria-hidden
                        />
                    </div>
                    {/* Footer row */}
                    <div className="mt-3 flex items-center justify-between">
                        {/* Model chip */}
                        <div className="border-foreground-primary/10 inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1">
                            <ClaudeIcon className="text-foreground-secondary h-3 w-3" />
                            <span className="text-mini text-foreground-secondary font-light tracking-tight">
                                Claude Opus 4.7
                            </span>
                        </div>
                        {/* Send button */}
                        <button
                            type="button"
                            tabIndex={-1}
                            aria-hidden
                            className="bg-foreground-primary text-background pointer-events-none flex h-6 w-6 items-center justify-center rounded-md"
                        >
                            <Icons.ArrowRight className="h-3 w-3" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Cycle through small variants of the same button (label + tint changes)
// to suggest "edit visually, code stays in sync."
const BUTTON_VARIANTS = [
    { label: 'Get started', radius: 'rounded-xl', radiusToken: 'xl' },
    { label: 'Continue', radius: 'rounded-lg', radiusToken: 'lg' },
    { label: 'Start trial', radius: 'rounded-full', radiusToken: 'full' },
] as const;

function DesignToCodeAsset() {
    const [variantIdx, setVariantIdx] = useState(0);
    const [paused, setPaused] = useState(false);
    useEffect(() => {
        if (paused) return;
        const id = setInterval(() => {
            setVariantIdx((i) => (i + 1) % BUTTON_VARIANTS.length);
        }, 3500);
        return () => clearInterval(id);
    }, [paused]);

    const v = BUTTON_VARIANTS[variantIdx]!;

    return (
        <div
            className="border-foreground-primary/10 bg-background-secondary/40 mx-auto w-full max-w-sm overflow-hidden rounded-2xl border backdrop-blur-sm"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            {/* Design region — rendered button with selection */}
            <div className="bg-background-secondary/30 relative flex aspect-[16/9] w-full items-center justify-center">
                <div
                    className="absolute inset-0 opacity-50"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle, hsl(var(--foreground-primary) / 0.08) 1px, transparent 1px)',
                        backgroundSize: '14px 14px',
                    }}
                    aria-hidden
                />
                <div className="relative">
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden
                        className={`bg-foreground-primary text-background text-small pointer-events-none px-4 py-2 font-light tracking-tight transition-[border-radius] duration-300 ${v.radius}`}
                    >
                        {v.label}
                    </button>
                    {/* Selection ring */}
                    <span
                        className={`pointer-events-none absolute -inset-1 transition-[border-radius] duration-300 ${v.radius}`}
                        style={{
                            boxShadow: `inset 0 0 0 1.5px hsl(var(--foreground-brand))`,
                        }}
                        aria-hidden
                    />
                    <span
                        className="absolute -bottom-1 -left-1 h-1.5 w-1.5 rounded-sm"
                        style={{ backgroundColor: 'hsl(var(--foreground-brand))' }}
                        aria-hidden
                    />
                    <span
                        className="absolute -right-1 -bottom-1 h-1.5 w-1.5 rounded-sm"
                        style={{ backgroundColor: 'hsl(var(--foreground-brand))' }}
                        aria-hidden
                    />
                    <span
                        className="absolute -top-1 -left-1 h-1.5 w-1.5 rounded-sm"
                        style={{ backgroundColor: 'hsl(var(--foreground-brand))' }}
                        aria-hidden
                    />
                    <span
                        className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-sm"
                        style={{ backgroundColor: 'hsl(var(--foreground-brand))' }}
                        aria-hidden
                    />
                </div>
            </div>
            {/* Divider */}
            <div className="border-foreground-primary/10 border-t" aria-hidden />
            {/* Code region */}
            <div className="bg-background-secondary/30 p-3">
                <div className="text-foreground-quadranary mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
                    <span
                        className="h-1 w-1 rounded-full"
                        style={{ backgroundColor: 'hsl(var(--foreground-brand))' }}
                        aria-hidden
                    />
                    Button.tsx
                </div>
                <pre className="text-foreground-secondary text-mini font-mono leading-relaxed">
                    {'<button className="'}
                    <span style={{ color: 'hsl(var(--foreground-brand))' }}>{v.radius}</span>
                    {' bg-fg px-4 py-2">'}
                    {'\n  '}
                    <span className="text-foreground-primary">{v.label}</span>
                    {'\n'}
                    {'</button>'}
                </pre>
            </div>
        </div>
    );
}

export function ResponsiveMockupSection() {
    const t = useTranslations('landing.responsiveMockup');
    return (
        <>
            {/* Desktop/Tablet anchor target only — the hero already renders the
                full editor mockup, so we avoid showing it a second time here.
                Keep the id so existing #features deep links still scroll
                cleanly to this region. */}
            <div className="hidden h-0 w-full md:block" id="features" aria-hidden />

            {/* Mobile: panel 1 — canvas + AI prompt input */}
            <div className="md:hidden">
                <div
                    className="relative flex w-full flex-col items-center gap-8 px-6 py-16"
                    id="features-mobile-1"
                >
                    <PromptOnCanvasAsset />

                    <Reveal className="w-full text-left">
                        <h2 className="heading-style-h4 text-foreground-primary mb-3 text-balance">
                            {t('panel1.title')}
                        </h2>
                        <p className="text-foreground-secondary text-base leading-relaxed font-light tracking-tight text-balance">
                            {t('panel1.body')}
                        </p>
                    </Reveal>
                </div>

                {/* Mobile: panel 2 — design ↔ code */}
                <div
                    className="relative flex w-full flex-col items-center gap-8 px-6 py-16"
                    id="features-mobile-2"
                >
                    <DesignToCodeAsset />

                    <Reveal className="w-full text-left">
                        <h2 className="heading-style-h4 text-foreground-primary mb-3 text-balance">
                            {t('panel2.title')}
                        </h2>
                        <p className="text-foreground-secondary text-base leading-relaxed font-light tracking-tight text-balance">
                            {t('panel2.body')}
                        </p>
                    </Reveal>
                </div>
            </div>
        </>
    );
}
