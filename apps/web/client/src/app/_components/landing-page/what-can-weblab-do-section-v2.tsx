'use client';

import React from 'react';
import { motion } from 'motion/react';

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
                <div className="bg-background-canvas rounded-xl border-border flex items-center justify-center border-b p-8 md:border-r md:border-b-0 md:p-12 aspect-4/3 w-full max-w-full">
                    <div className="flex w-full items-center justify-center">{visual}</div>
                </div>
                <div className="flex flex-col justify-center gap-4 p-8 md:p-14">
                    <div className="text-foreground-secondary flex items-center gap-2">
                        {icon}
                        <span className="text-[11px] font-medium tracking-[0.15em] uppercase">
                            {subtitle}
                        </span>
                    </div>
                    <h3 className="text-foreground-primary text-3xl leading-[1.1] font-light tracking-tight md:text-4xl">
                        {title}
                    </h3>
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
                    className="bg-background-secondary border border-border hover:bg-background-secondary flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-[0.5px] p-3 transition-colors"
                >
                    <Icons.Component className="text-foreground-secondary h-6 w-6" />
                    <span className="text-foreground text-xs">{it.label}</span>
                </div>
            ))}
        </div>
    );
}

function BrandVisual() {
    const palette = [
        {
            name: 'Background',
            shades: ['bg-background', 'bg-background-secondary', 'bg-background-tertiary'],
        },
        {
            name: 'Foreground',
            shades: ['bg-foreground', 'bg-foreground-secondary', 'bg-foreground-tertiary'],
        },
        {
            name: 'Brand',
            shades: ['bg-foreground-brand', 'bg-foreground-brand/70', 'bg-foreground-brand/40'],
        },
    ];
    return (
        <div className="bg-background-chrome border-border flex w-full max-w-sm flex-col gap-4 rounded-xl border p-5">
            <div className="text-foreground-tertiary text-[10px] font-medium tracking-wider uppercase">
                Tokens
            </div>
            {palette.map((row) => (
                <div key={row.name} className="flex items-center justify-between gap-3">
                    <span className="text-foreground-secondary text-xs">{row.name}</span>
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
                <span className="text-foreground-secondary text-xs">All proposals on-brand</span>
            </div>
        </div>
    );
}

function LayersVisual() {
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
                <span className="text-foreground text-xs font-medium">Layers</span>
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
                <span className="text-foreground text-xs font-medium">Today</span>
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
                                Current
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

const FEATURES: Omit<FeatureCardProps, 'reverse'>[] = [
    {
        icon: <Icons.Sparkles className="h-4 w-4" />,
        subtitle: 'AI Assistant',
        title: 'AI that understands context',
        paragraph:
            'Reference images, designs, and docs in chat. AI sees what you see — no more explaining from scratch.',
        visual: (
            <div className="w-full max-w-sm">
                <AiChatInteractive />
            </div>
        ),
    },
    {
        icon: <Icons.DirectManipulation className="h-4 w-4" />,
        subtitle: 'Canvas',
        title: 'Manipulate elements directly',
        paragraph:
            'Drag, resize, and arrange elements directly on the canvas. See changes appear in real code instantly.',
        visual: (
            <div className="w-full max-w-sm">
                <DirectEditingInteractive />
            </div>
        ),
    },
    {
        icon: <Icons.Component className="h-4 w-4" />,
        subtitle: 'Components',
        title: 'Your real components',
        paragraph:
            'Reuse your existing design system — buttons, cards, navs. Live components, not screenshots.',
        visual: <ComponentsVisual />,
    },
    {
        icon: <Icons.Brand className="h-4 w-4" />,
        subtitle: 'Brand',
        title: 'Design system guardrails',
        paragraph:
            'Your tokens stay your tokens. AI proposals respect your colors, typography, and spacing.',
        visual: <BrandVisual />,
    },
    {
        icon: <Icons.Layers className="h-4 w-4" />,
        subtitle: 'Structure',
        title: 'Navigate your code as layers',
        paragraph:
            'A live tree of your DOM. Click any node to jump to it on the canvas — no inspector hunting.',
        visual: <LayersVisual />,
    },
    {
        icon: <Icons.CounterClockwiseClock className="h-4 w-4" />,
        subtitle: 'History',
        title: 'Time travel for your designs',
        paragraph:
            'Every save is a version. Branch, restore, and compare without leaving the canvas.',
        visual: <RevisionVisual />,
    },
];

export function WhatCanWeblabDoSectionV2() {
    return (
        <section className="mx-auto w-full max-w-6xl px-4 py-32 md:px-8">
            <motion.div
                initial={REVEAL.initial}
                whileInView={REVEAL.whileInView}
                viewport={REVEAL.viewport}
                transition={REVEAL.transition}
                className="mb-20 flex flex-col items-start gap-4"
            >
                <h2 className="text-foreground-primary text-4xl leading-[1.05] font-light tracking-tight md:text-5xl lg:text-6xl">
                    <span className="text-foreground-primary">AI</span>{' '}
                    <span className="text-foreground-tertiary">•</span>{' '}
                    <span className="font-mono">Code</span>{' '}
                    <span className="text-foreground-tertiary">•</span>{' '}
                    <span
                        className={`${vujahdayScript.className} text-5xl not-italic md:text-6xl lg:text-7xl`}
                    >
                        Design
                    </span>
                    <br />
                    Side-by-side-by-side
                </h2>
                <p className="text-foreground-secondary max-w-xl text-base leading-relaxed md:text-lg">
                    Everything in one canvas. No tabs, no handoffs, no translation losses.
                </p>
            </motion.div>
            <div className="flex flex-col gap-16">
                {FEATURES.map((f, i) => (
                    <FeatureCard key={f.subtitle} {...f} reverse={i % 2 === 1} />
                ))}
            </div>
        </section>
    );
}
