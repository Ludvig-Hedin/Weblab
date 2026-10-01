import sampleContent from './sample-content.json';
import {
    HOME_DOCUMENT_ID,
    isCanonicalSlug,
    isPublishedDate,
    validateBody,
} from './content-validation';
import { studioConnectionFromEnvironment } from './studio-config';

export type TextBlock = {
    _key: string;
    _type: 'block';
    style: 'normal' | 'h2';
    children: {
        _key: string;
        _type: 'span';
        text: string;
        marks: ('strong' | 'em')[];
    }[];
};

export type Post = {
    _id: string;
    title: string;
    slug: string;
    excerpt: string;
    category: string;
    publishedAt: string;
    image: { url: string; alt: string } | null;
    body: TextBlock[];
};

export type SiteContent = {
    home: { title: string; intro: string };
    posts: Post[];
};

export type ContentConfig =
    | { mode: 'sample' }
    | { mode: 'sanity'; projectId: string; dataset: string; token?: string };

const invalidContent = () =>
    new Error(
        'Innehållet från Sanity har fel format. Kontrollera startsidan och de publicerade artiklarna i Studio.',
    );

function record(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw invalidContent();
    }
    return value as Record<string, unknown>;
}

function nonemptyString(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) throw invalidContent();
    return value;
}

function array(value: unknown): unknown[] {
    if (!Array.isArray(value)) throw invalidContent();
    return value;
}

function textBlock(value: unknown): TextBlock {
    const block = record(value);
    if (block._type !== 'block' || (block.style !== 'normal' && block.style !== 'h2')) {
        throw invalidContent();
    }
    return {
        _key: nonemptyString(block._key),
        _type: 'block',
        style: block.style,
        children: array(block.children).map((value) => {
            const child = record(value);
            if (child._type !== 'span' || typeof child.text !== 'string') throw invalidContent();
            const marks = array(child.marks).map((mark) => {
                if (mark !== 'strong' && mark !== 'em') throw invalidContent();
                return mark;
            });
            return {
                _key: nonemptyString(child._key),
                _type: 'span',
                text: child.text,
                marks,
            };
        }),
    };
}

function post(value: unknown): Post {
    const entry = record(value);
    const id = nonemptyString(entry._id);
    const slug = nonemptyString(entry.slug);
    const publishedAt = nonemptyString(entry.publishedAt);
    if (/^(drafts|versions)\./.test(id) || !isCanonicalSlug(slug)) {
        throw invalidContent();
    }
    if (!isPublishedDate(publishedAt) || validateBody(entry.body) !== true) {
        throw invalidContent();
    }
    let image: Post['image'] = null;
    if (entry.image !== null) {
        const rawImage = record(entry.image);
        const url = nonemptyString(rawImage.url);
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch {
            throw invalidContent();
        }
        if (
            parsedUrl.protocol !== 'https:' ||
            parsedUrl.hostname !== 'cdn.sanity.io' ||
            parsedUrl.username ||
            parsedUrl.password ||
            parsedUrl.port
        ) {
            throw invalidContent();
        }
        image = { url, alt: nonemptyString(rawImage.alt) };
    }
    return {
        _id: id,
        title: nonemptyString(entry.title),
        slug,
        excerpt: nonemptyString(entry.excerpt),
        category: nonemptyString(entry.category),
        publishedAt,
        image,
        body: array(entry.body).map(textBlock),
    };
}

function validateContent(value: unknown): SiteContent {
    const content = record(value);
    const home = record(content.home);
    const posts = array(content.posts).map(post);
    if (new Set(posts.map((post) => post.slug)).size !== posts.length) throw invalidContent();
    return {
        home: { title: nonemptyString(home.title), intro: nonemptyString(home.intro) },
        posts,
    };
}

export const SAMPLE_CONTENT: SiteContent = validateContent(sampleContent);

export function configFromEnvironment(env: Record<string, string | undefined>): ContentConfig {
    const mode = env.SANITY_CONTENT_MODE;
    if (mode === undefined || mode === 'sample') return { mode: 'sample' };
    if (mode !== 'sanity') {
        throw new Error(
            'SANITY_CONTENT_MODE måste vara sample eller sanity. Kontrollera miljöinställningarna.',
        );
    }
    const connection = studioConnectionFromEnvironment(env);
    if (!connection) {
        throw new Error(
            'Sanity-läget behöver ett giltigt SANITY_PROJECT_ID och SANITY_DATASET. Kontrollera miljöinställningarna.',
        );
    }
    const token = env.SANITY_READ_TOKEN?.trim();
    return { mode: 'sanity', ...connection, ...(token ? { token } : {}) };
}

const query = `{
    "home": *[_type == "pilotHome" && _id == "${HOME_DOCUMENT_ID}"][0]{title, intro},
    "posts": *[_type == "pilotPost" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(publishedAt desc)[0...50]{
        _id, title, "slug": slug.current, excerpt, category, publishedAt,
        "image": select(defined(mainImage.asset) => {"url": mainImage.asset->url, "alt": mainImage.alt}, null),
        body
    }
}`;

export async function loadContent(
    config: ContentConfig,
    fetcher: typeof fetch = fetch,
): Promise<SiteContent> {
    if (config.mode === 'sample') return SAMPLE_CONTENT;
    const url = new URL(
        `https://${config.projectId}.api.sanity.io/v2025-02-19/data/query/${config.dataset}`,
    );
    url.searchParams.set('query', query);
    url.searchParams.set('perspective', 'published');
    let response: Response;
    try {
        response = await fetcher(url, {
            method: 'GET',
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
            ...(config.token ? { headers: { Authorization: `Bearer ${config.token}` } } : {}),
        });
    } catch {
        throw new Error('Sanity kunde inte nås. Kontrollera anslutningen och försök igen.');
    }
    if (!response.ok) {
        throw new Error(
            'Sanity kunde inte läsa innehållet. Kontrollera projekt, dataset och läsbehörighet.',
        );
    }
    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        throw invalidContent();
    }
    return validateContent(record(payload).result);
}
