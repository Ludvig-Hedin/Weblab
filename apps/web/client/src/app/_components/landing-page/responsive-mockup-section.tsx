'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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

    return { text, phase };
}

function PromptOnCanvasAsset() {
    const { text: promptText, phase } = useTypewriter(PROMPTS);
    const applied = phase === 'holding';
    return (
        <div className="border-foreground-primary/10 bg-background-secondary/40 mx-auto w-full max-w-sm overflow-hidden rounded-2xl border backdrop-blur-sm">
            {/* Canvas region */}
            <div className="bg-background-secondary/30 relative aspect-[16/10] w-full overflow-hidden">
                {/* Faint dot grid */}
                <div
                    className="absolute inset-0 opacity-50"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle, color-mix(in srgb, var(--foreground-primary) 8%, transparent) 1px, transparent 1px)',
                        backgroundSize: '14px 14px',
                    }}
                    aria-hidden
                />
                {/* Small artboard — pulses brand-blue when AI "applies" prompt */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div
                        className="bg-background relative w-[68%] rounded-md p-3 transition-all duration-500"
                        style={{
                            boxShadow: applied
                                ? '0 0 0 1.5px var(--foreground-brand), 0 0 0 6px color-mix(in srgb, var(--foreground-brand) 12%, transparent)'
                                : '0 0 0 1px color-mix(in srgb, var(--foreground-primary) 10%, transparent)',
                        }}
                    >
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
                            className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse bg-[var(--foreground-brand)]"
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

// Cycle through small variants of the same button — design changes propagate
// to code in sync. Three variants share the same prop name (`rounded`) so the
// code diff is just one token swap, which keeps the focus tight.
const BUTTON_VARIANTS = [
    { label: 'Continue', radius: 'rounded-lg', token: 'rounded-lg', px: 4 },
    { label: 'Get started', radius: 'rounded-xl', token: 'rounded-xl', px: 5 },
    {
        label: 'Start trial',
        radius: 'rounded-full',
        token: 'rounded-full',
        px: 5,
    },
] as const;

const VARIANT_CYCLE_MS = 4200;

function DesignToCodeAsset() {
    const [variantIdx, setVariantIdx] = useState(0);
    const [paused, setPaused] = useState(false);
    useEffect(() => {
        if (paused) return;
        const id = setInterval(() => {
            setVariantIdx((i) => (i + 1) % BUTTON_VARIANTS.length);
        }, VARIANT_CYCLE_MS);
        return () => clearInterval(id);
    }, [paused]);

    const v = BUTTON_VARIANTS[variantIdx]!;

    return (
        <div
            className="border-foreground-primary/10 bg-background mx-auto w-full max-w-sm overflow-hidden rounded-2xl border"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setPaused(false)}
        >
            {/* Design region */}
            <div className="bg-background-secondary/40 relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden">
                {/* Static dot grid via CSS only — no compositing layer */}
                <div
                    className="absolute inset-0 opacity-60"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle, color-mix(in srgb, var(--foreground-primary) 8%, transparent) 1px, transparent 1px)',
                        backgroundSize: '14px 14px',
                    }}
                    aria-hidden
                />
                {/* Button with morphing radius + selection chrome */}
                <motion.div
                    className="relative"
                    animate={{ scale: [1, 1.04, 1] }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    key={`pop-${variantIdx}`}
                >
                    <motion.div
                        className={`bg-foreground-primary text-background text-small relative inline-flex items-center justify-center px-4 py-2 font-light tracking-tight ${v.radius}`}
                        style={{
                            transition: 'border-radius 360ms cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                    >
                        <AnimatePresence mode="popLayout" initial={false}>
                            <motion.span
                                key={v.label}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                className="inline-block whitespace-nowrap"
                            >
                                {v.label}
                            </motion.span>
                        </AnimatePresence>
                    </motion.div>
                    {/* Selection ring + corner handles — single layer */}
                    <span
                        className={`pointer-events-none absolute -inset-1 ${v.radius}`}
                        style={{
                            boxShadow: 'inset 0 0 0 1.5px var(--foreground-brand)',
                            transition: 'border-radius 360ms cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                        aria-hidden
                    />
                    {(
                        [
                            '-top-1 -left-1',
                            '-top-1 -right-1',
                            '-bottom-1 -left-1',
                            '-bottom-1 -right-1',
                        ] as const
                    ).map((pos) => (
                        <span
                            key={pos}
                            className={`bg-foreground-brand pointer-events-none absolute h-1.5 w-1.5 rounded-sm ${pos}`}
                            aria-hidden
                        />
                    ))}
                </motion.div>
            </div>
            {/* Divider */}
            <div className="border-foreground-primary/10 border-t" aria-hidden />
            {/* Code region */}
            <div className="bg-background-secondary/40 p-3">
                <div className="text-foreground-quadranary mb-1.5 flex items-center gap-1.5 font-mono text-[10px]">
                    <span className="bg-foreground-brand h-1 w-1 rounded-full" aria-hidden />
                    Button.tsx
                </div>
                <pre className="text-foreground-secondary text-mini font-mono leading-relaxed">
                    {'<button className="'}
                    <motion.span
                        key={`tok-${variantIdx}`}
                        initial={{
                            backgroundColor:
                                'color-mix(in srgb, var(--foreground-brand) 24%, transparent)',
                        }}
                        animate={{ backgroundColor: 'rgba(0,0,0,0)' }}
                        transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
                        className="text-foreground-brand inline-block rounded-sm px-1"
                    >
                        {v.token}
                    </motion.span>
                    {' bg-fg px-4 py-2">'}
                    {'\n  '}
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                            key={`label-${variantIdx}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="text-foreground-primary inline-block"
                        >
                            {v.label}
                        </motion.span>
                    </AnimatePresence>
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
                    className="relative flex w-full flex-col items-center gap-8 px-4 py-16 sm:px-6"
                    id="features-mobile-1"
                >
                    <PromptOnCanvasAsset />

                    <Reveal className="w-full text-left">
                        <h2 className="heading-style-h4 text-foreground-primary mb-3 text-balance">
                            {t('panel1.title')}
                        </h2>
                        <p className="text-foreground-secondary text-base leading-[1.4] font-light tracking-tight text-balance">
                            {t('panel1.body')}
                        </p>
                    </Reveal>
                </div>

                {/* Mobile: panel 2 — design ↔ code */}
                <div
                    className="relative flex w-full flex-col items-center gap-8 px-4 py-16 sm:px-6"
                    id="features-mobile-2"
                >
                    <DesignToCodeAsset />

                    <Reveal className="w-full text-left">
                        <h2 className="heading-style-h4 text-foreground-primary mb-3 text-balance">
                            {t('panel2.title')}
                        </h2>
                        <p className="text-foreground-secondary text-base leading-[1.4] font-light tracking-tight text-balance">
                            {t('panel2.body')}
                        </p>
                    </Reveal>
                </div>
            </div>
        </>
    );
}
