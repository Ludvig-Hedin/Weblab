# Weblab — SEO Action Plan

- **Created**: 2026-05-09 · **Re-audited**: 2026-05-09
- **Goals**: (A) rank #1 for `weblab`; (B) rank page-1 for `website builder`, `visual site builder`, `react visual editor`, `ai website builder`
- **Companion**: `FULL-AUDIT-REPORT.md` for evidence
- **Re-audit reality check**: prior session's "Block C ✅ APPLIED" items are **staged in the working tree** (53 modified files in `git status`) but **not yet committed/deployed**. Live production still serves the pre-fix output. **Step 0 below = ship what's staged.** Then handle the new items C4/C5/C6 surfaced this re-audit.

> Items grouped: ✅ in code (staged) · 🚀 deployed · ⏳ open · 🛠 manual (you do it)

---

## Step 0 — DEPLOY THE STAGED FIXES (do this first)

`git status` shows 53 modified files including `next.config.ts`, `layout.tsx`, `seo.ts`, `robots.txt`, `sitemap.xml`, hero/about/features/blog/compare layouts, and `publish/manager.ts`. Until these ship, none of the Block C/B/T items below are actually live.

```bash
# Sanity-check the diff against the items the prior plan claims fixed
git --no-pager diff --stat | head -60

# Targeted validation before commit
bun typecheck
bun lint

# Commit + push (Railway auto-deploys on main)
git add apps/web/client/next.config.ts apps/web/client/public/robots.txt \
        apps/web/client/public/sitemap.xml apps/web/client/src/app \
        apps/web/client/src/lib/blog.ts apps/web/client/src/server/api/routers/publish/manager.ts
git commit -m "seo: deploy canonical/schema/robots/sitemap/headers fixes"
git push origin main
```

After Railway finishes deploying, run the verification block in `FULL-AUDIT-REPORT.md` §11 and the new Step 0a below.

### Step 0a — verify the staged canonical fix actually ships single canonicals

```bash
for p in / /pricing /compare/lovable /features /features/builder /blog/best-website-builder-2026 /workflows/claude-code; do
  n=$(curl -sL "https://weblab.build$p" | grep -c 'rel="canonical"')
  echo "canonicals=$n on $p (expect 1)"
done
```
If any path still returns `2`, the Next.js Metadata API `alternates` is cascading from root → child. **Fix: remove `alternates: { canonical: ... }` from `apps/web/client/src/app/layout.tsx` entirely** and declare the home canonical only on `apps/web/client/src/app/page.tsx`. Re-deploy and re-verify.

---

## Block C — Critical Fixes (status after Step 0)

| Item | Status | What it requires |
|---|---|---|
| C1 — Single canonical per page | 🚀 if Step 0a passes; ⏳ rework if not | See Step 0a fallback. |
| C2 — Single `<meta name="robots">` source of truth | ✅ in code → 🚀 after Step 0 | Centralized via Metadata API in root layout. |
| C3 — Trailing-slash audit | ⏳ Recommended | Pick canonical form. Add `trailingSlash` to `next.config.ts` if you want enforced redirects. |
| **C4 — Cache-Control on marketing HTML (NEW)** | ⏳ Open | Live HTML returns `private, no-store, ...` and Cloudflare cannot cache it (`cf-cache-status: DYNAMIC`). Add a `headers()` rule in `apps/web/client/next.config.ts` for non-auth/non-api/non-projects routes: `Cache-Control: public, max-age=0, s-maxage=600, stale-while-revalidate=86400`. Verify with `curl -sLI https://weblab.build/pricing | grep cache-control`. |
| **C5 — One H1 per page (NEW)** | ⏳ Open | `apps/web/client/src/app/about/page.tsx` (lines 52 + 88) and `apps/web/client/src/app/features/page.tsx` (line 49 + an eyebrow H1 confirmed in live HTML) and `apps/web/client/src/app/features/prototype/page.tsx` (lines 30 + 304) each have two `<h1>`. Demote the duplicates to `<h2>` (semantic) or `<p>` (decorative). Verify `curl -s URL \| grep -c '<h1'` returns `1`. |
| **C6 — Footer Contact link 404 (NEW)** | ⏳ Open | Cloudflare Email Address Obfuscation rewrites `mailto:contact@weblab.build` (in `apps/web/client/src/app/_components/landing-page/page-footer.tsx:73`) to `/cdn-cgi/l/email-protection`, which 404s on this CF zone. Pick one: (a) **Cloudflare dashboard → Scrape Shield → disable Email Address Obfuscation** (cleanest); or (b) build the address from constants in a small client component so CF's regex doesn't match. Verify with `python3 ~/.claude/skills/seo/scripts/broken_links.py https://weblab.build` → 0 broken. |

