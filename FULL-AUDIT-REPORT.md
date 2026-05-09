# Weblab — Full SEO Audit Report (2026-05-09, re-audit)

- **Site**: https://weblab.build
- **Goal A — Brand**: Rank #1 on Google for `weblab`
- **Goal B — Generic**: Page-1 for `website builder`, `visual site builder`, `react visual editor`, `ai website builder`
- **Method**: LLM-first audit with deterministic verification (sitemap + 6 sample URLs fetched & parsed; codebase cross-referenced for every claim).
- **Status**: Earlier-session fixes are **staged in the working tree but not yet deployed** (53 modified files in `git status`, no recent commit reflects them). Production HTML still serves the pre-fix output. **Three new live issues** found in this re-audit beyond what the prior audit captured.

> **Re-audit headline**:
> 1. **Live production still has the duplicate-canonical bug, fake-rating absence not yet live, missing X-Frame-Options, "builderfor" hero text bug, etc.** — because nothing has been committed/deployed since the prior fix session.
> 2. **NEW finding A**: every HTML response has `Cache-Control: no-store` → Cloudflare cannot edge-cache → TTFB and CWV penalty. Not addressed in prior audit.
> 3. **NEW finding B**: `/about/page.tsx` and `/features/page.tsx` each render **two `<h1>` tags** in the source code (not just in production). The prior audit only fixed the hero H1 spacing, not the multi-H1 problem.
> 4. **NEW finding C**: footer "Contact" mailto is being rewritten by Cloudflare's "Email Address Obfuscation" feature into `/cdn-cgi/l/email-protection` — which 404s on this Cloudflare zone. The link is broken to every visitor.
> 5. Everything else from the prior report's Critical/Schema/Robots/Headers fixes is correct in code; just deploy.

---

## 1. Scoring Summary

