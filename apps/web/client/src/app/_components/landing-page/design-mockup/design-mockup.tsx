'use client';

import React from 'react';

import { cn } from '@weblab/ui/utils';

import { vujahdayScript } from '../../../fonts';

// SaaS landing page mockup — replaces the previous Pinterest-style gallery.
// Matches the chat demo prompts ("Add a pricing section", "Make the hero
// headline larger", "Style cards with a teal accent border"), so the
// canvas content reflects what the AI is doing rather than diverging.
//
// `step` lets the parent pulse-highlight whichever section the prompt is
// editing. Editorial aesthetic — warm off-white, restrained amber accent,
// inverted featured tier — to avoid the generic AI-startup look.

export type DesignMockupStep = 'pricing' | 'hero' | 'restyle' | null;

interface DesignMockupProps {
    step?: DesignMockupStep;
    accent?: string;
}

const NAV_LINKS = ['Product', 'Pricing', 'Docs', 'Blog'];

const LOGO_WORDS = ['DOOMCO', 'HENCH/AI', 'LAIR&CO', 'VILE/CO', 'BANE'];

const STATS = [
    { value: '12k+', label: 'masterminds plotting' },
    { value: '99.9%', label: 'lair uptime' },
    { value: '2 min', label: 'to first deploy' },
];

const TIERS = [
    {
        name: 'Starter',
        price: 0,
        sub: 'For solo villains.',
        feats: ['1 lair', 'Community plotting', 'Basic schemes', '500 deploys/mo'],
    },
    {
        name: 'Pro',
        price: 12,
        sub: 'For ambitious masterminds.',
        feats: [
            'Unlimited lairs',
            'Priority hench-support',
            'Advanced AI plotting',
            'Custom domains',
            'Audit log',
        ],
        featured: true,
    },
    {
        name: 'Enterprise',
        price: 49,
        sub: 'For evil empires.',
        feats: ['Org seats', 'SLA & SSO', 'Dedicated CSM', 'Private cloud'],
    },
];

