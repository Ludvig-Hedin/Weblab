import { APP_DOMAIN } from '@weblab/constants';

import { env } from '@/env';
import { getAllPosts } from '@/lib/blog';
import { CHANGELOG_ENTRIES } from '@/lib/changelog-entries';

const siteUrl =
    env.NODE_ENV === 'production' && env.NEXT_PUBLIC_SITE_URL.startsWith('http://localhost')
        ? `https://${APP_DOMAIN}`
        : env.NEXT_PUBLIC_SITE_URL;
const BASE_URL = siteUrl.replace(/\/$/, '');

type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

interface SitemapEntry {
    path: string;
    lastModified: string;
    changeFrequency: ChangeFreq;
    priority: number;
}

const mostRecentChangelogDate = CHANGELOG_ENTRIES[0]?.date ?? '2026-05-09';

const STATIC_ROUTES: SitemapEntry[] = [
    { path: '', lastModified: '2026-06-05', changeFrequency: 'weekly', priority: 1.0 },
    {
        path: '/website-builder',
        lastModified: '2026-06-05',
        changeFrequency: 'weekly',
        priority: 0.9,
    },
    {
        path: '/visual-site-builder',
        lastModified: '2026-06-05',
        changeFrequency: 'weekly',
        priority: 0.9,
    },
    {
        path: '/ai-website-builder',
        lastModified: '2026-06-05',
        changeFrequency: 'weekly',
        priority: 0.9,
    },
    { path: '/pricing', lastModified: '2026-05-09', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/about', lastModified: '2026-05-09', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/faq', lastModified: '2026-05-09', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/download', lastModified: '2026-05-09', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/security', lastModified: '2026-06-21', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/see-a-demo', lastModified: '2026-06-21', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/site-map', lastModified: '2026-05-09', changeFrequency: 'monthly', priority: 0.3 },
    {
        path: '/changelog',
        lastModified: mostRecentChangelogDate,
        changeFrequency: 'weekly',
        priority: 0.6,
    },
    { path: '/features', lastModified: '2026-05-09', changeFrequency: 'weekly', priority: 0.9 },
    { path: '/features/ai', lastModified: '2026-05-09', changeFrequency: 'weekly', priority: 0.85 },
    {
        path: '/features/ai-for-frontend',
        lastModified: '2026-05-09',
        changeFrequency: 'weekly',
        priority: 0.85,
    },
    {
        path: '/features/builder',
        lastModified: '2026-05-09',
        changeFrequency: 'weekly',
        priority: 0.9,
    },
    {
        path: '/features/prototype',
        lastModified: '2026-05-09',
        changeFrequency: 'weekly',
        priority: 0.8,
    },
    {
        path: '/features/blocks',
        lastModified: '2026-06-21',
        changeFrequency: 'weekly',
        priority: 0.8,
    },
    { path: '/workflows', lastModified: '2026-05-09', changeFrequency: 'weekly', priority: 0.8 },
    {
        path: '/workflows/claude-code',
        lastModified: '2026-05-09',
        changeFrequency: 'weekly',
        priority: 0.8,
    },
    {
        path: '/workflows/vibe-coding',
        lastModified: '2026-05-09',
        changeFrequency: 'weekly',
        priority: 0.8,
    },
    {
        path: '/workflows/codex',
        lastModified: '2026-06-21',
        changeFrequency: 'weekly',
        priority: 0.8,
    },
    { path: '/compare', lastModified: '2026-05-09', changeFrequency: 'weekly', priority: 0.9 },
    {
        path: '/compare/lovable',
        lastModified: '2026-05-09',
        changeFrequency: 'monthly',
        priority: 0.85,
    },
    {
        path: '/compare/bolt',
        lastModified: '2026-05-09',
        changeFrequency: 'monthly',
        priority: 0.85,
    },
    { path: '/compare/v0', lastModified: '2026-05-09', changeFrequency: 'monthly', priority: 0.85 },
    {
        path: '/compare/webflow',
        lastModified: '2026-05-09',
        changeFrequency: 'monthly',
        priority: 0.85,
    },
    {
        path: '/compare/framer',
        lastModified: '2026-05-09',
        changeFrequency: 'monthly',
        priority: 0.85,
    },
    {
        path: '/compare/replit',
        lastModified: '2026-05-09',
        changeFrequency: 'monthly',
        priority: 0.8,
    },
    {
        path: '/compare/claude-code',
        lastModified: '2026-05-09',
        changeFrequency: 'monthly',
        priority: 0.8,
    },
    {
        path: '/compare/emergent',
        lastModified: '2026-05-09',
        changeFrequency: 'monthly',
        priority: 0.8,
    },
    {
        path: '/compare/wix',
        lastModified: '2026-05-09',
        changeFrequency: 'monthly',
        priority: 0.75,
    },
    {
        path: '/compare/one-com',
        lastModified: '2026-05-09',
        changeFrequency: 'monthly',
        priority: 0.75,
    },
    {
        path: '/compare/onlook',
        lastModified: '2026-05-09',
        changeFrequency: 'monthly',
        priority: 0.7,
    },
    {
        path: '/terms-of-service',
        lastModified: '2026-05-09',
        changeFrequency: 'yearly',
        priority: 0.3,
    },
    {
        path: '/privacy-policy',
        lastModified: '2026-05-09',
        changeFrequency: 'yearly',
        priority: 0.3,
    },
];

function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function getEntries(): SitemapEntry[] {
    const blogPosts = getAllPosts();
    const blogEntries: SitemapEntry[] = [
        {
            path: '/blog',
            lastModified: blogPosts[0]?.frontmatter.date ?? '2026-05-09',
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        ...blogPosts.map((post) => ({
            path: `/blog/${post.slug}`,
            lastModified: post.frontmatter.updated ?? post.frontmatter.date,
            changeFrequency: 'monthly' as ChangeFreq,
            priority: 0.7,
        })),
    ];

    return [...STATIC_ROUTES, ...blogEntries];
}

function renderSitemapXml(entries: SitemapEntry[]): string {
    const urls = entries
        .map(({ path, lastModified, changeFrequency, priority }) => {
            const loc = `${BASE_URL}${path}`;
            return [
                '  <url>',
                `    <loc>${escapeXml(loc)}</loc>`,
                `    <lastmod>${escapeXml(lastModified)}</lastmod>`,
                `    <changefreq>${changeFrequency}</changefreq>`,
                `    <priority>${priority.toFixed(2)}</priority>`,
                '  </url>',
            ].join('\n');
        })
        .join('\n');

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        urls,
        '</urlset>',
        '',
    ].join('\n');
}

export function GET(): Response {
    return new Response(renderSitemapXml(getEntries()), {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
        },
    });
}
