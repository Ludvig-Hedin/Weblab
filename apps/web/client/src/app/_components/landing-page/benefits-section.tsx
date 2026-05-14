'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import { AiChatInteractive } from '../shared/mockups/ai-chat-interactive';
import { DirectEditingInteractive } from '../shared/mockups/direct-editing-interactive';
import { TailwindColorEditorMockup } from '../shared/mockups/tailwind-color-editor';

const GUARDRAIL_FEATURES = [
    'autoLayout',
    'borders',
    'margins',
    'imageBackgrounds',
    'typography',
    'padding',
    'gradients',
    'cornerRadii',
] as const;

export function BenefitsSection() {
    const t = useTranslations('landing.benefits') as (key: string) => string;

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32 lg:py-64">
            <div className="space-y-24">
                <div className="grid grid-cols-1 items-center gap-16 md:grid-cols-2">
                    <div className="order-2 flex flex-col lg:order-1">
                        <h2 className="heading-style-h6 text-foreground-secondary mb-4">
                            {t('aiContext.eyebrow')}
                        </h2>
                        <p className="heading-style-h4 text-foreground-primary mb-6">
                            {t('aiContext.headline')}
                        </p>
                        <p className="text-foreground-secondary text-regular mb-8 max-w-xl text-balance">
                            {t('aiContext.body')}
                        </p>
                    </div>
                    <div className="order-1 lg:order-2">
                        <AiChatInteractive />
                    </div>
                </div>

                <div className="grid grid-cols-1 items-center gap-16 md:grid-cols-2">
                    <div className="order-1">
                        <DirectEditingInteractive />
                    </div>
                    <div className="order-2 flex flex-col">
                        <h2 className="heading-style-h6 text-foreground-secondary mb-4">
                            {t('canvas.eyebrow')}
                        </h2>
                        <p className="heading-style-h4 text-foreground-primary mb-6">
                            {t('canvas.headline')}
                        </p>
                        <p className="text-foreground-secondary text-regular mb-8 max-w-xl text-balance">
                            {t('canvas.body')}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 items-center gap-16 md:grid-cols-2">
                    <div className="order-2 flex flex-col lg:order-1">
                        <h2 className="heading-style-h6 text-foreground-secondary mb-4">
                            {t('guardrails.eyebrow')}
                        </h2>
                        <p className="heading-style-h4 text-foreground-primary mb-6">
                            {t('guardrails.headline')}
                        </p>
                        <p className="text-foreground-secondary text-regular mb-6 max-w-xl text-balance">
                            {t('guardrails.body')}
                        </p>
                        <div className="text-foreground-secondary text-regular mb-8 grid grid-cols-2 gap-8">
                            <div className="flex flex-col gap-4">
                                {GUARDRAIL_FEATURES.slice(0, 4).map((key) => (
                                    <div key={key} className="flex items-center gap-2">
                                        <Icons.CheckCircled className="h-5 w-5" />
                                        <span>{t(`guardrails.features.${key}`)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-col gap-4">
                                {GUARDRAIL_FEATURES.slice(4).map((key) => (
                                    <div key={key} className="flex items-center gap-2">
                                        <Icons.CheckCircled className="h-5 w-5" />
                                        <span>{t(`guardrails.features.${key}`)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="order-1 h-100 w-full rounded-lg lg:order-2">
                        <TailwindColorEditorMockup />
                    </div>
                </div>
            </div>
        </div>
    );
}
