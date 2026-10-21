'use client';

import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

export function GitHubButton() {
    const t = useTranslations('nav');
    return (
        <a
            href="https://github.com/Ludvig-Hedin/Weblab"
            className="text-small flex items-center gap-1.5 hover:opacity-80"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('githubAria')}
        >
            <Icons.GitHubLogo className="h-5 w-5" />
        </a>
    );
}
