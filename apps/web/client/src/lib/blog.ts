import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import GithubSlugger from 'github-slugger';
import matter from 'gray-matter';

import { env } from '@/env';

export interface BlogPostFrontmatter {
    title: string;
    description: string;
    date: string;
    /** ISO date — last meaningful update. Falls back to `date` when absent. */
    updated?: string;
    author: string;
    authorImage: string;
    /** Optional canonical URL for the author (LinkedIn/X/personal site) — used in BlogPosting Person schema for E-E-A-T. */
    authorUrl?: string;
    category: string;
    tags: string[];
    coverImage: string;
    draft?: boolean;
}

export interface TocItem {
    id: string;
    text: string;
    depth: number;
}

export interface BlogPost {
    slug: string;
    frontmatter: BlogPostFrontmatter;
    content: string;
    toc: TocItem[];
    readingTime: number;
}

export interface BlogPostMeta {
    slug: string;
    frontmatter: BlogPostFrontmatter;
    readingTime: number;
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'blog');
const SLUG_RE = /^[a-z0-9-]+$/;

export function isValidBlogSlug(slug: string): boolean {
    return SLUG_RE.test(slug);
}

function extractToc(content: string): TocItem[] {
    // Strip fenced code blocks before scanning for headings so that
    // markdown headings inside ``` blocks are not included in the TOC.
    const withoutCode = content.replace(/```[\s\S]*?```/g, '');
    const headingRegex = /^(#{2,3})\s+(.+)$/gm;
    const slugger = new GithubSlugger();
    const toc: TocItem[] = [];
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(withoutCode)) !== null) {
        const depth = (match[1] ?? '').length;
        const text = (match[2] ?? '').trim();
        toc.push({ id: slugger.slug(text), text, depth });
    }
    return toc;
}

function estimateReadingTime(content: string): number {
    return Math.max(1, Math.round(content.split(/\s+/).length / 200));
}

function validateBlogPostFrontmatter(data: Record<string, unknown>): BlogPostFrontmatter | null {
    if (
        typeof data.title !== 'string' ||
        typeof data.description !== 'string' ||
        typeof data.date !== 'string' ||
        typeof data.author !== 'string' ||
        typeof data.authorImage !== 'string' ||
        typeof data.category !== 'string' ||
        !Array.isArray(data.tags) ||
        !data.tags.every((tag) => typeof tag === 'string') ||
        typeof data.coverImage !== 'string' ||
        (data.draft !== undefined && typeof data.draft !== 'boolean') ||
        (data.updated !== undefined && typeof data.updated !== 'string') ||
        (data.authorUrl !== undefined && typeof data.authorUrl !== 'string')
    ) {
        return null;
    }

    return {
        title: data.title,
        description: data.description,
        date: data.date,
        updated: data.updated,
        author: data.author,
        authorImage: data.authorImage,
        authorUrl: data.authorUrl,
        category: data.category,
        tags: data.tags,
        coverImage: data.coverImage,
        draft: data.draft,
    };
}

export function getAllPosts(): BlogPostMeta[] {
    if (!fs.existsSync(CONTENT_DIR)) return [];
    const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.mdx'));
    return files
        .flatMap((filename) => {
            const slug = filename.replace(/\.mdx$/, '');
            if (!isValidBlogSlug(slug)) return [];

            const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), 'utf8');
            const { data, content } = matter(raw);
            const frontmatter = validateBlogPostFrontmatter(data);
            if (!frontmatter) {
                console.warn(`[blog] Invalid frontmatter in ${filename}`);
                return [];
            }
            if (frontmatter.draft === true && env.NODE_ENV === 'production') {
                return [];
            }
            return {
                slug,
                frontmatter,
                readingTime: estimateReadingTime(content),
            };
        })
        .sort(
            (a, b) =>
                new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime(),
        );
}

export function getPostBySlug(slug: string): BlogPost | null {
    if (!isValidBlogSlug(slug)) return null;

    const filePath = path.join(CONTENT_DIR, `${slug}.mdx`);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const { data, content } = matter(raw);
    const frontmatter = validateBlogPostFrontmatter(data);
    if (!frontmatter) return null;
    if (frontmatter.draft === true && env.NODE_ENV === 'production') {
        return null;
    }

    return {
        slug,
        frontmatter,
        content,
        toc: extractToc(content),
        readingTime: estimateReadingTime(content),
    };
}

export function getRelatedPosts(currentSlug: string, count = 3): BlogPostMeta[] {
    const all = getAllPosts();
    const current = all.find((p) => p.slug === currentSlug);
    const candidates = all.filter((p) => p.slug !== currentSlug);
    if (!current?.frontmatter.tags?.length) {
        // No tags on current post — fall back to most-recent siblings.
        return candidates.slice(0, count);
    }
    const currentTags = new Set(current.frontmatter.tags);
    // Rank by shared-tag count desc, then by date desc (getAllPosts is newest-first).
    const scored = candidates
        .map((p) => {
            const shared = (p.frontmatter.tags ?? []).filter((t) => currentTags.has(t)).length;
            return { post: p, shared };
        })
        .sort((a, b) => b.shared - a.shared);
    const matched = scored.filter((s) => s.shared > 0).map((s) => s.post);
    if (matched.length >= count) return matched.slice(0, count);
    // Top-up with the newest non-matched posts.
    const matchedSlugs = new Set(matched.map((p) => p.slug));
    const topUps = candidates.filter((p) => !matchedSlugs.has(p.slug));
    return [...matched, ...topUps].slice(0, count);
}
