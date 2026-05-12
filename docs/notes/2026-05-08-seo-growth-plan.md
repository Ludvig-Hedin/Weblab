# SEO Growth Implementation - 2026-05-08

## Goal

Improve Weblab's crawlability, structured data quality, AI-search readiness, and keyword targeting for branded queries, visual site builder queries, website builder queries, AI website builder queries, and React visual editor queries.

## Implementation Notes

- Use absolute `https://weblab.build` social image URLs so production previews do not resolve to localhost.
- Use allowed JSON-LD types only: `Organization`, `WebSite`, `SoftwareApplication`, `WebPage`, `BreadcrumbList`, and `BlogPosting`.
- Avoid `FAQPage` JSON-LD on commercial pages because Google restricts FAQ rich results to government and healthcare authority sites.
- Keep `apps/web/client/public/sitemap.xml` synchronized with marketing routes and MDX posts. Next 16/Bun prerendering currently fails on metadata routes for XML/text outputs with `response.blob is not a function`, so `robots.txt` and `sitemap.xml` are static public files for build stability.
- Keep contact links as stable `mailto:contact@weblab.build` links instead of Cloudflare email-protection URLs.
- Provide `/llms.txt` and `/llms-full.txt` so AI answer engines can quickly understand product positioning and priority URLs.

## Manual SEO Operations

- Verify `weblab.build` as a domain property in Google Search Console.
- Submit `https://weblab.build/sitemap.xml`.
- Use URL Inspection for `/`, `/features/builder`, `/features/ai`, `/compare`, `/compare/webflow`, `/blog/best-website-builder-2026`, and `/blog/best-visual-editor-react-2026`.
- Import the Google Search Console property into Bing Webmaster Tools.
- Review Search Console query data weekly for branded, category, comparison, and blog clusters.