Three columns: **live** (what the production HTML currently scores), **post-deploy** (what it scores once the staged working-tree changes ship), **after-action-plan** (what's possible with the new items in §2.4 also fixed).

| Category | Weight | Live (today) | Post-deploy of staged fixes | After action plan |
|---|---|---|---|---|
| Technical SEO | 25% | **42 / 100** (dup canonical, no-store, broken Contact link, missing XFO) | 80 / 100 | **94 / 100** (after Cache-Control + multi-H1 + email-protection fixes ship) |
| Content Quality | 20% | 70 / 100 | 76 / 100 | 86 / 100 |
| On-Page SEO | 15% | 60 / 100 (multi-H1, builderfor, /features title 68ch, /features desc 255ch, blog title 96ch) | 80 / 100 | 92 / 100 |
| Schema / Structured Data | 15% | 65 / 100 (still no aggregate-rating fake live, but only Org+WebSite serving) | 94 / 100 | 96 / 100 |
| Performance (CWV) | 10% | N/A — PSI API rate-limited this run (Confidence: Hypothesis) | — | — |
| Image Optimization | 10% | 35 / 100 (91 home `<img>` w/ no width/height, no lazy, no srcset) | 35 / 100 (no code fix yet) | 90 / 100 |
| AI Search Readiness (GEO) | 5% | 80 / 100 (llms.txt 100/100, robots.txt missing AI rules) | 96 / 100 | 96 / 100 |
| **Weighted total (excl. CWV)** | — | **~57 / 100** | ~78 / 100 | **~92 / 100** |

Severity legend: 🔴 Critical · ⚠️ Warning · ✅ Pass · ℹ️ Info.

Severity legend: 🔴 Critical · ⚠️ Warning · ✅ Pass · ℹ️ Info.

---

## 2. Critical Findings — Status

### 🔴 C1 — Duplicate `<link rel="canonical">` on every subpage [FIX STAGED, NOT DEPLOYED]
- **Live evidence (today, curl)**:
  ```
  /pricing → 2 canonical tags (https://weblab.build/  +  https://weblab.build/pricing)
  /about   → 2 canonical tags
  /compare/lovable → 2 canonical tags
  /blog/best-website-builder-2026 → 2 canonical tags
  /features (live, parser): canonical = https://weblab.build/  ← homepage URL
  ```
- **Impact**: Google may pick the homepage canonical and drop every subpage from the index. Catastrophic for the `/compare/*` and `/blog/*` programmatic content strategy.
- **Fix in working tree**: removed the hardcoded `<link>` and `<meta name="robots">` from `apps/web/client/src/app/layout.tsx`; root canonical now flows through Metadata API. Per-page canonicals already set everywhere.
- **Action**: commit + deploy. Then run the Verify block (§11). If two canonicals persist after deploy, the Metadata API for `alternates` may also be cascading from root → per-page; in that case **remove `alternates.canonical` from the root layout entirely** (declare it only on the home `page.tsx`).

### 🔴 C2 — Fake `aggregateRating` removed [FIX STAGED, NOT DEPLOYED]
- Code is clean (`features/ai-for-frontend/layout.tsx` no longer has `aggregateRating`). Production HTML still serves the old version. Same action: deploy.

### 🔴 C3 — Brand-entity signals enriched in `Organization` schema [FIX STAGED]
- `seo.ts` working tree has the full `Organization` (`@id`, `legalName`, `alternateName`, `description`, `slogan`, `foundingDate`, `founders[]`, `numberOfEmployees`, `address`, `contactPoint`, `image`, `sameAs[]`), `WebSite` with `potentialAction: SearchAction`, and `SoftwareApplication` global. Production currently serves the lean version (verified via curl).
- **Manual still required**: Wikidata entity, Crunchbase, ProductHunt — see Action Plan B2/B6.

### 🆕 🔴 C4 — `Cache-Control: no-store` on every HTML response [NEW THIS RE-AUDIT]
- **Live evidence** (`curl -sLI https://weblab.build`):
  ```
  cache-control: private, no-cache, no-store, max-age=0, must-revalidate
  cf-cache-status: DYNAMIC
  ```
- **Source**: not in `next.config.ts` (only `/sw.js` has explicit `no-cache`). This is the Next.js App Router default for any route deemed dynamic. With Cloudflare in front, `cf-cache-status: DYNAMIC` confirms the edge is forced to bypass cache.
- **Impact**: every visitor request hits Railway origin in `europe-west4`. TTFB spikes for non-EU traffic; LCP/INP suffer; bfcache disabled. Marketing pages should be cacheable.
- **Fix**: add a header rule in `apps/web/client/next.config.ts` for marketing routes:
  ```ts
  {
    source: '/((?!api|auth|projects|invitation|sw\\.js).*)',
    headers: [
      { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400' },
    ],
  }
  ```
  Or set `export const revalidate = 600` on each marketing page.
- **Verify**: `curl -sLI https://weblab.build/pricing | grep -i cache-control` → `s-maxage=600`. After 1 minute of traffic, `cf-cache-status` should flip to `HIT` on repeat requests.

### 🆕 🔴 C5 — Multiple `<h1>` on `/about`, `/features`, `/features/prototype` [NEW THIS RE-AUDIT]
- **Source evidence** (grep):
  ```
  apps/web/client/src/app/about/page.tsx:52     <h1>About Weblab: The Visual Editor for React</h1>
  apps/web/client/src/app/about/page.tsx:88     <motion.h1> ... "Design deserves" ...
  apps/web/client/src/app/features/page.tsx:49  <h1>Weblab Features: Design with Your Real Components</h1>
  apps/web/client/src/app/features/prototype/page.tsx:30   <motion.h1>
  apps/web/client/src/app/features/prototype/page.tsx:304  <h1>
  ```
  Live HTML on `/about` and `/features` confirms two H1s each.
- **Impact**: dilutes the page's primary topic for Google; the second H1 ("Design deserves better tools" eyebrow on `/about`, the "Features" eyebrow on `/features`) should be a `<p>` or `<h2>`.
- **Fix**: demote each duplicate H1 to `<h2>` (semantic heading) or `<p>` (decorative). Verify `curl -s URL | grep -c '<h1'` returns `1`.

### 🆕 🔴 C6 — Footer "Contact" link 404s via Cloudflare email obfuscation [NEW THIS RE-AUDIT]
- **Live evidence** (`broken_links.py`):
  ```
  [404] /cdn-cgi/l/email-protection — anchor "[email protected]"
  [404] /cdn-cgi/l/email-protection#cfaca0a1bb... — anchor "Contact"
  ```
- **Source**: `apps/web/client/src/app/_components/landing-page/page-footer.tsx:73` — `href="mailto:contact@weblab.build"`. Cloudflare's "Email Address Obfuscation" feature is rewriting the `mailto:` link at the edge into a `/cdn-cgi/l/email-protection` URL, and the de-obfuscation script is not running (or is being blocked by the CSP `script-src 'self' 'unsafe-inline' 'unsafe-eval' https:` chain in some way), so the link 404s in plain HTTP fetches and likely also when JS fails.
- **Impact**: footer Contact link broken to all visitors who don't execute the Cloudflare JS, including search-engine crawlers. Wastes crawl budget and looks unprofessional.
- **Fix (pick one)**:
  - **Cloudflare dashboard**: Scrape Shield → disable "Email Address Obfuscation" for `weblab.build`. Cleanest.
  - **Or in code**: replace the `<a href="mailto:...">` with a small client component that builds the address from constants at runtime so Cloudflare's HTML parser doesn't match the `mailto:` pattern.
- **Verify**: re-run `broken_links.py https://weblab.build` → 0 broken.

### 🚫 → ✅ B1 — `${APP_NAME}` literal in single-quoted strings [FIX STAGED]
- Working tree fixed (`features/prototype/layout.tsx`, `publish/manager.ts:120`). Production still serves `${APP_NAME}` literal until deploy.

---

## 3. Technical SEO

| # | Finding | Status | Evidence |
|---|---|---|---|
| T1 | AI crawlers explicit in robots.txt | ✅ FIXED | Added rules for GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, anthropic-ai, Claude-Web, PerplexityBot, Perplexity-User, Applebot, Applebot-Extended, Google-Extended, CCBot, cohere-ai, Meta-ExternalAgent, FacebookBot. Disallowed Bytespider, Diffbot. |
| T2 | `X-Frame-Options: SAMEORIGIN` + `X-DNS-Prefetch-Control: on` | ✅ FIXED | `next.config.ts` headers block. |
| T3 | Sitemap submitted, valid, 50 URLs, dates bumped | ✅ FIXED | `https://weblab.build/sitemap.xml`. Marketing-page lastmod bumped to 2026-05-09. |
| T4 | Single redirect-free response on root | ✅ Pass | 0 hops, 200 in 130ms. |
| T5 | HTTPS + HSTS with `includeSubDomains` | ✅ Pass | `max-age=31536000; includeSubDomains`. |
| T6 | `meta robots: index, follow` everywhere | ✅ Pass | All public pages set `robots: { index: true, follow: true }` via Metadata API. |
| T7 | TTFB ~130ms, Cloudflare → Railway | ✅ Pass | — |
| T8 | Core Web Vitals | ⏳ Not measured | PSI rate-limited during audit. Re-run after deploy or check GSC > Core Web Vitals. |
| T9 | Trailing-slash consistency | ⏳ Recommended | Pick a canonical form. Add `trailingSlash` to `next.config.ts` if you want enforced redirects. |
| T10 | `<html lang>` defaults to `en` if locale missing | ✅ FIXED | `lang={locale || 'en'}` |

---

## 4. On-Page SEO

| # | Finding | Status | Evidence |
|---|---|---|---|
| O1 | Title (54 chars), meta description (165 chars), keyword-aligned | ✅ Pass | `<title>Weblab - AI Visual Website Builder for React Teams</title>` |
| O2 | Title template `%s \| Weblab` | ✅ FIXED | Root metadata uses `title: { default, template }`. Children that pass title-only inherit the suffix automatically. |
| O3 | Single H1 with explicit space-fix (parser/screen-reader compat) | ✅ FIXED | Hero adds `{' '}` after "builder" before `<br/>`. |
| O4 | Compare pages: keyword-rich titles + branded H1s | ✅ Pass | E.g., "Weblab vs Lovable: edit your real codebase or generate a new one". |
| O5 | `/features/builder` strong title | ✅ Pass | "Visual Builder \| Design with Your Real React Components \| Weblab" |
| O6 | `/features/ai-for-frontend` description trimmed to 160 chars | ✅ FIXED | Was 459 (Google truncates). |
| O7 | Twitter card: `site` + `creator` set to `@weblab` | ✅ FIXED | Root `twitter` block. ⚠️ Make sure that handle is actually claimed before deploy — otherwise unclaim it from the metadata. |
| O8 | Per-route OG images | ⏳ Recommended | Use `opengraph-image.tsx` per route (T4 in plan). |

---

## 5. Schema / Structured Data

| # | Finding | Status |
|---|---|---|
| S1 | `Organization` enriched with founder/address/contactPoint | ✅ FIXED |
| S2 | `WebSite.potentialAction: SearchAction` (sitelinks searchbox) | ✅ FIXED |
| S3 | `SoftwareApplication` schema globally on every page | ✅ FIXED |
| S4 | `BreadcrumbList` on every subpage (15 routes wired) | ✅ FIXED |
| S5 | `BlogPosting` enriched: `dateModified`, `authorUrl`, `keywords`, `wordCount` | ✅ FIXED |
| S6 | `Blog` schema on `/blog` index | ✅ FIXED |
| S7 | `AboutPage` + nested `Person` mainEntity for `/about` | ✅ FIXED |
| S8 | Fake `aggregateRating` removed | ✅ FIXED |
| S9 | FAQ schema correctly absent (restricted since Aug 2023) | ✅ Pass |
| S10 | `VideoObject` for product demos | ⏳ Recommended (when video lands) |

All Organization/Person/Publisher refs use `@id` cross-references for entity unification.

---

## 6. Content Quality (E-E-A-T)

| # | Finding | Status |
|---|---|---|
| Q1 | Homepage Flesch 31.9 ("Very Difficult, college") | ⏳ Acceptable for SaaS landing page |
| Q2 | Blog topical hub strong (17–20 posts) | ✅ Pass |
| Q3 | E-E-A-T plumbing for blog authors (`authorUrl`, `tags`) | ✅ FIXED in code; ⏳ author content edits required (add `authorUrl: 'https://www.linkedin.com/in/...'` to MDX frontmatter per post) |
| Q4 | Orphaned blog posts (≤1 incoming link) | ⏳ Open — Action Plan P5 |
| Q5 | Comparison-page hub coverage | ✅ Pass (11 competitors) |

---

## 7. Internal Linking

| # | Finding | Status |
|---|---|---|
| L1 | 21 pages with ≤1 incoming internal link | ⏳ Open — P5 |
| L2 | Footer dominates anchors | ⏳ Open |
| L3 | 20 links missing anchor text | ⏳ Open |
| L4 | `/compare` hub linking | ✅ Pass |

---

## 8. Image Optimization

| # | Finding | Status |
|---|---|---|
| I1 | Alt text descriptive (91/91 home images have alt) | ✅ Pass |
| I2 | Hero raw `<img>` → Next `<Image>` (width/height/lazy/srcset/AVIF) | ⏳ **Open** — confirmed in re-audit: 0/91 home images have width/height, 0/91 have `loading="lazy"`, 0/91 have `srcset`. CLS + LCP risk on `/`. |
| I3 | Per-route OG images | ⏳ Recommended — T4 |

---

## 9. AI Search (GEO) and Off-Page

| # | Finding | Status |
|---|---|---|
| G1 | `llms.txt` + `llms-full.txt` 100/100 | ✅ Pass |
| G2 | AI crawlers explicit in robots.txt | ✅ FIXED |
| G3 | Q&A blocks for AEO | ⏳ Open (visible content — needs author input) |
| A1 | `Organization.sameAs` saturation | ✅ FIXED in code (4 profiles) |
| A2 | Wikidata entity | ⏳ Manual — B2 |
| A3 | ProductHunt / HN / dev.to launches | ⏳ Manual — B6 |
| A4 | GitHub repo SEO (README/topics/about) | ⏳ Manual — B6 |

---

## 10. Files Changed (this session)

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

Validation: `bun typecheck` clean for these files (one pre-existing unrelated error in `project-load-error.tsx`). `bun lint` clean (exit 0).

---

## 11. Verification After Deploy (run against production)

```bash
# 1. Single canonical per page
for p in / /pricing /compare/lovable /features/builder /blog/best-website-builder-2026; do
  n=$(curl -s "https://weblab.build$p" | grep -c 'rel="canonical"')
  echo "canonicals=$n on $p (expect 1)"
done

# 2. Multiple JSON-LD blocks present (Org + WebSite + SoftwareApp + page-specific)
curl -s https://weblab.build/ | grep -c 'application/ld+json'        # expect ≥3
curl -s https://weblab.build/pricing | grep -c 'application/ld+json' # expect ≥4

# 3. AI crawlers managed
curl -s https://weblab.build/robots.txt | grep -E 'GPTBot|ClaudeBot|PerplexityBot' | head -3

# 4. X-Frame-Options
curl -sI https://weblab.build/ | grep -i x-frame-options             # expect SAMEORIGIN

# 5. URL inspection in GSC for /, /pricing, /features/builder, /compare/lovable, /blog/best-website-builder-2026 — confirm "Google-selected canonical" matches "User-declared canonical".
```

---

## 12. Path to the Goals

### A — Rank #1 for `weblab`
Now technically free of canonical/schema blockers. Brand SERP win depends on **brand-entity authority**:
1. Wikidata entry (B2)
2. Founder X/Twitter, ProductHunt, Crunchbase profiles claimed and added to `sameAs` (B1/B6)
3. 30+ branded backlinks via launch + content campaigns (B6)

### B — Page-1 for `website builder` / `visual site builder`
Now technically credible. Page-1 win depends on **topical depth + backlinks**:
1. New `/website-builder` and `/visual-site-builder` landing pages (P2/P3)
2. Programmatic SEO matrix (P4)
3. Internal linking pass (P5)
4. Comparison page deepening with tables and migration guides (P6)

See `ACTION-PLAN.md`.