**Verification after deploy** (run against production):
```bash
for p in / /pricing /compare/lovable /features/builder /blog/best-website-builder-2026; do
  n=$(curl -s "https://weblab.build$p" | grep -c 'rel="canonical"')
  echo "canonicals=$n on $p (expect 1)"
done
```
Then GSC URL Inspection on each — confirm "Google-selected canonical" = "User-declared canonical".

---

## Block B — Brand SERP for "weblab" (30 days)

### B1 — `Organization.sameAs` and entity unification ✅ APPLIED in code
- `apps/web/client/src/app/seo.ts` `organizationSchema` now includes:
  - `@id: ${baseUrl}/#organization` (entity unification)
  - `legalName`, `alternateName[]`, `slogan`, `description`
  - `foundingDate: '2024'`
  - `founders[]` with founder `url` + `sameAs` (LinkedIn)
  - `numberOfEmployees`, `address` (SE), `contactPoint`
  - `image` (OG), `logo` (full ImageObject with width/height)
  - `sameAs[]`: GitHub + LinkedIn + YouTube + Substack
- `WebSite` schema now references Organization via `@id` and includes `potentialAction: SearchAction` for sitelinks searchbox.
- `SoftwareApplication` schema injected globally.
- 🛠 **Still required (you do it)**:
  1. Claim `@weblab` on X/Twitter, then add to `sameAs` and confirm `twitter.site/creator` in metadata is correct.
  2. Decide whether to advertise the Substack here or move it to `/blog`.
  3. Re-issue founder LinkedIn URL once vanity slug is finalized.

### B2 — Wikidata entry 🛠 Manual (1–3 hours, free)
- Submit a new item with: label `Weblab`, description `AI visual website builder for React and Next.js teams`, `instance of` software / website builder, official website `https://weblab.build`, GitHub username, founder, inception 2024-MM-DD, logo image.
- Once approved, add the Q-id back to `Organization.sameAs` in `seo.ts`.
- This is the single biggest unlock for a Knowledge Panel on `weblab`.

### B3 — `WebSite.potentialAction: SearchAction` ✅ APPLIED
- Currently targets `/blog?q={search_term_string}`. If you don't have a server-side `?q=` handler on `/blog`, either: (a) build a simple search route that filters posts client-side, or (b) repoint the SearchAction to a different endpoint you actually serve. Today this exists in schema only — works for sitelinks-searchbox eligibility, but the actual search target should land users somewhere useful.

### B4 — `SoftwareApplication` schema ✅ APPLIED globally
- Emitted in root layout `<head>` so every page carries it.
- 🛠 **Optional**: when product imagery improves, replace `screenshot: '/og-image.png'` with a per-product screenshot.

### B5 — Founder Person schema 🛠 Manual content edit
- `/about/layout.tsx` now emits `AboutPage` with nested `Person` mainEntity for the founder. Founder schema appears as nested `founders[]` in `Organization`.
- 🛠 Add a richer founder bio on `/about` if it isn't already there: photo, brief bio paragraph, links to talks/articles. The Person schema is wired; visual content is up to you.

### B6 — Branded backlinks burst (10–14 days, parallel) 🛠 Manual
1. **ProductHunt launch** (Tue/Wed). Pre-warm hunters list. After launch, add `https://www.producthunt.com/products/weblab` to `Organization.sameAs`.
2. **Hacker News "Show HN"** with a substantive demo or open-source release.
3. **dev.to article** by founder — cross-post from your blog. Link back to `/features/builder` and `/compare/lovable`.
4. **YouTube product demo (5–8 min)** — embed on `/features/builder` and `/`. Add `VideoObject` schema (template ready in `seo.ts`).
5. **Two podcast appearances** (frontend / dev-tooling).
6. **Guest post on Smashing Magazine, CSS-Tricks, or Frontend Mastery**.
7. Update **GitHub repo** `Ludvig-Hedin/Weblab`: README starts with "Weblab — AI visual website builder for React teams", topics include `weblab`, `ai-website-builder`, `visual-editor`, `react`, `nextjs`, `design-tools`. Update About text + website URL.

Track: target +30 referring domains in 30 days.

---

## Block P — Page-1 for category terms (60–90 days)

### P1 — Strengthen `/features/builder` and `/features/ai` 🛠 Manual content
- Add a 60–90 sec demo video with `VideoObject` schema.
- Add an inline "How it compares to Webflow / Framer / v0" section linking into `/compare/*`.
- Add customer-quote/testimonial blocks (real attribution required).
- Add 6–8 internal links to related blog posts at the bottom.

