'use client';

import React from 'react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';
import { NodeIcon } from '@weblab/ui/node-icon';
import { cn } from '@weblab/ui/utils';

import { vujahdayScript } from '@/app/fonts';
import { AiChatInteractive } from '../shared/mockups/ai-chat-interactive';
import { DirectEditingInteractive } from '../shared/mockups/direct-editing-interactive';

const REVEAL = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

interface FeatureCardProps {
    visual: React.ReactNode;
    subtitle: string;
    title: React.ReactNode;
    paragraph: string;
    icon: React.ReactNode;
    reverse?: boolean;
}

function FeatureCard({ visual, subtitle, title, paragraph, icon, reverse }: FeatureCardProps) {
    return (
        <motion.div
            initial={REVEAL.initial}
            whileInView={REVEAL.whileInView}
            viewport={REVEAL.viewport}
            transition={REVEAL.transition}
            className=""
        >
            <div
                className={cn(
                    'grid grid-cols-1 items-stretch md:grid-cols-2',
                    reverse && 'md:[&>*:first-child]:order-2',
                )}
            >
                <div className="bg-background-canvas border-border flex aspect-[4/3] w-full max-w-full items-center justify-center rounded-xl border-b p-8 md:border-r md:border-b-0 md:p-12">
                    <div className="flex w-full items-center justify-center">{visual}</div>
                </div>
                <div className="flex flex-col justify-center gap-4 p-8 md:p-14">
                    <div className="text-foreground-secondary flex items-center gap-2">
                        {icon}
                        <span className="text-[11px] font-medium tracking-[0.15em] uppercase">
                            {subtitle}
                        </span>
                    </div>
                    <h3 className="heading-style-h3 text-foreground-primary">{title}</h3>
                    <p className="text-foreground-secondary max-w-md text-base leading-relaxed text-balance">
                        {paragraph}
                    </p>
                </div>
            </div>
        </motion.div>
    );
}

function ComponentsVisual() {
    const items = [
        { label: 'Button', icon: 'Component' as const },
        { label: 'Card', icon: 'Component' as const },
        { label: 'Hero', icon: 'Component' as const },
        { label: 'Nav', icon: 'Component' as const },
        { label: 'Pricing', icon: 'Component' as const },
        { label: 'Footer', icon: 'Component' as const },
    ];
    return (
        <div className="grid w-full max-w-sm grid-cols-3 gap-3">
            {items.map((it) => (
                <div
                    key={it.label}
                    className="bg-background-secondary border-border hover:bg-background-secondary flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-[0.5px] p-3 transition-colors"
                >
                    <Icons.Component className="text-foreground-secondary h-6 w-6" />
                    <span className="text-foreground text-xs">{it.label}</span>
                </div>
            ))}
        </div>
    );
}

function BrandVisual() {
    const t = useTranslations('landing.whatCanWeblabDoV2.brandVisual');
    const palette = [
        {
            nameKey: 'background',
            shades: ['bg-background', 'bg-background-secondary', 'bg-background-tertiary'],
        },
        {
            nameKey: 'foreground',
            shades: ['bg-foreground', 'bg-foreground-secondary', 'bg-foreground-tertiary'],
        },
        {
            nameKey: 'brand',
            shades: ['bg-foreground-brand', 'bg-foreground-brand/70', 'bg-foreground-brand/40'],
        },
    ] as const;
    return (
        <div className="bg-background-chrome border-border flex w-full max-w-sm flex-col gap-4 rounded-xl border p-5">
            <div className="text-foreground-tertiary text-[10px] font-medium tracking-wider uppercase">
                {t('tokens')}
            </div>
            {palette.map((row) => (
                <div key={row.nameKey} className="flex items-center justify-between gap-3">
                    <span className="text-foreground-secondary text-xs">{t(row.nameKey)}</span>
                    <div className="flex gap-1.5">
                        {row.shades.map((s) => (
                            <div
                                key={s}
                                className={cn('ring-border h-6 w-6 rounded-full ring-1', s)}
                            />
                        ))}
                    </div>
                </div>
            ))}
            <div className="border-border mt-2 flex items-center gap-2 border-t pt-3">
                <Icons.Check className="text-foreground-brand h-3.5 w-3.5" />
                <span className="text-foreground-secondary text-xs">{t('onBrand')}</span>
            </div>
        </div>
    );
}

