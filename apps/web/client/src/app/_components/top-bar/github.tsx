'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

const DEFAULT_STAR_COUNT = 22000;
const DEFAULT_CONTRIBUTORS_COUNT = 90;

const formatStarCount = (count: number): string => {
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}k`.replace('.0k', 'k');
    }
    return count.toString();
};

export function useGitHubStats() {
    const [raw, setRaw] = useState<number | null>(DEFAULT_STAR_COUNT);
    const [formatted, setFormatted] = useState<string>(formatStarCount(DEFAULT_STAR_COUNT));
    const [contributors, setContributors] = useState<number>(DEFAULT_CONTRIBUTORS_COUNT);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // Stars
                const repoResponse = await fetch(
                    'https://api.github.com/repos/Ludvig-Hedin/Weblab',
                );
                const repoData = await repoResponse.json();
                setRaw(repoData.stargazers_count);
                setFormatted(formatStarCount(repoData.stargazers_count));

                // Contributors (use the Link header for pagination)
                const contribResponse = await fetch(
                    'https://api.github.com/repos/Ludvig-Hedin/Weblab/contributors?per_page=1&anon=true',
                );
                const linkHeader = contribResponse.headers.get('Link');
                if (linkHeader) {
                    const match = /&page=(\d+)>; rel="last"/.exec(linkHeader);
                    if (match) {
                        setContributors(Number(match[1]));
                    }
                } else {
                    // fallback: count the single returned contributor
                    const contribData = await contribResponse.json();
                    setContributors(
                        Array.isArray(contribData)
                            ? contribData.length
                            : DEFAULT_CONTRIBUTORS_COUNT,
                    );
                }
            } catch (error) {
                console.error('Failed to fetch GitHub stats:', error);
                setRaw(DEFAULT_STAR_COUNT);
                setFormatted(formatStarCount(DEFAULT_STAR_COUNT));
                setContributors(DEFAULT_CONTRIBUTORS_COUNT);
            }
        };
        fetchStats();
    }, []);

    return { raw, formatted, contributors };
}

export function GitHubButton() {
    const { formatted } = useGitHubStats();
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