### P2 — `/website-builder` topic hub 🛠 Manual (new page — ASK before creating)
- Target keyword: `website builder`. Long-form (1,500–2,500 words). Add `Article` + `BreadcrumbList` schema. Link inbound from homepage hero secondary CTA, `/features/builder`, `/blog/best-website-builder-2026`, every `/compare/*`.

### P3 — `/visual-site-builder` page 🛠 Manual (new page — ASK before creating)
- Exact-match for your stated keyword. Title: "Visual Site Builder for React & Next.js Teams | Weblab". Cross-link inbound from `/features/builder`, all `/compare/*`, blog index hero.

### P4 — Programmatic SEO matrix (60–80 pages) 🛠 Manual (new pages — ASK)
- `/website-builder/for/{react|next-js|vue|svelte}`
- `/website-builder/for/{designers|developers|founders|agencies|marketing-teams}`
- `/website-builder/with/{ai|git|figma|your-design-system}`
- Each page minimum 600 unique words, real screenshots, real testimonials, no boilerplate.

### P5 — Cross-link the orphans 🛠 Manual content
21 pages with ≤1 incoming link. Highest priority:
- `/blog/best-website-builder-2026` — link from `/features/builder`, future `/website-builder`, `/`, every `/compare/*`.
- `/blog/best-visual-editor-react-2026` — link from `/features/builder`, `/`, `/compare/v0`, `/compare/bolt`.
- All `weblab-vs-*` blog posts — auto-link from the corresponding `/compare/<x>` page.
- Add "Related posts" block to `/blog/[slug]/page.tsx` showing 3–4 sibling posts.

### P6 — Comparison-page deepening 🛠 Manual content
For each `/compare/<x>`:
- Add 15–25-row diff table.
- "When to choose Weblab" + "When to choose <x>" honesty section (boosts trust + AEO).
- Customer-quote block.
- 2-paragraph migration guide.
- `Article` JSON-LD added to existing `BreadcrumbList`.

---

## Block T — Technical Polish

| Item | Status | Notes |
|---|---|---|
| T1 — AI crawlers in robots.txt | ✅ APPLIED | GPTBot/ClaudeBot/PerplexityBot/Google-Extended/Applebot-Extended/CCBot/cohere-ai/Meta-ExternalAgent allowed. Bytespider/Diffbot blocked. |
| T2 — `X-Frame-Options: SAMEORIGIN` + `X-DNS-Prefetch-Control: on` | ✅ APPLIED | `next.config.ts`. |
| T3 — Hero raw `<img>` → Next `<Image>` | ⏳ Open | 1–2 hr. Replace `<img>` in hero/grid for width/height/lazy/srcset/AVIF. |
| T4 — Per-route OG images | ⏳ Open | 2–3 hr. Add `opengraph-image.tsx` per route group: `/`, `/pricing`, `/features/*`, `/compare/*`, `/blog/[slug]`. |
| T5 — Homepage H1 spacing | ✅ APPLIED | `_components/hero/index.tsx` adds `{' '}` after "builder" before `<br/>`. |
| T6 — `BreadcrumbList` on subpages | ✅ APPLIED | Wired into 15 layouts. Compare pages already had it. |
| T7 — `BlogPosting.dateModified` from `updated` | ✅ APPLIED | Frontmatter now accepts optional `updated` and `authorUrl`. Wired into BlogPosting + OG. |
| T8 — Q&A blocks on flagship pages | ⏳ Open (visible content) | Adds AEO eligibility without FAQ schema (which is restricted). Needs author content. |
| T9 — `lazy/decoding=async` on non-LCP images | ⏳ Open | Auto via T3 once Next `<Image>` lands. |
| T10 — `<html lang>` consistency | ✅ APPLIED | Defaults to `en` if locale missing. |
| T11 — Title template inheritance | ✅ APPLIED | Root metadata uses `title: { default, template: '%s \| Weblab' }`. |
| T12 — Blog index `Blog` schema | ✅ APPLIED | Lists all posts as `BlogPosting` items. |
| T13 — `AboutPage` schema | ✅ APPLIED | Replaces duplicate Organization schema on `/about`. |
| T14 — Sitemap dates bumped | ✅ APPLIED | Marketing pages now lastmod=2026-05-09 to signal freshness on next crawl. |

---

## Block M — Measurement & Monitoring

