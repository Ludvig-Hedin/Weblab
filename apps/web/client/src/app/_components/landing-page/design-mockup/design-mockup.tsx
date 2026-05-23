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
// editing. The mockup is intentionally static otherwise — animating layout
// per prompt is out of scope and would fight the canvas pan/zoom.

export type DesignMockupStep = 'pricing' | 'hero' | 'restyle' | null;

interface DesignMockupProps {
    step?: DesignMockupStep;
    accent?: string;
}

const NAV_LINKS = ['Product', 'Pricing', 'Docs', 'Blog'];

const FEATURES = [
    {
        title: 'Plot',
        desc: 'Outline elaborate schemes with AI as your co-conspirator.',
    },
    {
        title: 'Build',
        desc: 'From sketch to working lair in minutes, not months.',
    },
    {
        title: 'Deploy',
        desc: 'Ship to the world — or keep it hidden in the shadows.',
    },
];

const TIERS = [
    {
        name: 'Starter',
        price: 0,
        sub: 'For solo villains.',
        feats: ['1 lair', 'Community plotting', 'Basic schemes'],
    },
    {
        name: 'Pro',
        price: 12,
        sub: 'For ambitious masterminds.',
        feats: ['Unlimited lairs', 'Priority hench-support', 'Advanced AI', 'Custom domains'],
        featured: true,
    },
    {
        name: 'Enterprise',
        price: 49,
        sub: 'For evil empires.',
        feats: ['Org seats', 'SLA & audit log', 'Dedicated CSM'],
    },
];

