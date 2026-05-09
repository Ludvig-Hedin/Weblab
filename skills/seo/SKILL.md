---
name: seo
description: Apply technical and on-page SEO to Next.js App Router pages — metadata, Open Graph, structured data, sitemaps, canonicals, robots, performance signals.
---

# SEO Skill

Use this skill whenever the user asks to "improve SEO", "add meta tags", "make page rank", "fix Lighthouse SEO", "share on Twitter", "add Open Graph", "schema markup", "structured data", or ships any new public page.

## Stack assumptions

- Next.js App Router (`app/`).
- React Server Components by default.
- Tailwind + shadcn/ui.
- Public site domain: `weblab.build` (override per project — read `apps/web/client/src/app/seo.ts` if it exists).

## Non-negotiables for any public route

1. **Static `metadata` export** in every `page.tsx` or `layout.tsx`. Use `Metadata` from `next`.
2. **Canonical URL** via `alternates.canonical`. Never let two URLs serve the same content without one canonicalising the other.
3. **Open Graph + Twitter** images. Generate via `next/og` (`opengraph-image.tsx` / `twitter-image.tsx`) for dynamic content; static `/public/og/*.png` is fine for fixed pages.
4. **`<title>` ≤ 60 chars, description 140–160 chars.** Front-load the keyword.
5. **One `<h1>` per page.** Heading hierarchy must not skip levels.
6. **Internal links use real `<Link>`**, not `<a href="">` to internal routes.
7. **Public pages are server-rendered.** No client-only content (`use client`) without an SSR fallback that contains the indexable copy.

## File pattern (page-level SEO)

```ts
// app/some-route/page.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: '<Specific keyword-led title> — Weblab',
    description: '140–160 char summary that includes the primary keyword in the first half.',
    alternates: { canonical: '/some-route' },
    openGraph: {
        title: '<title>',
        description: '<description>',
        url: '/some-route',
        siteName: 'Weblab',
        images: [{ url: '/og/some-route.png', width: 1200, height: 630 }],
        type: 'article', // or 'website'
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: '<title>',
        description: '<description>',
        images: ['/og/some-route.png'],
    },
    robots: { index: true, follow: true },
};

export default function Page() { ... }
```

For dynamic routes use `generateMetadata({ params })` instead.

## Structured data (JSON-LD)

Embed JSON-LD in the page with a `<script type="application/ld+json">` tag. Common schemas:

- **Article / BlogPosting** for blog/changelog
- **Product** for pricing pages
- **BreadcrumbList** for any nested route
- **FAQPage** for FAQ sections
- **Organization** + **WebSite** in the root layout

Use `dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}` on a server component.

## Site-wide files

- `app/sitemap.ts` — exports `MetadataRoute.Sitemap`. Include every public route. Include `lastModified` from real source dates.
- `app/robots.ts` — exports `MetadataRoute.Robots`. Block `/api`, `/auth`, `/project/`, internal preview paths. Reference the sitemap.
- `app/icon.tsx`, `app/apple-icon.tsx` — favicons via the App Router file convention.

## Performance signals (real ranking factors)

- **LCP < 2.5s.** Use `next/image` with `priority` on the hero image.
- **CLS < 0.1.** Always set width/height (or `fill` + sized parent) on images and embeds.
- **INP < 200ms.** Avoid huge client bundles on landing pages — keep them server-rendered.
- **No render-blocking fonts.** Use `next/font`, not `<link rel="stylesheet">`.

## Common bugs to fix on sight

- `metadata` exported from a `'use client'` file → silently ignored. Move to a server component.
- Canonical URL pointing at the wrong domain (`localhost`, preview URL). Build canonicals from a single `SITE_URL` constant in `env.ts`.
- Two pages sharing a title — split or canonicalise.
- 404 / 410 pages set `noindex` only after redirect — set in `metadata.robots`.
- `next/image` without `alt` — required for accessibility AND SEO.
- Open Graph image not 1200×630 → looks broken in social previews.

## Audit checklist for a public page

Run mentally before shipping:

1. View source — is the headline + first paragraph in HTML, not loaded later? ✓
2. Title in `<head>` matches the user's intent for the target keyword? ✓
3. One `<h1>` matches the title? ✓
4. Canonical present? ✓
5. OG image renders in Twitter / LinkedIn preview? ✓
6. Lighthouse SEO score 100? ✓
7. Lighthouse Best Practices ≥ 95? ✓
8. Sitemap and robots.txt include / exclude correctly? ✓

## Anti-patterns

- Using a `'use client'` boundary at the top of a public landing page.
- Stuffing keywords in `<meta name="keywords">` (Google ignores it).
- Linking to internal pages with `<a href="/x">` — bypasses prefetch + breaks scroll restoration.
- Generating a different OG image per request without caching — slow and rate-limit prone.
- Writing schema markup that contradicts visible content — Google penalises.
