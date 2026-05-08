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

export const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: APP_NAME,
    url: `${baseUrl}/`,
    logo: absoluteUrl('/brand/symbol.png'),
    sameAs: ['https://github.com/Ludvig-Hedin/Weblab', 'https://www.linkedin.com/company/weblab/'],
};

export const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: APP_NAME,
    url: `${baseUrl}/`,
    publisher: {
        '@type': 'Organization',
        name: APP_NAME,
        url: `${baseUrl}/`,
    },
};

export function blogPostingSchema(post: {
    slug: string;
    title: string;
    description: string;
    date: string;
    author: string;
    authorImage: string;
    coverImage: string;
}) {
    const url = absoluteUrl(`/blog/${post.slug}`);

    return {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        dateModified: post.date,
        url,
        mainEntityOfPage: url,
        image: absoluteUrl(post.coverImage),
        author: {
            '@type': 'Person',
            name: post.author,
            image: absoluteUrl(post.authorImage),
        },
        publisher: {
            '@type': 'Organization',
            name: APP_NAME,
            logo: {
                '@type': 'ImageObject',
                url: absoluteUrl('/brand/symbol.png'),
            },
        },
    };
}