function LayersVisual() {
    const t = useTranslations('landing.whatCanWeblabDoV2');
    const layers = [
        { name: 'Home Page', tag: 'DIV', level: 0 },
        { name: 'Top Navigation', tag: 'COMPONENT', level: 1 },
        { name: 'Hero', tag: 'COMPONENT', level: 1, selected: true },
        { name: 'Image Grid', tag: 'DIV', level: 1 },
        { name: 'Image Card 1', tag: 'COMPONENT', level: 2 },
        { name: 'Image Card 2', tag: 'COMPONENT', level: 2 },
        { name: 'Image Card 3', tag: 'COMPONENT', level: 2 },
        { name: 'Footer', tag: 'COMPONENT', level: 1 },
    ];
    return (
        <div className="w-full max-w-sm">
            <div className="border-border flex items-center justify-between border-b px-2 py-1.5">
                <span className="text-foreground text-xs font-medium">{t('layersTitle')}</span>
                <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3" />
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
                {layers.map((l) => (
                    <div
                        key={l.name}
                        className={cn(
                            'flex h-6 items-center rounded px-1.5 text-xs',
                            l.selected
                                ? 'bg-foreground-brand/90 text-white'
                                : l.tag === 'COMPONENT'
                                  ? 'text-purple-300'
                                  : 'text-foreground-secondary',
                        )}
                    >
                        <div style={{ width: `${l.level * 14}px` }} />
                        <NodeIcon iconClass="w-3 h-3 mr-1.5 shrink-0" tagName={l.tag} />
                        <span className="truncate">{l.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RevisionVisual() {
    const t = useTranslations('landing.whatCanWeblabDoV2');
    const versions = [
        { title: 'New typography and layout', who: 'Alessandro · 3h ago', active: true },
        { title: 'Save before publishing', who: 'Weblab · 10h ago' },
        { title: 'Added new background image', who: 'Sandra · 12h ago' },
        { title: 'Copy improvements and branding', who: 'Jonathan · 3d ago' },
    ];
    return (
        <div className="bg-background-chrome border-border w-full max-w-sm overflow-hidden rounded-xl border">
            <div className="border-border flex items-center gap-2 border-b px-4 py-3">
                <Icons.CounterClockwiseClock className="text-foreground-secondary h-4 w-4" />
                <span className="text-foreground text-xs font-medium">{t('revisionToday')}</span>
            </div>
            <div className="flex flex-col">
                {versions.map((v) => (
                    <div
                        key={v.title}
                        className={cn(
                            'border-border flex items-center justify-between border-b px-4 py-3 transition-colors last:border-b-0',
                            v.active
                                ? 'bg-background-secondary'
                                : 'hover:bg-background-secondary/60',
                        )}
                    >
                        <div className="flex flex-col gap-0.5">
                            <span className="text-foreground text-xs font-medium">{v.title}</span>
                            <span className="text-foreground-tertiary text-[11px]">{v.who}</span>
                        </div>
                        {v.active && (
                            <div className="bg-foreground-brand/20 text-foreground-brand rounded-full px-2 py-0.5 text-[10px] font-medium">
                                {t('revisionCurrent')}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

const FEATURE_KEYS = [
    'aiAssistant',
    'canvas',
    'components',
    'brand',
    'structure',
    'history',
] as const;

const FEATURE_ICONS: Record<(typeof FEATURE_KEYS)[number], React.ReactNode> = {
    aiAssistant: <Icons.Sparkles className="h-4 w-4" />,
    canvas: <Icons.DirectManipulation className="h-4 w-4" />,
    components: <Icons.Component className="h-4 w-4" />,
    brand: <Icons.Brand className="h-4 w-4" />,
    structure: <Icons.Layers className="h-4 w-4" />,
    history: <Icons.CounterClockwiseClock className="h-4 w-4" />,
};

const FEATURE_VISUALS: Record<(typeof FEATURE_KEYS)[number], React.ReactNode> = {
    aiAssistant: (
        <div className="w-full max-w-sm">
            <AiChatInteractive />
        </div>
    ),
    canvas: (
        <div className="w-full max-w-sm">
            <DirectEditingInteractive />
        </div>
    ),
    components: <ComponentsVisual />,
    brand: <BrandVisual />,
    structure: <LayersVisual />,
    history: <RevisionVisual />,
};

export function WhatCanWeblabDoSectionV2() {
    const t = useTranslations('landing.whatCanWeblabDoV2') as (key: string) => string;
    return (
        <section className="mx-auto w-full max-w-6xl px-4 py-32 md:px-8">
            <motion.div
                initial={REVEAL.initial}
                whileInView={REVEAL.whileInView}
                viewport={REVEAL.viewport}
                transition={REVEAL.transition}
                className="mb-20 flex flex-col items-start gap-4"
            >
                <h2 className="heading-style-h2 text-foreground-primary">
                    <span className="text-foreground-primary">{t('headingAi')}</span>{' '}
                    <span className="text-foreground-tertiary">•</span>{' '}
                    <span className="font-mono">{t('headingCode')}</span>{' '}
                    <span className="text-foreground-tertiary">•</span>{' '}
                    <span
                        className={`${vujahdayScript.className} text-5xl not-italic md:text-6xl lg:text-7xl`}
                    >
                        {t('headingDesign')}
                    </span>
                    <br />
                    {t('headingSideBySide')}
                </h2>
                <p className="text-foreground-secondary max-w-xl text-base leading-relaxed md:text-lg">
                    {t('subhead')}
                </p>
            </motion.div>
            <div className="flex flex-col gap-16">
                {FEATURE_KEYS.map((key, i) => (
                    <FeatureCard
                        key={key}
                        icon={FEATURE_ICONS[key]}
                        subtitle={t(`features.${key}.subtitle`)}
                        title={t(`features.${key}.title`)}
                        paragraph={t(`features.${key}.paragraph`)}
                        visual={FEATURE_VISUALS[key]}
                        reverse={i % 2 === 1}
                    />
                ))}
            </div>
        </section>
    );
}
