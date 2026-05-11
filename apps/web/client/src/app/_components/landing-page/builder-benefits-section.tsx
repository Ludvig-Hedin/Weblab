'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import { AiChatInteractive } from '../shared/mockups/ai-chat-interactive';
import { ComponentsMockup } from '../shared/mockups/components-mockup';
import { TailwindColorEditorMockup } from '../shared/mockups/tailwind-color-editor';

const AI_ASSISTED_FEATURES = [
    'componentGeneration',
    'stateManagement',
    'eventHandlers',
    'apiIntegration',
    'typescriptSupport',
    'customHooks',
    'formValidation',
    'responsiveDesign',
] as const;

export function BuilderBenefitsSection() {
    const t = useTranslations('landing.builderBenefits') as (key: string) => string;

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32 lg:py-64">
            <div className="space-y-24">
                <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
                    <div className="order-2 flex flex-col lg:order-1">
                        <h2 className="heading-style-h6 text-foreground-secondary mb-4">
                            {t('visualReact.eyebrow')}
                        </h2>
                        <p className="heading-style-h4 text-foreground-primary mb-6">
                            {t('visualReact.headline')}
                        </p>
                        <p className="text-foreground-secondary text-regular mb-8 max-w-xl text-balance">
                            {t('visualReact.body')}
                        </p>
                    </div>
                    <div className="order-1 h-100 w-full rounded-lg lg:order-2">
                        <TailwindColorEditorMockup />
                    </div>
                </div>

                <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
                    <div className="order-2 flex flex-col lg:order-1">
                        <h2 className="heading-style-h6 text-foreground-secondary mb-4">
                            {t('noCode.eyebrow')}
                        </h2>
                        <p className="heading-style-h4 text-foreground-primary mb-6">
                            {t('noCode.headline')}
                        </p>
                        <p className="text-foreground-secondary text-regular mb-8 max-w-xl text-balance">
                            {t('noCode.body')}
                        </p>
                    </div>
                    <div className="order-1 h-100 w-full rounded-lg lg:order-2">
                        <ComponentsMockup />
                    </div>
                </div>

                <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
                    <div className="order-2 flex flex-col lg:order-1">
                        <h2 className="heading-style-h6 text-foreground-secondary mb-4">
                            {t('aiAssisted.eyebrow')}
                        </h2>
                        <p className="heading-style-h4 text-foreground-primary mb-6">
                            {t('aiAssisted.headline')}
                        </p>
                        <p className="text-foreground-secondary text-regular mb-6 max-w-xl text-balance">
                            {t('aiAssisted.body')}
                        </p>
                        <div className="text-foreground-secondary text-regular mb-8 grid grid-cols-2 gap-8">
                            <div className="flex flex-col gap-4">
                                {AI_ASSISTED_FEATURES.slice(0, 4).map((key) => (
                                    <div key={key} className="flex items-center gap-2">
                                        <Icons.CheckCircled className="h-5 w-5" />
                                        <span>{t(`aiAssisted.features.${key}`)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-col gap-4">
                                {AI_ASSISTED_FEATURES.slice(4).map((key) => (
                                    <div key={key} className="flex items-center gap-2">
                                        <Icons.CheckCircled className="h-5 w-5" />
                                        <span>{t(`aiAssisted.features.${key}`)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="order-1 lg:order-2">
                        <AiChatInteractive />
                    </div>
                </div>
            </div>
        </div>
    );
}
