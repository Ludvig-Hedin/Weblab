import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

const baseUrl = `https://${APP_DOMAIN}`;

export function absoluteUrl(path: string) {
    return new URL(path, baseUrl).toString();
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: item.name,
            item: absoluteUrl(item.path),
        })),
    };
}

const organizationDescription = `${APP_NAME} is an AI visual website builder for React and Next.js teams. Design with your real components on an infinite canvas, edit code visually, and ship pull requests instead of prototypes.`;

export const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${baseUrl}/#organization`,
    name: APP_NAME,
    legalName: APP_NAME,
    alternateName: ['Weblab.build', 'Weblab AI', 'Weblab Visual Builder'],
    url: baseUrl,
    logo: {
        '@type': 'ImageObject',
        url: absoluteUrl('/brand/symbol.png'),
        width: 512,
        height: 512,
    },
    image: absoluteUrl('/og-image.png'),
    description: organizationDescription,
    slogan: 'Design with real components. Ship pull requests, not prototypes.',
    foundingDate: '2024',
    founders: [
        {
            '@type': 'Person',
            name: 'Ludvig Hedin',
            jobTitle: 'Founder',
            url: 'https://www.linkedin.com/in/ludvig-hedin-058bba194/',
            sameAs: ['https://www.linkedin.com/in/ludvig-hedin-058bba194/'],
        },
    ],
    numberOfEmployees: {
        '@type': 'QuantitativeValue',
        value: 1,
    },
    address: {
        '@type': 'PostalAddress',
        addressCountry: 'SE',
    },
    contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'support@weblab.build',
        availableLanguage: ['English'],
    },
    sameAs: [
        'https://github.com/Ludvig-Hedin/Weblab',
        'https://www.linkedin.com/company/weblab/',
        'https://www.youtube.com/@weblab',
        'https://weblab.substack.com/',
    ],
};

export const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${baseUrl}/#website`,
    name: APP_NAME,
    alternateName: 'Weblab.build',
    url: baseUrl,
    description: organizationDescription,
    inLanguage: 'en',
    publisher: {
        '@id': `${baseUrl}/#organization`,
    },
    potentialAction: {
        '@type': 'SearchAction',
        target: {
            '@type': 'EntryPoint',
            urlTemplate: `${baseUrl}/blog?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
    },
};

export const softwareApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${baseUrl}/#software`,
    name: APP_NAME,
    alternateName: 'Weblab Visual Builder',
    applicationCategory: 'DeveloperApplication',
    applicationSubCategory: 'Website Builder',
    operatingSystem: 'Web, macOS, Windows, Linux',
    url: baseUrl,
    description: organizationDescription,
    image: absoluteUrl('/og-image.png'),
    screenshot: absoluteUrl('/og-image.png'),
    softwareVersion: '1.0',
    inLanguage: 'en',
    // AggregateOffer covers Free tier + Pro tiers shown on /pricing.
    // Enterprise tier excluded (custom pricing). Update lowPrice/highPrice/
    // offerCount when PRO_PRICES in packages/stripe/src/constants.ts changes.
    offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'USD',
        lowPrice: '0',
        highPrice: '3750',
        offerCount: 12,
        availability: 'https://schema.org/InStock',
        url: `${baseUrl}/pricing`,
    },
    featureList: [
        'AI visual website builder',
        'Visual editor for React and Next.js',
        'Infinite canvas for design',
        'Edit your existing codebase visually',
        'Generate pull requests from design changes',
        'Design system aware AI',
        'Component library editing',
        'Figma to React workflow',
        'Git-native design workflow',
        'Visual site builder',
    ],
    creator: {
        '@id': `${baseUrl}/#organization`,
    },
    publisher: {
        '@id': `${baseUrl}/#organization`,
    },
};

export function blogPostingSchema(post: {
    slug: string;
    title: string;
    description: string;
    date: string;
    updated?: string;
    author: string;
    authorImage: string;
    authorUrl?: string;
    coverImage: string;
    keywords?: string[];
    wordCount?: number;
}) {
    const url = absoluteUrl(`/blog/${post.slug}`);

    return {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        dateModified: post.updated ?? post.date,
        url,
        mainEntityOfPage: url,
        image: absoluteUrl(post.coverImage),
        inLanguage: 'en',
        isAccessibleForFree: true,
        ...(post.keywords ? { keywords: post.keywords.join(', ') } : {}),
        ...(post.wordCount ? { wordCount: post.wordCount } : {}),
        author: {
            '@type': 'Person',
            name: post.author,
            image: absoluteUrl(post.authorImage),
            ...(post.authorUrl ? { url: post.authorUrl, sameAs: [post.authorUrl] } : {}),
        },
        publisher: {
            '@id': `${baseUrl}/#organization`,
            '@type': 'Organization',
            name: APP_NAME,
            logo: {
                '@type': 'ImageObject',
                url: absoluteUrl('/brand/symbol.png'),
            },
        },
    };
}