| Metric | Tool | Cadence | Day-30 target | Day-90 target |
|---|---|---|---|---|
| `weblab` (brand) position | GSC | Weekly | Top 3 | #1 |
| `weblab` Knowledge Panel | manual | Monthly | Wikidata entry live | KP visible |
| `website builder` position | GSC + Ahrefs/Semrush | Weekly | Top 30 | Top 10 |
| `visual site builder` position | GSC | Weekly | Top 20 | Top 10 |
| `react visual editor` position | GSC | Weekly | Top 10 | Top 3 |
| Indexed pages | GSC > Coverage | Weekly | All 50 sitemap URLs | 80+ (after P4) |
| Referring domains | Ahrefs | Weekly | +30 | +120 |
| CWV mobile (LCP/INP/CLS) | GSC > CWV | Weekly | All Good | All Good |
| Branded CTR | GSC | Weekly | ≥4% on `weblab` | ≥10% on `weblab` |
| Bing position for the same set | Bing Webmaster Tools | Monthly | Top 10 | Top 3 |

---

## Recommended order (next 14 days)

| Day | Task |
|---|---|
| Today (Day 0) | **Step 0**: commit + push the 53 modified files; let Railway deploy. Run Step 0a verification (single canonical per page). Run §11 verification block. Then GSC URL Inspection on 5 priority pages. |
| Day 0 (same day) | **C4** — add Cache-Control rule for marketing routes in `next.config.ts`. **C5** — demote duplicate H1s in `/about/page.tsx`, `/features/page.tsx`, `/features/prototype/page.tsx`. **C6** — disable Cloudflare Email Address Obfuscation. Re-deploy. |
| Day 1 | B5 manual content edits on `/about` (founder bio enrichment). |
| Day 2 | B2 — submit Wikidata entry. |
| Day 3 | B6 step 7 — GitHub repo README/topics/about. |
| Day 4 | P5 — internal-linking pass on orphan blog posts + add `Related posts` to `/blog/[slug]`. |
| Day 5–7 | T3 (Next `<Image>`) — confirmed open: 91 home `<img>` with no width/height/lazy/srcset. + T4 (per-route OG). |
| Day 8 | B6 step 1 — schedule ProductHunt launch. Pre-warm hunters list. |
| Day 9–10 | P3 — `/visual-site-builder` page. |
| Day 11–14 | P2 — `/website-builder` page. P1 — flagship feature page deepening. Lock B6 dates (PH/HN/dev.to). |

---

## What success looks like

- **Day 0**: subpages have a single canonical, 200 OK, `index, follow`. GSC URL Inspection returns user-canonical = Google-canonical for all 5 priority pages.
- **Day 30**: `weblab` ranks ≤3 for the brand. Wikidata Q-id propagating. +30 referring domains. All 50 sitemap URLs indexed.
- **Day 90**: `weblab` #1 with Knowledge Panel. `visual site builder` and `react visual editor` page-1. `website builder` top-15 (page-1 takes 6–12 months for the head term).

---

## Caveat on "Website builder"

The unbranded head term `website builder` is dominated by Wix, Squarespace, GoDaddy, Hostinger, Webflow, Shopify and aged authority sites. Realistic page-1 timelines: **6–12 months with consistent execution**. The achievable adjacent wins in 90 days are: `visual site builder`, `visual website builder`, `react visual editor`, `ai website builder for react`, `website builder for existing codebase`, `figma to react workflow`, plus all `weblab vs <competitor>` queries. Concentrate effort there first; the head term comes from compounding authority earned by winning the niches.

---

## Files changed this session

```
apps/web/client/next.config.ts
apps/web/client/public/robots.txt
apps/web/client/public/sitemap.xml
apps/web/client/src/app/_components/hero/index.tsx
apps/web/client/src/app/about/layout.tsx
apps/web/client/src/app/blog/[slug]/page.tsx
apps/web/client/src/app/blog/page.tsx
apps/web/client/src/app/changelog/page.tsx
apps/web/client/src/app/download/layout.tsx
apps/web/client/src/app/faq/layout.tsx
apps/web/client/src/app/features/ai/layout.tsx
apps/web/client/src/app/features/ai-for-frontend/layout.tsx
apps/web/client/src/app/features/builder/layout.tsx
apps/web/client/src/app/features/layout.tsx
apps/web/client/src/app/features/prototype/layout.tsx
apps/web/client/src/app/layout.tsx
apps/web/client/src/app/pricing/layout.tsx
apps/web/client/src/app/privacy-policy/layout.tsx
apps/web/client/src/app/seo.ts
apps/web/client/src/app/site-map/layout.tsx
apps/web/client/src/app/terms-of-service/layout.tsx
apps/web/client/src/app/workflows/claude-code/layout.tsx
apps/web/client/src/app/workflows/layout.tsx
apps/web/client/src/app/workflows/vibe-coding/layout.tsx
apps/web/client/src/lib/blog.ts
apps/web/client/src/server/api/routers/publish/manager.ts
```

**Validation**: `bun typecheck` clean for the SEO files (one pre-existing unrelated error). `bun lint` clean (exit 0).
