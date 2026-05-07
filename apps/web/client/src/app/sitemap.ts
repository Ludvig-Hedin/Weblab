import type { MetadataRoute } from 'next';

import { APP_DOMAIN } from '@weblab/constants';

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = `https://${APP_DOMAIN}`;

    return [
        // Main Pages
        {
            url: baseUrl,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'weekly',
            priority: 1,
        },
        {
            url: `${baseUrl}/pricing`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/about`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/faq`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/site-map`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'monthly',
            priority: 0.3,
        },

        // Features
        {
            url: `${baseUrl}/features`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'weekly',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/features/ai`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/features/ai-for-frontend`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/features/builder`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/features/prototype`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'weekly',
            priority: 0.8,
        },

        // Workflows
        {
            url: `${baseUrl}/workflows`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/workflows/claude-code`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/workflows/vibe-coding`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'weekly',
            priority: 0.8,
        },

        // Comparisons
        {
            url: `${baseUrl}/compare`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'weekly',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/compare/lovable`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/compare/bolt`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/compare/v0`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/compare/webflow`,
            lastModified: new Date('2026-05-05'),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/compare/framer`,
            lastModified: new Date('2026-05-04'),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/compare/replit`,
            lastModified: new Date('2026-05-03'),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/compare/claude-code`,
            lastModified: new Date('2026-05-02'),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/compare/emergent`,
            lastModified: new Date('2026-05-01'),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/compare/wix`,
            lastModified: new Date('2026-04-30'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/compare/one-com`,
            lastModified: new Date('2026-04-29'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/compare/onlook`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },

        // Blog
        {
            url: `${baseUrl}/blog`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/blog/best-visual-editor-react-2026`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/blog/best-website-builder-2026`,
            lastModified: new Date('2026-05-06'),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/blog/weblab-vs-webflow`,
            lastModified: new Date('2026-05-05'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/blog/weblab-vs-framer`,
            lastModified: new Date('2026-05-04'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/blog/weblab-vs-replit`,
            lastModified: new Date('2026-05-03'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/blog/weblab-vs-claude-code`,
            lastModified: new Date('2026-05-02'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/blog/weblab-vs-emergent`,
            lastModified: new Date('2026-05-01'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/blog/weblab-vs-wix`,
            lastModified: new Date('2026-04-30'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/blog/weblab-vs-one-com`,
            lastModified: new Date('2026-04-29'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/blog/best-ai-design-tools-2026`,
            lastModified: new Date('2026-04-28'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },

        // Legal
        {
            url: `${baseUrl}/terms-of-service`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: `${baseUrl}/privacy-policy`,
            lastModified: new Date('2026-05-07'),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
    ];
}
