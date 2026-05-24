'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { APP_NAME } from '@weblab/constants';

import { vujahdayScript } from '@/app/fonts';
import { AiChatPreviewBlock } from './feature-blocks/ai-chat-preview-block';
import { BrandComplianceBlock } from './feature-blocks/brand-compliance';
import { ComponentsBlock } from './feature-blocks/components';
import { DirectEditingBlock } from './feature-blocks/direct-editing';
import { LayersBlock } from './feature-blocks/layers';
import { RevisionHistory } from './feature-blocks/revision-history';

function useOperatingSystem() {
    const [os, setOs] = useState<'mac' | 'windows' | 'linux' | 'unknown'>('unknown');

    useEffect(() => {
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('mac')) setOs('mac');
        else if (userAgent.includes('win')) setOs('windows');
        else if (userAgent.includes('linux')) setOs('linux');
        else setOs('unknown');
    }, []);

    return os;
}

export function WhatCanWeblabDoSection() {
    const tMore = useTranslations('landing.andSoMuchMore');
    const os = useOperatingSystem();

    const shortcutLetters = ['Z', 'X', 'C', 'V', 'D', 'G', 'A', 'S'];
    const [shortcutLetterIdx, setShortcutLetterIdx] = useState(0);
    const [isShortcutAnimating, setIsShortcutAnimating] = useState(false);

    const getKeyboardShortcut = () => {
        const currentLetter = shortcutLetters[shortcutLetterIdx];
        switch (os) {
            case 'mac':
                return `CMD+${currentLetter}`;
            case 'windows':
            case 'linux':
                return `Ctrl+${currentLetter}`;
            default:
                return `CMD/CTRL+${currentLetter}`;
        }
    };

    useEffect(() => {
        const shortcutInterval = setInterval(() => {
            setIsShortcutAnimating(true);
            setTimeout(() => {
                setShortcutLetterIdx((prev) => (prev + 1) % shortcutLetters.length);
                setIsShortcutAnimating(false);
            }, 150);
        }, 2000);
        return () => clearInterval(shortcutInterval);
    }, [shortcutLetters.length]);

    return (
        <>
            <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32">
                {/* Heading */}
                <div className="mb-16 sm:mb-24">
                    <h2 className="heading-style-h3 text-foreground-primary">
                        <span
                            className={`${vujahdayScript.className} large:text-6xl text-5xl not-italic sm:text-6xl`}
                        >
                            Design
                        </span>
                        {', '}
                        <span className="font-mono">Code</span>
                        {' & '}
                        <span className="animate-shimmer bg-gradient-to-l from-white/20 via-white/90 to-white/20 bg-[length:200%_100%] bg-clip-text text-transparent drop-shadow-[0_0_14px_rgba(255,255,255,1)] filter">
                            AI
                        </span>
                        {','}
                        <br />
                        {'Design, Side-by-side'}
                    </h2>
                </div>

                {/* Feature blocks — each is a 2-col grid (visual left, text right) */}
                <div className="flex flex-col gap-20 sm:gap-28">
                    <DirectEditingBlock />
                    <AiChatPreviewBlock />
                    <ComponentsBlock />
                    <BrandComplianceBlock />
                    <RevisionHistory />
                    <LayersBlock />
                </div>
            </div>

            {/* And so much more grid */}
            <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32">
                <h2 className="heading-style-h2 text-foreground-primary mb-12 text-right sm:mb-20">
                    {tMore('titleLine1')}
                    <br />
                    {tMore('titleLine2')}
                </h2>
                <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 sm:gap-x-16 sm:gap-y-20 md:grid-cols-3">
                    <div>
                        <div className="text-foreground-primary text-regularPlus mb-2 text-balance">
                            {tMore('worksWithCodebase.title')}
                        </div>
                        <div className="text-foreground-secondary text-regular text-balance">
                            {tMore('worksWithCodebase.body')}
                        </div>
                    </div>
                    <div>
                        <div className="text-foreground-primary text-regularPlus mb-2 text-balance">
                            {tMore('builtForTeams.title')}
                        </div>
                        <div className="text-foreground-secondary text-regular text-balance">
                            {tMore('builtForTeams.body')}
                        </div>
                    </div>
                    <div>
                        <div className="text-foreground-primary text-regularPlus mb-2 text-balance">
                            {tMore('githubIntegration.title')}
                        </div>
                        <div className="text-foreground-secondary text-regular text-balance">
                            {tMore('githubIntegration.body')}
                        </div>
                    </div>
                    <div>
                        <div className="text-foreground-primary text-regularPlus mb-2 text-balance">
                            {tMore('shipPrs.title')}
                        </div>
                        <div className="text-foreground-secondary text-regular text-balance">
                            {tMore('shipPrs.body')}
                        </div>
                    </div>
                    <div>
                        <div className="text-foreground-primary text-regularPlus mb-2 text-balance">
                            {tMore('shortcuts.title')}
                        </div>
                        <div className="text-foreground-secondary text-regular text-balance">
                            {tMore('shortcuts.bodyPrefix')}{' '}
                            <span
                                className={`inline-block transition-all duration-250 ${isShortcutAnimating ? '-translate-x-1 opacity-50 blur-sm' : 'blur-0 translate-x-0 opacity-100'}`}
                            >
                                {getKeyboardShortcut()}
                            </span>{' '}
                            {tMore('shortcuts.bodySuffix')}
                        </div>
                    </div>
                    <div>
                        <div className="text-foreground-primary text-regularPlus mb-2 text-balance">
                            {tMore('reference.title')}
                        </div>
                        <div className="text-foreground-secondary text-regular text-balance">
                            {tMore('reference.body')}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
