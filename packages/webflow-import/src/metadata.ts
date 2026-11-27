import type { RewriteReference } from './assets';
import type { Element } from './html';
import { childElements, getAttr, textContent } from './html';

const ogFields = new Map([
    ['og:title', 'title'],
    ['og:description', 'description'],
    ['og:type', 'type'],
    ['og:url', 'url'],
    ['og:site_name', 'siteName'],
    ['og:locale', 'locale'],
    ['og:locale:alternate', 'alternateLocale'],
    ['og:determiner', 'determiner'],
    ['article:published_time', 'publishedTime'],
    ['article:modified_time', 'modifiedTime'],
    ['article:expiration_time', 'expirationTime'],
    ['article:author', 'authors'],
    ['article:section', 'section'],
    ['article:tag', 'tags'],
]);
const supportedOgTypes = new Set([
    'website',
    'article',
    'book',
    'profile',
    'music.song',
    'music.album',
    'music.playlist',
    'music.radio_station',
    'video.movie',
    'video.episode',
    'video.tv_show',
    'video.other',
]);

export function readMetadata(head: Element, rewrite: RewriteReference) {
    const metadata: Record<string, unknown> = {};
    const openGraph: Record<string, unknown> = {};
    const retained: Element[] = [];
    const media = new Map<string, Record<string, string | number>[]>();
    let base: string | undefined;
    for (const element of childElements(head)) {
        if (element.tagName === 'title') {
            metadata.title ??= textContent(element);
            continue;
        }
        if (element.tagName === 'meta') {
            const property = getAttr(element, 'property')?.toLowerCase();
            const name = getAttr(element, 'name')?.toLowerCase();
            const content = getAttr(element, 'content');
            if (content !== undefined && name === 'description') {
                metadata.description ??= content;
                continue;
            }
            if (name === 'viewport' || getAttr(element, 'charset') !== undefined) continue;
            if (content !== undefined && property) {
                const field = ogFields.get(property);
                if (field && (field !== 'type' || supportedOgTypes.has(content))) {
                    if (field === 'url') {
                        base ??= originOf(content);
                        openGraph[field] = rewrite(content, 'optional');
                    } else if (['alternateLocale', 'authors', 'tags'].includes(field)) {
                        const prior = openGraph[field] as string[] | undefined;
                        openGraph[field] = [...(prior ?? []), content];
                    } else {
                        openGraph[field] = content;
                    }
                    continue;
                }
                const match =
                    /^og:(image|video|audio)(?::(url|secure_url|type|width|height|alt))?$/.exec(
                        property,
                    );
                if (match?.[1]) {
                    const group = match[1] === 'audio' ? 'audio' : match[1] + 's';
                    const entries = media.get(group) ?? [];
                    const part = match[2] ?? 'url';
                    if (part === 'url') {
                        const url = rewrite(content);
                        if (entries.at(-1)?.url !== url) entries.push({ url });
                        media.set(group, entries);
                        continue;
                    }
                    const entry = entries.at(-1);
                    if (entry) {
                        const key = part === 'secure_url' ? 'secureUrl' : part;
                        entry[key] = /^(width|height)$/.test(part)
                            ? Number(content)
                            : part === 'secure_url'
                              ? rewrite(content)
                              : content;
                        continue;
                    }
                }
            }
        }
        if (element.tagName === 'link' && getAttr(element, 'rel')?.toLowerCase() === 'canonical') {
            const href = getAttr(element, 'href');
            if (href) {
                base = originOf(href) ?? base;
                metadata.alternates = { canonical: rewrite(href, 'optional') };
                continue;
            }
        }
        retained.push(element);
    }
    Object.assign(openGraph, Object.fromEntries(media));
    if (Object.keys(openGraph).length) metadata.openGraph = openGraph;
    return { metadata, retained, base };
}

function originOf(value: string) {
    try {
        const url = new URL(value);
        return /^https?:$/.test(url.protocol) ? url.origin : undefined;
    } catch {
        return undefined;
    }
}
