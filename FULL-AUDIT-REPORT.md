# Weblab SEO Audit Report

Date: 2026-05-08
Scope: full-site audit for `https://weblab.build`, focused on branded Weblab rankings, AI/visual website builder category rankings, comparison pages, blog discoverability, technical SEO, structured data, and AI-search readiness.

## Audit Summary

Overall status: needs improvement, with strong content foundations but several technical issues that reduce crawl quality, social previews, and structured data eligibility.

Top confirmed issues:

- `FAQPage` JSON-LD was present across commercial pages. This schema is not eligible for commercial SaaS pages and has been removed.
- Live social metadata resolved `og:image` and `twitter:image` to `http://localhost:3000/og-image.png`. The root metadata now sets a production `metadataBase` and absolute OG/Twitter image URLs.
- `/llms.txt` and `/llms-full.txt` were missing. Both have been added for AI-search and answer-engine context.
- Live crawl found broken Cloudflare email-protection links. Footer/contact constants now use stable `mailto:contact@weblab.build` links.
- Sitemap coverage was manually maintained and missed several blog/content opportunities. The static sitemap now includes all current marketing, comparison, and blog URLs.

Top opportunities:

- Submit the updated sitemap in Google Search Console and Bing Webmaster Tools immediately after deploy.
- Request indexing for `/`, `/features/builder`, `/features/ai`, `/compare`, `/compare/webflow`, `/blog/best-website-builder-2026`, and `/blog/best-visual-editor-react-2026`.
- Build internal links from homepage, feature pages, comparison pages, and blog cards into low-linked SEO articles.
- Continue publishing comparison and intent pages around “AI website builder for React”, “visual site builder”, “website builder for existing codebase”, and “design system AI builder”.

## Findings Table

| Area | Severity | Confidence | Finding | Evidence | Fix |
| --- | --- | --- | --- | --- | --- |
| Structured data | Warning | Confirmed | Commercial pages used `FAQPage` JSON-LD. | `rg FAQPage` found many layouts with FAQ schema. | Removed FAQ JSON-LD while keeping visible FAQ content. |
| Social metadata | Warning | Confirmed | OG/Twitter image URLs could resolve to localhost. | Live `social_meta.py` output showed `http://localhost:3000/og-image.png`. | Added `metadataBase` and absolute root OG/Twitter image URLs. |
| AI search readiness | Warning | Confirmed | No `llms.txt` was available. | `llms_txt_checker.py` returned 404. | Added `/llms.txt` and `/llms-full.txt`. |
| Sitemap | Warning | Confirmed | Sitemap blog entries were manually listed and incomplete risk was high. | `sitemap.ts` hardcoded selected blog URLs. | Replaced the metadata route with a complete static sitemap because the Next 16/Bun build failed prerendering `/sitemap.xml`. |
| Broken links | Warning | Confirmed | Cloudflare email-protection links returned 404. | `broken_links.py` found two `/cdn-cgi/l/email-protection` 404s. | Use stable mailto links. |
| Security headers | Warning | Confirmed | Production security headers were missing. | `security_headers.py` score: 25/100, missing six headers. | Added HSTS, CSP, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy in Next config. |
| Homepage intent | Warning | Confirmed | Homepage title/H1 did not clearly target category terms. | Prior title was `Weblab - Cursor for Designers`; H1 was `Design visually, ship instantly`. | Updated title/H1 toward “AI visual website builder for React teams”. |

## Unknowns And Follow-Ups

- PageSpeed/Core Web Vitals could not be confirmed because the PageSpeed API was rate-limited during the audit.
- Google Search Console impressions, indexed page counts, and query performance are not available locally. The owner must connect GSC/Bing and monitor after deploy.
- Live 404s for routes that exist locally likely indicate the deployed build is stale. Confirm after deployment.
