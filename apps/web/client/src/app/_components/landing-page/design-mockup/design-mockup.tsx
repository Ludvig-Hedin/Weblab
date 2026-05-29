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

export type DesignMockupOverrides = {
    heroTitle?: string;
    starterPrice?: number;
    proAccent?: string;
};

interface DesignMockupProps {
    step?: DesignMockupStep;
    accent?: string;
    overrides?: DesignMockupOverrides;
    theme?: 'light' | 'dark';
}

const NAV_LINKS = ['Product', 'Pricing', 'Docs'];

const LOGO_WORDS = ['DOOMCO', 'HENCH/AI', 'LAIR&CO', 'VILE/CO'];

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
        feats: ['Unlimited lairs', 'Priority hench-support', 'Advanced AI plotting', 'Audit log'],
        featured: true,
    },
    {
        name: 'Enterprise',
        price: 49,
        sub: 'For evil empires.',
        feats: ['Org seats', 'SLA & SSO', 'Private cloud'],
    },
];

export function DesignMockup({
    step = null,
    accent,
    overrides,
    theme = 'light',
}: DesignMockupProps = {}) {
    const heroLarge = step === 'hero';
    const pricingPulse = step === 'pricing';
    const cardsAccent = step === 'restyle';
    const accentBorder = accent ?? 'border-teal-400';
    const heroTitle = overrides?.heroTitle ?? 'The lair builder';
    const starterPrice = overrides?.starterPrice ?? 0;
    const proAccentOverride = overrides?.proAccent;
    const isDark = theme === 'dark';

    return (
        <div
            className={cn(
                'flex h-140 w-140 flex-col overflow-hidden rounded-sm transition-colors duration-300',
                isDark ? 'bg-neutral-950 text-neutral-100' : 'bg-[#FCFCFA] text-neutral-900',
            )}
        >
            {/* Nav */}
            <div
                className={cn(
                    'flex h-8 shrink-0 items-center justify-between border-b px-4 backdrop-blur-md',
                    isDark
                        ? 'border-neutral-800 bg-neutral-900/80'
                        : 'border-neutral-200/80 bg-white/80',
                )}
            >
                <div className="flex items-center gap-1.5">
                    <div
                        className={cn(
                            'flex h-3.5 w-3.5 items-center justify-center rounded-sm',
                            isDark ? 'bg-neutral-100' : 'bg-neutral-900',
                        )}
                    >
                        <span
                            className={cn(
                                'text-[9px] leading-none',
                                isDark ? 'text-neutral-900' : 'text-white',
                                vujahdayScript.className,
                            )}
                        >
                            V
                        </span>
                    </div>
                    <span className="text-[9px] font-semibold tracking-tight">Villainterest</span>
                </div>
                <div
                    className={cn(
                        'flex items-center gap-4 text-[8.5px]',
                        isDark ? 'text-neutral-400' : 'text-neutral-500',
                    )}
                >
                    {NAV_LINKS.map((l) => (
                        <span
                            key={l}
                            className={cn(
                                'cursor-pointer',
                                isDark ? 'hover:text-neutral-100' : 'hover:text-neutral-900',
                                l === 'Pricing' &&
                                    pricingPulse &&
                                    (isDark
                                        ? 'font-medium text-neutral-100'
                                        : 'font-medium text-neutral-900'),
                            )}
                        >
                            {l}
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        className={cn(
                            'rounded px-1.5 py-0.5 text-[8.5px]',
                            isDark
                                ? 'text-neutral-300 hover:bg-neutral-800'
                                : 'text-neutral-600 hover:bg-neutral-100',
                        )}
                    >
                        Sign in
                    </button>
                    <button
                        className={cn(
                            'rounded-md px-1.5 py-0.5 text-[8.5px] font-medium',
                            isDark
                                ? 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200'
                                : 'bg-neutral-900 text-white hover:bg-neutral-700',
                        )}
                    >
                        Get started
                    </button>
                </div>
            </div>

            {/* Hero */}
            <div
                className={cn(
                    'relative flex flex-col items-center overflow-hidden px-6 pt-6 pb-5 transition-all duration-500',
                    isDark
                        ? 'bg-gradient-to-b from-neutral-900 via-neutral-950 to-neutral-950'
                        : 'bg-gradient-to-b from-neutral-50 via-white to-white',
                    heroLarge && 'pt-8 pb-7',
                )}
            >
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                        backgroundImage: `radial-gradient(circle, ${isDark ? '#fff' : '#000'} 0.8px, transparent 0.8px)`,
                        backgroundSize: '14px 14px',
                        opacity: isDark ? 0.06 : 0.04,
                    }}
                />
                <h1
                    className={cn(
                        'relative mb-2 text-center font-semibold tracking-[-0.028em] transition-all duration-500',
                        isDark ? 'text-neutral-100' : 'text-neutral-900',
                        heroLarge ? 'text-[34px] leading-[0.95]' : 'text-[26px] leading-[1.04]',
                    )}
                >
                    {heroTitle}
                    <br />
                    <span
                        className={cn(
                            'font-normal italic',
                            isDark ? 'text-neutral-300' : 'text-neutral-700',
                            vujahdayScript.className,
                        )}
                    >
                        for masterminds
                    </span>
                </h1>
                <p
                    className={cn(
                        'relative mb-3 max-w-[280px] text-center text-[9.5px] leading-[1.45]',
                        isDark ? 'text-neutral-400' : 'text-neutral-500',
                    )}
                >
                    Plot, build, and deploy evil schemes with AI. For the villains who ship — not
                    the ones still drafting their monologue.
                </p>
                <div className="relative flex items-center gap-1.5">
                    <button
                        className={cn(
                            'rounded-full px-2.5 py-1 text-[9px] font-medium shadow-sm',
                            isDark
                                ? 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200'
                                : 'bg-neutral-900 text-white hover:bg-neutral-700',
                        )}
                    >
                        Start scheming
                    </button>
                    <button
                        className={cn(
                            'rounded-full border px-2.5 py-1 text-[9px]',
                            isDark
                                ? 'border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800'
                                : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50',
                        )}
                    >
                        Watch demo
                    </button>
                </div>
            </div>

            {/* Logo strip */}
            <div
                className={cn(
                    'flex shrink-0 items-center gap-3 border-y px-6 py-1.5',
                    isDark ? 'border-neutral-800 bg-neutral-900/60' : 'border-neutral-100 bg-white',
                )}
            >
                <span
                    className={cn(
                        'font-mono text-[6.5px] tracking-widest whitespace-nowrap uppercase',
                        isDark ? 'text-neutral-500' : 'text-neutral-400',
                    )}
                >
                    Trusted by
                </span>
                <div className="flex flex-1 items-center justify-between opacity-60">
                    {LOGO_WORDS.map((n) => (
                        <span
                            key={n}
                            className={cn(
                                'font-serif text-[9px] font-semibold tracking-tight',
                                isDark ? 'text-neutral-300' : 'text-neutral-700',
                            )}
                        >
                            {n}
                        </span>
                    ))}
                </div>
            </div>

            {/* Pricing */}
            <div
                className={cn(
                    'relative flex-1 border-t px-5 py-4 transition-all',
                    isDark
                        ? 'border-neutral-800 bg-neutral-900'
                        : 'border-neutral-100 bg-neutral-50',
                    pricingPulse && (isDark ? 'bg-amber-900/20' : 'bg-amber-50/70'),
                )}
            >
                <div className="mb-3 flex items-baseline justify-between">
                    <div className="flex items-baseline gap-2">
                        <h2
                            className={cn(
                                'text-[12px] font-semibold tracking-tight',
                                isDark ? 'text-neutral-100' : 'text-neutral-900',
                            )}
                        >
                            Simple pricing
                        </h2>
                        <span
                            className={cn(
                                'text-[7.5px]',
                                isDark ? 'text-neutral-400' : 'text-neutral-500',
                            )}
                        >
                            Change anytime.
                        </span>
                    </div>
                    <div
                        className={cn(
                            'flex items-center gap-0.5 rounded-full border p-0.5 text-[7px]',
                            isDark
                                ? 'border-neutral-700 bg-neutral-800'
                                : 'border-neutral-200 bg-white',
                        )}
                    >
                        <span
                            className={cn(
                                'rounded-full px-1.5 py-0.5 font-medium',
                                isDark
                                    ? 'bg-neutral-100 text-neutral-900'
                                    : 'bg-neutral-900 text-white',
                            )}
                        >
                            Monthly
                        </span>
                        <span
                            className={cn(
                                'px-1.5 py-0.5',
                                isDark ? 'text-neutral-400' : 'text-neutral-500',
                            )}
                        >
                            Yearly
                        </span>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {TIERS.map((t) => {
                        const displayPrice = t.name === 'Starter' ? starterPrice : t.price;
                        const proBorder =
                            t.featured && proAccentOverride ? proAccentOverride : null;
                        return (
                            <div
                                key={t.name}
                                className={cn(
                                    'relative flex flex-col rounded-lg border p-2 transition-all',
                                    t.featured
                                        ? cn(
                                              isDark
                                                  ? 'bg-neutral-100 text-neutral-900 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.8)]'
                                                  : 'bg-neutral-900 text-white shadow-[0_6px_20px_-8px_rgba(0,0,0,0.45)]',
                                              proBorder ??
                                                  (isDark
                                                      ? 'border-neutral-100'
                                                      : 'border-neutral-900'),
                                          )
                                        : cardsAccent
                                          ? cn(isDark ? 'bg-neutral-800' : 'bg-white', accentBorder)
                                          : isDark
                                            ? 'border-neutral-800 bg-neutral-800/60'
                                            : 'border-neutral-200 bg-white',
                                )}
                            >
                                {t.featured && (
                                    <span className="absolute -top-1.5 left-2 rounded-sm bg-amber-500 px-1 py-px font-mono text-[6px] font-medium tracking-widest text-white uppercase shadow-sm">
                                        Most popular
                                    </span>
                                )}
                                <span
                                    className={cn(
                                        'text-[9px] font-semibold',
                                        t.featured
                                            ? isDark
                                                ? 'text-neutral-900'
                                                : 'text-white'
                                            : isDark
                                              ? 'text-neutral-100'
                                              : 'text-neutral-900',
                                    )}
                                >
                                    {t.name}
                                </span>
                                <span
                                    className={cn(
                                        'mb-1.5 text-[7px]',
                                        t.featured
                                            ? isDark
                                                ? 'text-neutral-500'
                                                : 'text-neutral-400'
                                            : isDark
                                              ? 'text-neutral-400'
                                              : 'text-neutral-500',
                                    )}
                                >
                                    {t.sub}
                                </span>
                                <div className="mb-1.5 flex items-baseline gap-0.5">
                                    <span
                                        className={cn(
                                            'text-[17px] font-semibold tracking-tight transition-all',
                                            t.featured
                                                ? isDark
                                                    ? 'text-neutral-900'
                                                    : 'text-white'
                                                : isDark
                                                  ? 'text-neutral-100'
                                                  : 'text-neutral-900',
                                        )}
                                    >
                                        ${displayPrice}
                                    </span>
                                    <span
                                        className={cn(
                                            'text-[8px]',
                                            t.featured
                                                ? isDark
                                                    ? 'text-neutral-500'
                                                    : 'text-neutral-400'
                                                : isDark
                                                  ? 'text-neutral-400'
                                                  : 'text-neutral-500',
                                        )}
                                    >
                                        /mo
                                    </span>
                                </div>
                                <ul className="mb-2 flex-1 space-y-0.5">
                                    {t.feats.map((f) => (
                                        <li
                                            key={f}
                                            className={cn(
                                                'flex items-start gap-1 text-[7.5px] leading-snug',
                                                t.featured
                                                    ? isDark
                                                        ? 'text-neutral-700'
                                                        : 'text-neutral-300'
                                                    : isDark
                                                      ? 'text-neutral-300'
                                                      : 'text-neutral-600',
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    t.featured
                                                        ? 'text-amber-500'
                                                        : isDark
                                                          ? 'text-neutral-500'
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
                                        'w-full rounded-md py-1 text-[7.5px] font-medium transition-colors',
                                        t.featured
                                            ? isDark
                                                ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                                                : 'bg-white text-neutral-900 hover:bg-neutral-100'
                                            : isDark
                                              ? 'border border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                                              : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-50',
                                    )}
                                >
                                    {t.featured ? 'Start free trial' : 'Choose plan'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export function DesignMockupMobile({ theme = 'light' }: { theme?: 'light' | 'dark' } = {}) {
    const isDark = theme === 'dark';
    return (
        <div
            className={cn(
                'relative flex h-116 w-50 flex-col overflow-hidden rounded-sm border transition-colors duration-300',
                isDark
                    ? 'border-neutral-800 bg-neutral-950 text-neutral-100'
                    : 'border-neutral-200 bg-[#FCFCFA] text-neutral-900',
            )}
        >
            {/* Nav */}
            <div
                className={cn(
                    'flex h-7 shrink-0 items-center justify-between border-b px-2 backdrop-blur',
                    isDark
                        ? 'border-neutral-800 bg-neutral-900/95'
                        : 'border-neutral-200 bg-white/95',
                )}
            >
                <div className="flex items-center gap-1">
                    <div
                        className={cn(
                            'flex h-3 w-3 items-center justify-center rounded-sm',
                            isDark ? 'bg-neutral-100' : 'bg-neutral-900',
                        )}
                    >
                        <span
                            className={cn(
                                'text-[7px]',
                                isDark ? 'text-neutral-900' : 'text-white',
                                vujahdayScript.className,
                            )}
                        >
                            V
                        </span>
                    </div>
                    <span className="text-[7px] font-semibold tracking-tight">Villainterest</span>
                </div>
                <div className="flex h-4 w-4 flex-col items-center justify-center gap-[2px]">
                    <span
                        className={cn(
                            'block h-px w-3',
                            isDark ? 'bg-neutral-300' : 'bg-neutral-700',
                        )}
                    />
                    <span
                        className={cn(
                            'block h-px w-3',
                            isDark ? 'bg-neutral-300' : 'bg-neutral-700',
                        )}
                    />
                </div>
            </div>

            {/* Hero */}
            <div
                className={cn(
                    'relative flex flex-col items-center px-3 pt-4 pb-3',
                    isDark
                        ? 'bg-gradient-to-b from-neutral-900 to-neutral-950'
                        : 'bg-gradient-to-b from-neutral-50 to-white',
                )}
            >
                <h1 className="mb-1.5 text-center text-[15px] leading-[1] font-semibold tracking-[-0.028em]">
                    The lair builder
                    <br />
                    <span
                        className={cn(
                            'font-normal italic',
                            isDark ? 'text-neutral-300' : 'text-neutral-700',
                            vujahdayScript.className,
                        )}
                    >
                        for masterminds
                    </span>
                </h1>
                <p
                    className={cn(
                        'mb-2 px-2 text-center text-[7px] leading-snug',
                        isDark ? 'text-neutral-400' : 'text-neutral-500',
                    )}
                >
                    Plot, build, deploy your evil schemes with AI.
                </p>
                <button
                    className={cn(
                        'rounded-full px-2.5 py-1 text-[7px] font-medium shadow-sm',
                        isDark ? 'bg-neutral-100 text-neutral-900' : 'bg-neutral-900 text-white',
                    )}
                >
                    Start scheming
                </button>
            </div>

            {/* Logo strip */}
            <div
                className={cn(
                    'flex shrink-0 items-center justify-around border-y py-1 opacity-60',
                    isDark ? 'border-neutral-800 bg-neutral-900/60' : 'border-neutral-100 bg-white',
                )}
            >
                {LOGO_WORDS.slice(0, 3).map((n) => (
                    <span
                        key={n}
                        className={cn(
                            'font-serif text-[7px] font-semibold tracking-tight',
                            isDark ? 'text-neutral-300' : 'text-neutral-700',
                        )}
                    >
                        {n}
                    </span>
                ))}
            </div>

            {/* Pricing tiers stacked */}
            <div
                className={cn(
                    'flex flex-1 flex-col gap-1.5 border-t px-2 py-2',
                    isDark
                        ? 'border-neutral-800 bg-neutral-900'
                        : 'border-neutral-100 bg-neutral-50',
                )}
            >
                <div
                    className={cn(
                        'text-[7px] font-semibold tracking-tight',
                        isDark ? 'text-neutral-100' : 'text-neutral-900',
                    )}
                >
                    Pricing
                </div>
                {TIERS.map((t) => (
                    <div
                        key={t.name}
                        className={cn(
                            'flex items-center justify-between rounded-md border px-1.5 py-1.5',
                            t.featured
                                ? isDark
                                    ? 'border-neutral-100 bg-neutral-100 text-neutral-900'
                                    : 'border-neutral-900 bg-neutral-900 text-white'
                                : isDark
                                  ? 'border-neutral-800 bg-neutral-800/60'
                                  : 'border-neutral-200 bg-white',
                        )}
                    >
                        <div className="flex flex-col">
                            <span className="text-[7px] font-semibold">{t.name}</span>
                            <span
                                className={cn(
                                    'text-[6px]',
                                    t.featured
                                        ? isDark
                                            ? 'text-neutral-500'
                                            : 'text-neutral-400'
                                        : isDark
                                          ? 'text-neutral-400'
                                          : 'text-neutral-500',
                                )}
                            >
                                {t.sub}
                            </span>
                        </div>
                        <div className="text-right">
                            <span className="text-[9px] font-semibold">${t.price}</span>
                            <span
                                className={cn(
                                    'text-[6px]',
                                    t.featured
                                        ? isDark
                                            ? 'text-neutral-500'
                                            : 'text-neutral-400'
                                        : isDark
                                          ? 'text-neutral-400'
                                          : 'text-neutral-500',
                                )}
                            >
                                /mo
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Mobile tab bar */}
            <div
                className={cn(
                    'absolute right-0 bottom-0 left-0 z-10 flex h-7 items-center justify-around border-t px-2 backdrop-blur-md',
                    isDark
                        ? 'border-neutral-800 bg-neutral-900/90'
                        : 'border-neutral-200 bg-white/90',
                )}
            >
                {['◆', '○', '+', '⌘', '☰'].map((g, i) => (
                    <span
                        key={i}
                        className={cn(
                            'text-[10px]',
                            i === 0
                                ? isDark
                                    ? 'text-neutral-100'
                                    : 'text-neutral-900'
                                : isDark
                                  ? 'text-neutral-600'
                                  : 'text-neutral-400',
                        )}
                    >
                        {g}
                    </span>
                ))}
            </div>
        </div>
    );
}
