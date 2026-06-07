'use client';

import React from 'react';

import { cn } from '@weblab/ui/utils';

// SaaS landing-page mockup rendered inside the editor canvas. Intentionally a
// *simulated user site* — not Weblab's own UI — so it uses a plain neutral
// palette rather than design tokens.
//
// Aesthetic: flat, minimal, modern SaaS (Linear/Vercel-ish). No gradients,
// no shadows, no script/serif fonts, hairline 1px borders, small radii,
// light type weights. `step` lets the parent highlight the section the chat
// prompt is editing; `overrides`/`accent` reflect live collab + AI edits.

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

const LOGO_WORDS = ['DOOMCO', 'HENCH', 'LAIR&CO', 'VILE'];

const TIERS = [
    {
        name: 'Starter',
        price: 0,
        sub: 'For solo villains',
        feats: ['1 lair', 'Community plotting', 'Basic schemes'],
    },
    {
        name: 'Pro',
        price: 12,
        sub: 'For ambitious masterminds',
        feats: ['Unlimited lairs', 'Priority support', 'Advanced AI plotting', 'Audit log'],
        featured: true,
    },
    {
        name: 'Enterprise',
        price: 49,
        sub: 'For evil empires',
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
    const accentBorder = accent ?? 'border-neutral-400';
    const heroTitle = overrides?.heroTitle ?? 'The lair builder';
    const starterPrice = overrides?.starterPrice ?? 0;
    const proAccentOverride = overrides?.proAccent;
    const isDark = theme === 'dark';

    // Flat neutral palette — no gradients, hairline borders only.
    const c = {
        bg: isDark ? 'bg-neutral-950' : 'bg-white',
        text: isDark ? 'text-neutral-100' : 'text-neutral-900',
        muted: isDark ? 'text-neutral-400' : 'text-neutral-500',
        faint: isDark ? 'text-neutral-500' : 'text-neutral-400',
        border: isDark ? 'border-neutral-800' : 'border-neutral-200',
        panel: isDark ? 'bg-neutral-900' : 'bg-neutral-50',
        card: isDark ? 'bg-neutral-900' : 'bg-white',
        solidBg: isDark ? 'bg-neutral-100' : 'bg-neutral-900',
        solidText: isDark ? 'text-neutral-900' : 'text-white',
        solidHover: isDark ? 'hover:bg-neutral-200' : 'hover:bg-neutral-800',
        strongBorder: isDark ? 'border-neutral-100' : 'border-neutral-900',
    };

    return (
        <div className={cn('flex h-140 w-140 flex-col overflow-hidden', c.bg, c.text)}>
            {/* Nav */}
            <div
                className={cn(
                    'flex h-10 shrink-0 items-center justify-between border-b px-6',
                    c.border,
                )}
            >
                <div className="flex items-center gap-1.5">
                    <div className={cn('h-3 w-3 rounded-sm', c.solidBg)} />
                    <span className="text-[9px] font-medium tracking-tight">Villainterest</span>
                </div>
                <div className={cn('flex items-center gap-6 text-[8.5px]', c.muted)}>
                    {NAV_LINKS.map((l) => (
                        <span
                            key={l}
                            className={cn(
                                'cursor-pointer',
                                isDark ? 'hover:text-neutral-100' : 'hover:text-neutral-900',
                                l === 'Pricing' && pricingPulse && c.text,
                            )}
                        >
                            {l}
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-2.5">
                    <span className={cn('text-[8.5px]', c.muted)}>Sign in</span>
                    <button
                        className={cn(
                            'rounded-full px-2.5 py-0.5 text-[8.5px] font-medium',
                            c.solidBg,
                            c.solidText,
                            c.solidHover,
                        )}
                    >
                        Get started
                    </button>
                </div>
            </div>

            {/* Hero */}
            <div
                className={cn(
                    'flex flex-col items-center px-6 transition-all duration-500',
                    heroLarge ? 'pt-10 pb-9' : 'pt-8 pb-7',
                )}
            >
                <h1
                    className={cn(
                        'mb-2 text-center font-medium tracking-[-0.02em] transition-all duration-500',
                        heroLarge ? 'text-[32px] leading-[1.05]' : 'text-[25px] leading-[1.1]',
                    )}
                >
                    {heroTitle} <span className={cn('font-normal', c.muted)}>for masterminds</span>
                </h1>
                <p
                    className={cn(
                        'mb-4 max-w-[260px] text-center text-[9.5px] leading-[1.5]',
                        c.muted,
                    )}
                >
                    Plot, build, and deploy with AI. For villains who ship.
                </p>
                <div className="flex items-center gap-2.5">
                    <button
                        className={cn(
                            'rounded-full px-3.5 py-1 text-[9px] font-medium',
                            c.solidBg,
                            c.solidText,
                            c.solidHover,
                        )}
                    >
                        Start scheming
                    </button>
                    <button
                        className={cn(
                            'rounded-full border px-3.5 py-1 text-[9px]',
                            c.border,
                            c.muted,
                        )}
                    >
                        Watch demo
                    </button>
                </div>
            </div>

            {/* Logo strip */}
            <div
                className={cn(
                    'flex shrink-0 items-center justify-center gap-7 border-y px-6 py-2.5',
                    c.border,
                )}
            >
                {LOGO_WORDS.map((n) => (
                    <span
                        key={n}
                        className={cn('text-[8px] font-medium tracking-[0.12em]', c.faint)}
                    >
                        {n}
                    </span>
                ))}
            </div>

            {/* Pricing */}
            <div
                className={cn(
                    'flex-1 border-t px-6 py-5 transition-colors',
                    c.border,
                    c.panel,
                    pricingPulse &&
                        (isDark
                            ? 'ring-1 ring-neutral-700 ring-inset'
                            : 'ring-1 ring-neutral-300 ring-inset'),
                )}
            >
                <div className="mb-3.5 flex items-baseline justify-between">
                    <h2 className="text-[12px] font-medium tracking-tight">Pricing</h2>
                    <div
                        className={cn(
                            'flex items-center gap-0.5 rounded-full border p-0.5 text-[7px]',
                            c.border,
                            c.card,
                        )}
                    >
                        <span
                            className={cn(
                                'rounded-full px-1.5 py-0.5 font-medium',
                                c.solidBg,
                                c.solidText,
                            )}
                        >
                            Monthly
                        </span>
                        <span className={cn('px-1.5 py-0.5', c.muted)}>Yearly</span>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                    {TIERS.map((t) => {
                        const displayPrice = t.name === 'Starter' ? starterPrice : t.price;
                        const featuredBorder = proAccentOverride ?? c.strongBorder;
                        return (
                            <div
                                key={t.name}
                                className={cn(
                                    'flex flex-col rounded-md border p-2.5 transition-colors',
                                    c.card,
                                    t.featured
                                        ? featuredBorder
                                        : cardsAccent
                                          ? accentBorder
                                          : c.border,
                                )}
                            >
                                <div className="mb-1.5 flex items-center justify-between">
                                    <span className="text-[9px] font-medium">{t.name}</span>
                                    {t.featured && (
                                        <span
                                            className={cn(
                                                'text-[6.5px] font-medium tracking-wide uppercase',
                                                c.muted,
                                            )}
                                        >
                                            Popular
                                        </span>
                                    )}
                                </div>
                                <div className="mb-0.5 flex items-baseline gap-0.5">
                                    <span className="text-[16px] font-medium tracking-tight transition-all">
                                        ${displayPrice}
                                    </span>
                                    <span className={cn('text-[8px]', c.muted)}>/mo</span>
                                </div>
                                <span className={cn('mb-2 text-[7px]', c.faint)}>{t.sub}</span>
                                <ul className="mb-2.5 flex-1 space-y-1">
                                    {t.feats.map((f) => (
                                        <li
                                            key={f}
                                            className={cn(
                                                'flex items-center gap-1 text-[7.5px]',
                                                c.muted,
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    'h-0.5 w-0.5 rounded-full',
                                                    isDark ? 'bg-neutral-500' : 'bg-neutral-400',
                                                )}
                                            />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    className={cn(
                                        'w-full rounded-full py-1 text-[7.5px] font-medium',
                                        t.featured
                                            ? cn(c.solidBg, c.solidText, c.solidHover)
                                            : cn('border', c.border, c.muted),
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
    const c = {
        bg: isDark ? 'bg-neutral-950' : 'bg-white',
        text: isDark ? 'text-neutral-100' : 'text-neutral-900',
        muted: isDark ? 'text-neutral-400' : 'text-neutral-500',
        faint: isDark ? 'text-neutral-500' : 'text-neutral-400',
        border: isDark ? 'border-neutral-800' : 'border-neutral-200',
        panel: isDark ? 'bg-neutral-900' : 'bg-neutral-50',
        card: isDark ? 'bg-neutral-900' : 'bg-white',
        solidBg: isDark ? 'bg-neutral-100' : 'bg-neutral-900',
        solidText: isDark ? 'text-neutral-900' : 'text-white',
        strongBorder: isDark ? 'border-neutral-100' : 'border-neutral-900',
    };
    return (
        <div
            className={cn(
                'relative flex h-116 w-50 flex-col overflow-hidden border',
                c.bg,
                c.text,
                c.border,
            )}
        >
            {/* Nav */}
            <div
                className={cn(
                    'flex h-7 shrink-0 items-center justify-between border-b px-2.5',
                    c.border,
                )}
            >
                <div className="flex items-center gap-1">
                    <div className={cn('h-2.5 w-2.5 rounded-sm', c.solidBg)} />
                    <span className="text-[7px] font-medium tracking-tight">Villainterest</span>
                </div>
                <div className="flex flex-col gap-[2px]">
                    <span
                        className={cn(
                            'block h-px w-3',
                            isDark ? 'bg-neutral-400' : 'bg-neutral-600',
                        )}
                    />
                    <span
                        className={cn(
                            'block h-px w-3',
                            isDark ? 'bg-neutral-400' : 'bg-neutral-600',
                        )}
                    />
                </div>
            </div>

            {/* Hero */}
            <div className="flex flex-col items-center px-3 pt-5 pb-4">
                <h1 className="mb-1.5 text-center text-[14px] leading-[1.1] font-medium tracking-[-0.02em]">
                    {'The lair builder '}
                    <span className={cn('font-normal', c.muted)}>for masterminds</span>
                </h1>
                <p className={cn('mb-2.5 px-2 text-center text-[7px] leading-snug', c.muted)}>
                    Plot, build, deploy with AI.
                </p>
                <button
                    className={cn(
                        'rounded-full px-2.5 py-1 text-[7px] font-medium',
                        c.solidBg,
                        c.solidText,
                    )}
                >
                    Start scheming
                </button>
            </div>

            {/* Logo strip */}
            <div
                className={cn(
                    'flex shrink-0 items-center justify-around border-y py-1.5',
                    c.border,
                )}
            >
                {LOGO_WORDS.slice(0, 3).map((n) => (
                    <span
                        key={n}
                        className={cn('text-[6.5px] font-medium tracking-[0.1em]', c.faint)}
                    >
                        {n}
                    </span>
                ))}
            </div>

            {/* Pricing tiers stacked */}
            <div
                className={cn(
                    'flex flex-1 flex-col gap-1.5 border-t px-2 py-2.5',
                    c.border,
                    c.panel,
                )}
            >
                <div className="text-[7px] font-medium tracking-tight">Pricing</div>
                {TIERS.map((t) => (
                    <div
                        key={t.name}
                        className={cn(
                            'flex items-center justify-between rounded-md border px-1.5 py-1.5',
                            c.card,
                            t.featured ? c.strongBorder : c.border,
                        )}
                    >
                        <div className="flex flex-col">
                            <span className="text-[7px] font-medium">{t.name}</span>
                            <span className={cn('text-[6px]', c.faint)}>{t.sub}</span>
                        </div>
                        <div className="text-right">
                            <span className="text-[9px] font-medium">${t.price}</span>
                            <span className={cn('text-[6px]', c.muted)}>/mo</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Mobile tab bar */}
            <div
                className={cn(
                    'absolute right-0 bottom-0 left-0 z-10 flex h-7 items-center justify-around border-t px-2',
                    c.border,
                    c.card,
                )}
            >
                {['◆', '○', '+', '⌘', '☰'].map((g, i) => (
                    <span key={i} className={cn('text-[10px]', i === 0 ? c.text : c.faint)}>
                        {g}
                    </span>
                ))}
            </div>
        </div>
    );
}