export function DesignMockup({ step = null, accent }: DesignMockupProps = {}) {
    const heroLarge = step === 'hero';
    const pricingPulse = step === 'pricing';
    const cardsAccent = step === 'restyle';
    const accentBorder = accent ?? 'border-teal-400';

    return (
        <div className="flex h-140 w-140 flex-col overflow-hidden rounded-sm bg-[#FCFCFA] text-neutral-900">
            {/* Nav */}
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-neutral-200/80 bg-white/80 px-4 backdrop-blur-md">
                <div className="flex items-center gap-1.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-sm bg-neutral-900">
                        <span
                            className={cn(
                                'text-[10px] leading-none text-white',
                                vujahdayScript.className,
                            )}
                        >
                            V
                        </span>
                    </div>
                    <span className="text-[10px] font-semibold tracking-tight">Villainterest</span>
                    <span className="ml-1 rounded-sm bg-neutral-100 px-1 py-px text-[7px] font-medium tracking-wide text-neutral-500 uppercase">
                        Beta
                    </span>
                </div>
                <div className="flex items-center gap-4 text-[9px] text-neutral-500">
                    {NAV_LINKS.map((l) => (
                        <span
                            key={l}
                            className={cn(
                                'cursor-pointer hover:text-neutral-900',
                                l === 'Pricing' && pricingPulse && 'font-medium text-neutral-900',
                            )}
                        >
                            {l}
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-1">
                    <button className="rounded px-1.5 py-0.5 text-[9px] text-neutral-600 hover:bg-neutral-100">
                        Sign in
                    </button>
                    <button className="rounded-md bg-neutral-900 px-2 py-1 text-[9px] font-medium text-white shadow-sm hover:bg-neutral-700">
                        Get started →
                    </button>
                </div>
            </div>

            {/* Hero */}
            <div
                className={cn(
                    'relative flex flex-col items-center overflow-hidden bg-gradient-to-b from-neutral-50 via-white to-white px-6 pt-7 pb-6 transition-all duration-500',
                    heroLarge && 'pt-9 pb-8',
                )}
            >
                {/* Subtle dot grid — adds texture without screaming */}
                <div
                    className="pointer-events-none absolute inset-0 opacity-[0.04]"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle, #000 0.8px, transparent 0.8px)',
                        backgroundSize: '14px 14px',
                    }}
                />
                <h1
                    className={cn(
                        'relative mb-2.5 text-center font-semibold tracking-[-0.028em] text-neutral-900 transition-all duration-500',
                        heroLarge
                            ? 'text-[38px] leading-[0.92]'
                            : 'text-[28px] leading-[1.02]',
                    )}
                >
                    The lair builder
                    <br />
                    <span
                        className={cn(
                            'font-normal italic text-neutral-700',
                            vujahdayScript.className,
                        )}
                    >
                        for masterminds
                    </span>
                </h1>
                <p className="relative mb-3.5 max-w-[300px] text-center text-[10px] leading-[1.5] text-neutral-500">
                    Plot, build, and deploy evil schemes with AI. Built for the villains who
                    actually ship — not the ones still drafting their monologue.
                </p>
                <div className="relative flex items-center gap-1.5">
                    <button className="rounded-full bg-neutral-900 px-3 py-1.5 text-[10px] font-medium text-white shadow-md hover:bg-neutral-700">
                        Start scheming
                    </button>
                    <button className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-[10px] text-neutral-700 hover:bg-neutral-50">
                        Watch demo →
                    </button>
                </div>
            </div>

            {/* Logo strip — proof-by-association without the slop */}
            <div className="flex shrink-0 items-center gap-4 border-y border-neutral-100 bg-white px-6 py-2">
                <span className="font-mono text-[7px] tracking-widest whitespace-nowrap text-neutral-400 uppercase">
                    Trusted by
                </span>
                <div className="flex flex-1 items-center justify-between opacity-60">
                    {LOGO_WORDS.map((n) => (
                        <span
                            key={n}
                            className="font-serif text-[10px] font-semibold tracking-tight text-neutral-700"
                        >
                            {n}
                        </span>
                    ))}
                </div>
            </div>

            {/* Stats band */}
            <div className="grid shrink-0 grid-cols-3 divide-x divide-neutral-100 border-b border-neutral-100 bg-white">
                {STATS.map((s) => (
                    <div key={s.label} className="flex flex-col items-center justify-center py-3">
                        <span className="text-[16px] font-semibold tracking-tight text-neutral-900">
                            {s.value}
                        </span>
                        <span className="text-[7px] tracking-wide text-neutral-500 uppercase">
                            {s.label}
                        </span>
                    </div>
                ))}
            </div>

            {/* Pricing */}
            <div
                className={cn(
                    'relative flex-1 border-t border-neutral-100 bg-neutral-50 px-6 py-4 transition-all',
                    pricingPulse && 'bg-amber-50/70',
                )}
            >
                <div className="mb-2.5 flex items-baseline justify-between">
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-[13px] font-semibold tracking-tight text-neutral-900">
                            Simple pricing
                        </h2>
                        <span className="text-[8px] text-neutral-500">
                            Pick a plan — change anytime.
                        </span>
                    </div>
                    <div className="flex items-center gap-0.5 rounded-full border border-neutral-200 bg-white p-0.5 text-[7px]">
                        <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 font-medium text-white">
                            Monthly
                        </span>
                        <span className="px-1.5 py-0.5 text-neutral-500">Yearly</span>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {TIERS.map((t) => (
                        <div
                            key={t.name}
                            className={cn(
                                'relative flex flex-col rounded-lg border p-2.5 transition-all',
                                t.featured
                                    ? 'border-neutral-900 bg-neutral-900 text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4)]'
                                    : cardsAccent
                                      ? cn('bg-white', accentBorder)
                                      : 'border-neutral-200 bg-white',
                            )}
                        >
                            {t.featured && (
                                <span className="absolute -top-1.5 left-2.5 rounded-sm bg-amber-500 px-1 py-px font-mono text-[6px] font-medium tracking-widest text-white uppercase shadow-sm">
                                    Most popular
                                </span>
                            )}
                            <span
                                className={cn(
                                    'text-[9px] font-semibold',
                                    t.featured && 'text-white',
                                )}
                            >
                                {t.name}
                            </span>
                            <span
                                className={cn(
                                    'mb-1.5 text-[7px]',
                                    t.featured ? 'text-neutral-400' : 'text-neutral-500',
                                )}
                            >
                                {t.sub}
                            </span>
                            <div className="mb-2 flex items-baseline gap-0.5">
                                <span
                                    className={cn(
                                        'text-[20px] font-semibold tracking-tight',
                                        t.featured && 'text-white',
                                    )}
                                >
                                    ${t.price}
                                </span>
                                <span
                                    className={cn(
                                        'text-[8px]',
                                        t.featured ? 'text-neutral-400' : 'text-neutral-500',
                                    )}
                                >
                                    /mo
                                </span>
                            </div>
                            <ul className="mb-2 flex-1 space-y-1">
                                {t.feats.map((f) => (
                                    <li
                                        key={f}
                                        className={cn(
                                            'flex items-start gap-1 text-[8px] leading-tight',
                                            t.featured ? 'text-neutral-300' : 'text-neutral-600',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                t.featured
                                                    ? 'text-amber-400'
                                                    : 'text-neutral-400',
                                            )}
                                        >
                                            ✓
                                        </span>
                                        <span>{f}</span>
                                    </li>
                                ))}
                            </ul>
                            <button
                                className={cn(
                                    'w-full rounded-md py-1 text-[8px] font-medium transition-colors',
                                    t.featured
                                        ? 'bg-white text-neutral-900 hover:bg-neutral-100'
                                        : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-50',
                                )}
                            >
                                {t.featured ? 'Start free trial' : 'Choose plan'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function DesignMockupMobile() {
    return (
        <div className="relative flex h-116 w-50 flex-col overflow-hidden rounded-sm border border-neutral-200 bg-[#FCFCFA] text-neutral-900">
            {/* Nav */}
            <div className="flex h-7 shrink-0 items-center justify-between border-b border-neutral-200 bg-white/95 px-2 backdrop-blur">
                <div className="flex items-center gap-1">
                    <div className="flex h-3 w-3 items-center justify-center rounded-sm bg-neutral-900">
                        <span className={cn('text-[7px] text-white', vujahdayScript.className)}>
                            V
                        </span>
                    </div>
                    <span className="text-[7px] font-semibold tracking-tight">Villainterest</span>
                </div>
                <div className="flex h-4 w-4 flex-col items-center justify-center gap-[2px]">
                    <span className="block h-px w-3 bg-neutral-700" />
                    <span className="block h-px w-3 bg-neutral-700" />
                </div>
            </div>

            {/* Hero */}
            <div className="relative flex flex-col items-center bg-gradient-to-b from-neutral-50 to-white px-3 pt-4 pb-3">
                <h1 className="mb-1.5 text-center text-[15px] leading-[1] font-semibold tracking-[-0.028em]">
                    The lair builder
                    <br />
                    <span
                        className={cn(
                            'font-normal italic text-neutral-700',
                            vujahdayScript.className,
                        )}
                    >
                        for masterminds
                    </span>
                </h1>
                <p className="mb-2 px-2 text-center text-[7px] leading-snug text-neutral-500">
                    Plot, build, deploy your evil schemes with AI.
                </p>
                <button className="rounded-full bg-neutral-900 px-2.5 py-1 text-[7px] font-medium text-white shadow-sm">
                    Start scheming
                </button>
            </div>

            {/* Logo strip */}
            <div className="flex shrink-0 items-center justify-around border-y border-neutral-100 bg-white py-1 opacity-60">
                {LOGO_WORDS.slice(0, 3).map((n) => (
                    <span
                        key={n}
                        className="font-serif text-[7px] font-semibold tracking-tight text-neutral-700"
                    >
                        {n}
                    </span>
                ))}
            </div>

            {/* Pricing tiers stacked */}
            <div className="flex flex-1 flex-col gap-1.5 border-t border-neutral-100 bg-neutral-50 px-2 py-2">
                <div className="text-[7px] font-semibold tracking-tight text-neutral-900">
                    Pricing
                </div>
                {TIERS.map((t) => (
                    <div
                        key={t.name}
                        className={cn(
                            'flex items-center justify-between rounded-md border px-1.5 py-1.5',
                            t.featured
                                ? 'border-neutral-900 bg-neutral-900 text-white'
                                : 'border-neutral-200 bg-white',
                        )}
                    >
                        <div className="flex flex-col">
                            <span
                                className={cn(
                                    'text-[7px] font-semibold',
                                    t.featured && 'text-white',
                                )}
                            >
                                {t.name}
                            </span>
                            <span
                                className={cn(
                                    'text-[6px]',
                                    t.featured ? 'text-neutral-400' : 'text-neutral-500',
                                )}
                            >
                                {t.sub}
                            </span>
                        </div>
                        <div className="text-right">
                            <span
                                className={cn(
                                    'text-[9px] font-semibold',
                                    t.featured && 'text-white',
                                )}
                            >
                                ${t.price}
                            </span>
                            <span
                                className={cn(
                                    'text-[6px]',
                                    t.featured ? 'text-neutral-400' : 'text-neutral-500',
                                )}
                            >
                                /mo
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Mobile tab bar */}
            <div className="absolute right-0 bottom-0 left-0 z-10 flex h-7 items-center justify-around border-t border-neutral-200 bg-white/90 px-2 backdrop-blur-md">
                {['◆', '○', '+', '⌘', '☰'].map((g, i) => (
                    <span
                        key={i}
                        className={cn(
                            'text-[10px]',
                            i === 0 ? 'text-neutral-900' : 'text-neutral-400',
                        )}
                    >
                        {g}
                    </span>
                ))}
            </div>
        </div>
    );
}
