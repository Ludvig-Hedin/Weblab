'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import {
    ClaudeIcon,
    DeepSeekIcon,
    GeminiIcon,
    KimiIcon,
    OpenAIIcon,
} from './provider-icons';

interface ModelOption {
    name: string;
    descriptionKey: 'gpt' | 'sonnet' | 'opus' | 'gemini' | 'deepseek' | 'kimi';
    icon: React.ReactNode;
    selected?: boolean;
}

const MODELS: ModelOption[] = [
    {
        name: 'GPT-5.5',
        descriptionKey: 'gpt',
        icon: <OpenAIIcon className="text-foreground-primary h-4 w-4" />,
        selected: true,
    },
    {
        name: 'Claude Sonnet 4.6',
        descriptionKey: 'sonnet',
        icon: <ClaudeIcon className="h-4 w-4" />,
    },
    {
        name: 'Claude Opus 4.7',
        descriptionKey: 'opus',
        icon: <ClaudeIcon className="h-4 w-4" />,
    },
    {
        name: 'Gemini 3.1 Pro',
        descriptionKey: 'gemini',
        icon: <GeminiIcon className="h-4 w-4" />,
    },
    {
        name: 'DeepSeek V4 Pro',
        descriptionKey: 'deepseek',
        icon: <DeepSeekIcon className="h-4 w-4" />,
    },
    {
        name: 'Kimi K2.6',
        descriptionKey: 'kimi',
        icon: <KimiIcon className="h-4 w-4" />,
    },
];

function ModelPicker() {
    const t = useTranslations('landing.modelAgnostic.models');
    return (
        <div className="bg-background-chrome/85 border-border rounded-2xl border p-2 shadow-2xl backdrop-blur-xl">
            {MODELS.map((m) => (
                <div
                    key={m.name}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {m.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="text-small text-foreground-primary font-medium">
                            {m.name}
                        </div>
                        <div className="text-mini text-foreground-tertiary truncate">
                            {t(m.descriptionKey)}
                        </div>
                    </div>
                    {m.selected && (
                        <Icons.Check className="text-foreground-primary h-4 w-4 shrink-0" />
                    )}
                </div>
            ))}
        </div>
    );
}

function Headline() {
    const t = useTranslations('landing.modelAgnostic');
    return (
        <div className="max-w-md">
            <div className="text-mini font-mono tracking-wider text-white/70 uppercase">
                {t('eyebrow')}
            </div>
            <h2 className="heading-style-h3 mt-3 text-balance text-white">
                {t('headline')}
            </h2>
        </div>
    );
}

export function ModelAgnosticSection() {
    return (
        <section
            className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32"
            id="model-agnostic"
        >
            <div className="border-foreground-primary/10 relative overflow-hidden rounded-3xl border">
                {/* Background image */}
                <div className="absolute inset-0">
                    <Image
                        src="/assets/dunes-create-dark.png"
                        alt=""
                        fill
                        sizes="(max-width: 1152px) 100vw, 1152px"
                        className="object-cover"
                        priority={false}
                    />
                    {/* Subtle warmth + readability */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_35%,rgba(255,180,120,0.18),transparent_55%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_65%,rgba(140,160,255,0.16),transparent_55%)]" />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgba(0,0,0,0.45)_100%)]" />
                </div>

                {/* Mobile: stacked column */}
                <div className="relative flex flex-col gap-10 px-6 py-12 md:hidden">
                    <Headline />
                    <ModelPicker />
                </div>

                {/* Desktop: overlay layout */}
                <div className="relative hidden aspect-[16/7] w-full md:block">
                    <div className="absolute top-1/2 left-12 w-[22rem] max-w-[88%] -translate-y-1/2 lg:left-16">
                        <ModelPicker />
                    </div>
                    <div className="absolute top-1/2 right-12 max-w-md -translate-y-1/2 lg:right-16">
                        <Headline />
                    </div>
                </div>
            </div>
        </section>
    );
}