export function DesignMockup({ step = null, accent }: DesignMockupProps = {}) {
    const heroLarge = step === 'hero';
    const pricingPulse = step === 'pricing';
    const cardsAccent = step === 'restyle';
    const accentBorder = accent ?? 'border-teal-400';

    return (
        <div className="flex h-140 w-140 flex-col overflow-hidden rounded-sm bg-white text-gray-900">
            {/* Top Nav */}
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-gray-200 bg-white/95 px-4 backdrop-blur">
                <div className="flex items-center gap-1.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded bg-gray-900">
                        <span className={cn('text-[10px] text-white', vujahdayScript.className)}>
                            V
                        </span>
                    </div>
                    <span className="text-[10px] font-semibold tracking-tight">Villainterest</span>
                </div>
                <div className="flex items-center gap-3.5 text-[9px] text-gray-500">
                    {NAV_LINKS.map((l) => (
                        <span
                            key={l}
                            className={cn(l === 'Pricing' && pricingPulse && 'text-gray-900')}
                        >
                            {l}
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-1">
                    <button className="rounded px-1.5 py-0.5 text-[9px] text-gray-600 hover:bg-gray-100">
                        Sign in
                    </button>
                    <button className="rounded-md bg-gray-900 px-2 py-1 text-[9px] font-medium text-white hover:bg-gray-700">
                        Get started
                    </button>
                </div>
            </div>

            {/* Hero */}
            <div
                className={cn(
                    'flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white px-6 pt-7 pb-7 transition-all duration-500',
                    heroLarge && 'pt-9 pb-9',
                )}
            >
                <span className="mb-2 font-mono text-[7px] tracking-widest text-gray-500 uppercase">
                    ◆ v1.6 — Now with pricing tiers
                </span>
                <h1
                    className={cn(
                        'mb-2 text-center font-semibold tracking-[-0.02em] text-gray-900 transition-all duration-500',
                        heroLarge ? 'text-[36px] leading-[0.95]' : 'text-[26px] leading-[1.05]',
                    )}
                >
                    The lair builder
                    <br />
                    <span className={cn('font-normal italic', vujahdayScript.className)}>
                        for masterminds
                    </span>
                </h1>
                <p className="mb-3 max-w-[300px] text-center text-[10px] leading-snug text-gray-500">
                    Plan, plot, and deploy your evil schemes with AI. Built for villains who ship.
                </p>
                <div className="flex items-center gap-1.5">
                    <button className="rounded-full bg-gray-900 px-3 py-1.5 text-[10px] font-medium text-white hover:bg-gray-700">
                        Start scheming
                    </button>
                    <button className="rounded-full border border-gray-300 px-3 py-1.5 text-[10px] text-gray-700 hover:bg-gray-50">
                        Watch demo
                    </button>
                </div>
            </div>

            {/* Features */}
            <div className="grid shrink-0 grid-cols-3 gap-3 border-t border-gray-100 px-6 py-4">
                {FEATURES.map((f) => (
                    <div
                        key={f.title}
                        className={cn(
                            'flex flex-col gap-1 rounded-md border bg-white p-2 transition-colors',
                            cardsAccent ? accentBorder : 'border-gray-200',
                        )}
                    >
                        <div className="h-4 w-4 rounded bg-gray-900" />
                        <span className="text-[10px] font-semibold">{f.title}</span>
                        <span className="text-[8px] leading-tight text-gray-500">{f.desc}</span>
                    </div>
                ))}
            </div>

            {/* Pricing */}
            <div
                className={cn(
                    'flex-1 border-t border-gray-100 bg-gray-50 px-6 py-4 transition-all',
                    pricingPulse && 'bg-amber-50/60',
                )}
            >
                <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="text-[12px] font-semibold tracking-tight">Pricing</h2>
                    <span className="text-[8px] text-gray-500">Cancel any time.</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {TIERS.map((t) => (
                        <div
                            key={t.name}
                            className={cn(
                                'flex flex-col rounded-md border bg-white p-2 transition-colors',
                                t.featured
                                    ? 'border-gray-900 ring-1 ring-gray-900/10'
                                    : cardsAccent
                                      ? accentBorder
                                      : 'border-gray-200',
                            )}
                        >
                            <div className="mb-1 flex items-center justify-between">
                                <span className="text-[9px] font-semibold">{t.name}</span>
                                {t.featured && (
                                    <span className="rounded-sm bg-gray-900 px-1 py-px text-[6px] font-medium tracking-wider text-white uppercase">
                                        Popular
                                    </span>
                                )}
                            </div>
                            <div className="mb-1.5">
                                <span className="text-[16px] font-semibold tracking-tight">
                                    ${t.price}
                                </span>
                                <span className="text-[8px] text-gray-500">/mo</span>
                            </div>
                            <ul className="mb-2 flex-1 space-y-0.5">
                                {t.feats.map((f) => (
                                    <li
                                        key={f}
                                        className="flex items-start gap-1 text-[8px] text-gray-600"
                                    >
                                        <span className="text-gray-400">✓</span>
                                        <span>{f}</span>
                                    </li>
                                ))}
                            </ul>
                            <button
                                className={cn(
                                    'w-full rounded-md py-1 text-[8px] font-medium',
                                    t.featured
                                        ? 'bg-gray-900 text-white hover:bg-gray-700'
                                        : 'border border-gray-300 text-gray-700 hover:bg-gray-50',
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
        <div className="relative flex h-116 w-50 flex-col overflow-hidden rounded-sm border border-gray-200 bg-white text-gray-900">
            {/* Top Nav */}
            <div className="flex h-7 shrink-0 items-center justify-between border-b border-gray-200 px-2">
                <div className="flex items-center gap-1">
                    <div className="flex h-3 w-3 items-center justify-center rounded bg-gray-900">
                        <span className={cn('text-[7px] text-white', vujahdayScript.className)}>
                            V
                        </span>
                    </div>
                    <span className="text-[7px] font-semibold tracking-tight">Villainterest</span>
                </div>
                <div className="flex h-4 w-4 flex-col items-center justify-center gap-[2px]">
                    <span className="block h-px w-3 bg-gray-700" />
                    <span className="block h-px w-3 bg-gray-700" />
                </div>
            </div>

            {/* Hero */}
            <div className="flex flex-col items-center bg-gradient-to-b from-gray-50 to-white px-3 pt-4 pb-3">
                <h1 className="mb-1.5 text-center text-[14px] leading-[1] font-semibold tracking-[-0.02em]">
                    The lair builder
                    <br />
                    <span className={cn('font-normal italic', vujahdayScript.className)}>
                        for masterminds
                    </span>
                </h1>
                <p className="mb-2 px-2 text-center text-[7px] leading-snug text-gray-500">
                    Plot, build, deploy your schemes with AI.
                </p>
                <button className="rounded-full bg-gray-900 px-2.5 py-1 text-[7px] font-medium text-white">
                    Start scheming
                </button>
            </div>

            {/* Pricing tiers stacked */}
            <div className="flex flex-1 flex-col gap-1.5 border-t border-gray-100 bg-gray-50 px-2 py-2">
                <div className="text-[7px] font-semibold tracking-tight">Pricing</div>
                {TIERS.map((t) => (
                    <div
                        key={t.name}
                        className={cn(
                            'flex items-center justify-between rounded-md border bg-white px-1.5 py-1',
                            t.featured ? 'border-gray-900' : 'border-gray-200',
                        )}
                    >
                        <div className="flex flex-col">
                            <span className="text-[7px] font-semibold">{t.name}</span>
                            <span className="text-[6px] text-gray-500">{t.sub}</span>
                        </div>
                        <div className="text-right">
                            <span className="text-[9px] font-semibold">${t.price}</span>
                            <span className="text-[6px] text-gray-500">/mo</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Mobile Tab Bar */}
            <div className="absolute right-0 bottom-0 left-0 z-10 flex h-7 items-center justify-around border-t border-gray-200 bg-white/90 px-2 backdrop-blur-md">
                {['◆', '○', '+', '⌘', '☰'].map((g, i) => (
                    <span
                        key={i}
                        className={cn('text-[10px]', i === 0 ? 'text-gray-900' : 'text-gray-400')}
                    >
                        {g}
                    </span>
                ))}
            </div>
        </div>
    );
}
