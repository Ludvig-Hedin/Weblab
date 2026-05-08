# Weblab SEO Action Plan

Date: 2026-05-08

## Immediate Fixes Implemented

- Removed restricted `FAQPage` JSON-LD from commercial pages and the FAQ page.
- Added `WebSite`, `Organization`, `BreadcrumbList`, and `BlogPosting` structured data support.
- Added production `metadataBase` and absolute root OG/Twitter image URLs.
- Added `/llms.txt` and `/llms-full.txt`.
- Added production security headers in `next.config.ts`.
- Replaced the Next sitemap metadata route with a static `public/sitemap.xml` that includes all current marketing, comparison, and blog URLs. This avoids a Next 16/Bun prerender failure on `/sitemap.xml`.
- Updated homepage metadata and hero copy to target “AI visual website builder for React teams”.
- Documented the SEO work in `docs/seo-growth-plan-2026-05-08.md`.

## Next Manual Steps

- Verify `weblab.build` as a domain property in Google Search Console.
- Submit `https://weblab.build/sitemap.xml` in Google Search Console.
- Inspect and request indexing for:
  - `https://weblab.build/`
  - `https://weblab.build/features/builder`
  - `https://weblab.build/features/ai`
  - `https://weblab.build/compare`
  - `https://weblab.build/compare/webflow`
  - `https://weblab.build/blog/best-website-builder-2026`
  - `https://weblab.build/blog/best-visual-editor-react-2026`
- Import the GSC property into Bing Webmaster Tools.
- After deploy, rerun SEO scripts against production and confirm `/robots.txt`, `/sitemap.xml`, `/llms.txt`, and priority routes return 200.

## Content Roadmap

- Strengthen `/features/builder` for “visual site builder”, “visual website builder”, and “React visual builder”.
- Strengthen `/features/ai` for “AI website builder for React”, “AI UI builder”, and “build websites with AI”.
- Add or expand articles for:
  - visual site builder for React
  - AI website builder with code export
  - website builder for existing codebases
  - design system AI builder
  - visual editor for Next.js
  - Figma to React workflow
  - open-source website builder

## Weekly Monitoring

- Track branded queries: `Weblab`, `weblab.build`, `Weblab GitHub`.
- Track category queries: `visual site builder`, `AI website builder`, `React visual editor`, `AI visual editor for React`.
- Track comparison queries: `Weblab vs Webflow`, `Weblab vs Framer`, `Weblab vs Lovable`, `Weblab vs v0`, `Weblab vs Replit`.
- Watch Search Console indexing, Core Web Vitals, and crawl errors after each deploy.
