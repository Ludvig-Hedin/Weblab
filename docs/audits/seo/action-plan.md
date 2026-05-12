# Weblab — SEO Action Plan (2026-05-11)

- **Companion**: `FULL-AUDIT-REPORT.md` for evidence
- **Goals**: (A) rank #1 for `weblab`; (B) page-1 for `website builder`, `visual site builder`, `react visual editor`, `ai website builder`
- **Re-audit summary**: prior Block C/T/S/B fixes are **live in production** as of 2026-05-11. Remaining work concentrates on image performance, Cloudflare edge caching, internal linking depth, content E-E-A-T, and off-page authority.

Status legend: ✅ in code · 🚀 deployed/verified live · ⏳ open · 🛠 manual (you do it)

---

## Step 0 — Verify live (already passed today)

```bash
# Single canonical
for p in / /pricing /compare/lovable /features/builder /blog/best-website-builder-2026; do
  echo -n "$p: "; curl -s "https://weblab.build$p" | grep -c 'rel="canonical"'
done
# Expect 1 each — verified 2026-05-11 ✅

# Single H1
for p in / /about /features /features/prototype; do
  echo -n "$p: "; curl -s "https://weblab.build$p" | grep -c '<h1'
done
# Expect 1 each — verified 2026-05-11 ✅

# Security headers
curl -sI https://weblab.build/ | grep -iE 'strict-transport|x-frame|x-content-type|content-security-policy'
# Verified 2026-05-11 ✅

# AI crawlers
curl -s https://weblab.build/robots.txt | grep -E 'GPTBot|ClaudeBot|PerplexityBot|Google-Extended'
# Verified 2026-05-11 ✅
```

---

## Block C — Critical (status today)

| Item | Status | Notes |
|---|---|---|
| C1 — Single canonical per page | 🚀 Verified live | 1 canonical on `/`, `/pricing`, `/compare/lovable`, `/features/builder`, `/blog/best-website-builder-2026`. |
| C2 — Fake `aggregateRating` removed | 🚀 Verified live | Homepage JSON-LD: Org + WebSite + SoftwareApplication only. |
| C3 — `Organization` enriched | 🚀 Verified live | `@id`, legalName, alternateName[], slogan, foundingDate, founders[], numberOfEmployees, address, contactPoint, sameAs[] all present. |
| C4 — Cache-Control header | 🚀 Header live | `public, max-age=0, s-maxage=600, stale-while-revalidate=86400` set on origin. **Follow-up:** `cf-cache-status: DYNAMIC` — see C4a below. |
| C5 — Single H1 per page | 🚀 Verified live | `/about`, `/features`, `/features/prototype` clean. |
| C6 — Footer Contact 404 (CF email obfuscation) | 🚀 Verified live | No `cdn-cgi/l/email-protection` or `mailto:` returned on homepage/about/pricing. |

### C4a — Make Cloudflare honour origin cache headers ⏳ (1 hr, manual)

Origin sends `public, s-maxage=600, swr=86400` but CF returns `cf-cache-status: DYNAMIC` → every request still hits Railway. Cause: by default, CF only caches static file types (HTML excluded). Fix in Cloudflare dashboard:

1. Cloudflare → `weblab.build` zone → **Rules → Cache Rules → Create rule**.
2. Condition: `URI Path` does not start with `/api/`, `/auth/`, `/login`, `/projects/`, `/project/`, `/invitation/`, `/design-system`.
3. Cache eligibility: **Eligible for cache**.
4. Edge TTL: **Respect origin TTL** (since origin already sends `s-maxage=600`).
5. Browser TTL: **Respect origin TTL** (or 0 — origin uses `max-age=0`).
6. Cache by status code: cache `200-299`, bypass `3xx/4xx/5xx`.
7. Save and deploy.

**Verify**:
```bash
curl -sI https://weblab.build/pricing | grep -iE 'cache-control|cf-cache-status'
# First request: cf-cache-status: MISS or DYNAMIC
# Second request (within 10 min): cf-cache-status: HIT
```

Impact: TTFB drops from origin-round-trip to edge for non-EU traffic; LCP and INP both benefit.

---

## Block I — Image Optimization (biggest remaining win)

### I1 — Migrate homepage `<img>` to Next `<Image>` ⏳ (3–4 hr, code)

**Evidence (live, 2026-05-11)**: 91 homepage `<img>`, 0 with `loading="lazy"`, 0 with `srcset`, 0 with `width/height`. All served as `.jpg`, no AVIF/WebP.

**Fix path**:

1. Identify the image-grid component. Likely `apps/web/client/src/app/_components/landing-page/` or `_components/hero/`. Search:
   ```bash
   grep -rn '<img ' apps/web/client/src/app/_components apps/web/client/src/app/page.tsx | head
   ```
2. Replace each raw `<img src="..." alt="..." />` with:
   ```tsx
   import Image from 'next/image';

   <Image
     src="/assets/the___daniel_...jpg"
     alt="Minimalist Interior with Dramatic Lighting"
     width={640}
     height={800}
     sizes="(max-width: 768px) 50vw, 25vw"
     loading="lazy"             // omit on the first 1–2 (LCP)
     priority={isLcpCandidate}  // true for first 1–2 only
   />
   ```
3. Ensure `apps/web/client/next.config.ts` has `images.formats: ['image/avif', 'image/webp']` (Next default 14+).
4. For the grid, define a single sizing constant (e.g., `IMG_W=640, IMG_H=800`) to avoid 91 magic numbers.

**Verify**:
```bash
curl -s https://weblab.build/ | grep -oE 'loading="lazy"' | wc -l   # expect ≥ 89
curl -s https://weblab.build/ | grep -oE 'srcset=' | wc -l           # expect ≥ 89
```

Expected lift: LCP −0.5 to −1.2s on 4G, CLS near 0, bandwidth −40% on first paint.

### I2 — Set `priority` on LCP image only ⏳ (15 min)

Add `priority={true}` to the first hero image (or use `next/image`'s `priority` for the LCP element). All others stay `loading="lazy"`.

### I3 — Per-route OG images ⏳ (2–3 hr)

Add `apps/web/client/src/app/<route>/opengraph-image.tsx` for `/`, `/pricing`, `/features/*`, `/compare/*`, `/blog/[slug]`. Each renders a dynamic OG card. Boosts CTR on share and improves AI-search snippet quality.

---

## Block S — Schema cleanup

### S1 — Fix `SoftwareApplication.offers` ⏳ (30 min)

Current: `offers: { price: "0", priceCurrency: "USD" }` — misleading if paid plans exist on `/pricing`.

Pick one:

- **Free tier + paid tiers** → use `AggregateOffer`:
  ```ts
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'USD',
    lowPrice: '0',
    highPrice: '99',          // top plan
    offerCount: 3,
    url: 'https://weblab.build/pricing',
  }
  ```
- **Free forever** → keep current but add `priceValidUntil` and human-readable category.

File: `apps/web/client/src/app/seo.ts` `softwareApplicationSchema`.

### S2 — Canonical trailing-slash consistency ⏳ (20 min)

- Site uses no-trailing-slash (`https://weblab.build`).
- `Organization.url` and `WebSite.url` in JSON-LD use trailing slash.

Decide: enforce no-trailing-slash everywhere. In `seo.ts`, normalise:

```ts
const baseUrl = 'https://weblab.build';  // no trailing /
// Organization.url, WebSite.url, SoftwareApplication.url all use `${baseUrl}` (no /)
// Per-page URLs use `${baseUrl}${path}`
```

### S3 — `aggregateRating` once reviews exist ⏳ (manual)

Add to `SoftwareApplication` when public ratings land (G2 / Capterra / ProductHunt / Trustpilot). Use real `ratingValue` and `reviewCount`, never invented.

### S4 — `VideoObject` once demo lands ⏳ (manual)

When a hero/demo video ships, add `VideoObject` JSON-LD on `/features/builder` with `contentUrl`, `thumbnailUrl`, `duration`, `uploadDate`.

---

## Block L — Internal Linking

### L1 — Cross-link orphan blog posts ⏳ (2 hr, content)

20 `/blog/*` posts have 1 inbound link (blog index only).

Auto-pattern:
- `/compare/<x>` → link to `/blog/weblab-vs-<x>` in a "Read the comparison deep-dive" section.
- `/blog/weblab-vs-<x>` → link to `/compare/<x>`.
- `/features/builder` → link to top 3 blog posts (`best-visual-editor-react-2026`, `component-library-editing`, `design-systems-that-scale`).
- `/` → highlight 3–4 latest posts inline (changelog section already exists; add a blog teaser block).

### L2 — Add `Related posts` to `/blog/[slug]/page.tsx` ⏳ (1 hr, code)

Render 3–4 sibling posts by shared tag. Mechanical:

```ts
// in apps/web/client/src/app/blog/[slug]/page.tsx
const related = allPosts
  .filter(p => p.slug !== slug && p.tags?.some(t => post.tags?.includes(t)))
  .slice(0, 4);
```

### L3 — Fix 16 anchorless internal links ⏳ (1 hr, code)

Add `aria-label` to icon/logo `<Link>` components. Search:

```bash
grep -rn 'aria-label' apps/web/client/src/app/_components | head
grep -rn '<Link href=' apps/web/client/src/app/_components/landing-page | head
```

Most likely culprits: footer social icons, header logo link, nav button icons.

---

## Block B — Brand SERP for `weblab` (30 days)

### B1 — `Organization.sameAs` saturation 🚀 Live (GitHub + LinkedIn + YouTube + Substack)

🛠 **Add when claimed**: `@weblab` X/Twitter, ProductHunt page, Crunchbase profile, Wikidata Q-id.

### B2 — Wikidata entry 🛠 Manual (1–3 hr, free) — **biggest unlock**

1. Create Wikidata account.
2. Submit new item: label `Weblab`, description `AI visual website builder for React and Next.js teams`.
3. Properties: `instance of` (Q7397 software / Q193424 web application), `official website` (`https://weblab.build`), `founder` (Person item or string `Ludvig Hedin`), `inception` (2024), `programming language` (TypeScript), `country of origin` (Sweden), `logo image` (upload PNG to Commons first).
4. After approval, add Q-id to `Organization.sameAs` in `seo.ts`.

### B3 — `WebSite.potentialAction: SearchAction` 🚀 Live

Currently targets `/blog?q={search_term_string}`. ⏳ Verify `/blog` actually handles `?q=` query params (else SearchAction is decorative). If not, build a simple client-side filter or repoint to a real search endpoint.

### B4 — Founder content on `/about` ⏳ Manual content

Add: founder photo, 2-paragraph bio, 3–5 links to talks/articles/podcasts. `Person` schema is already wired; visible content is the gap.

### B5 — Branded backlinks burst ⏳ Manual (10–14 days)

1. **ProductHunt launch** (Tue/Wed). Pre-warm hunter list. Post-launch, add PH URL to `sameAs`.
2. **Hacker News `Show HN`** with demo or open-source slice.
3. **dev.to article** by founder, cross-posted from blog.
4. **YouTube product demo (5–8 min)** embedded on `/features/builder` and `/`. Wire `VideoObject` (see S4).
5. **2 podcast appearances** (frontend / dev-tooling shows).
6. **Guest post** on Smashing Magazine / CSS-Tricks / Frontend Mastery.
7. **GitHub repo polish** (`Ludvig-Hedin/Weblab`): README hero, topics (`weblab`, `ai-website-builder`, `visual-editor`, `react`, `nextjs`, `design-tools`), About text, website URL.

Target: +30 referring domains in 30 days.

---

## Block P — Page-1 for category terms (60–90 days)

### P1 — Strengthen `/features/builder` and `/features/ai` ⏳ Manual content

- 60–90s demo video with `VideoObject`.
- "How it compares to Webflow / Framer / v0" section linking to `/compare/*`.
- Customer-quote block (real attribution).
- 6–8 internal links to related blog posts at the bottom.

### P2 — `/website-builder` topic hub ⏳ Manual — **ASK before creating**

Long-form (1,500–2,500 words). `Article` + `BreadcrumbList` schema. Inbound from homepage secondary CTA, `/features/builder`, `/blog/best-website-builder-2026`, every `/compare/*`.

### P3 — `/visual-site-builder` page ⏳ Manual — **ASK before creating**

Exact-match for stated keyword. Title: `Visual Site Builder for React & Next.js Teams | Weblab`.

### P4 — Programmatic SEO matrix (60–80 pages) ⏳ Manual — **ASK before creating**

- `/website-builder/for/{react|next-js|vue|svelte}`
- `/website-builder/for/{designers|developers|founders|agencies|marketing-teams}`
- `/website-builder/with/{ai|git|figma|your-design-system}`

Each minimum 600 unique words, real screenshots, real testimonials.

### P5 — `/compare/<x>` deepening ⏳ Manual content (each: 1–2 hr)

For each:
- 15–25-row diff table.
- "When to choose Weblab" + "When to choose <x>" honesty section.
- Customer-quote block.
- 2-paragraph migration guide.
- `Article` JSON-LD added to existing `BreadcrumbList`.

---

## Block T — Technical polish (open items)

| Item | Status | Notes |
|---|---|---|
| T1 — AI crawlers in robots.txt | 🚀 Live | 20 agents explicit. |
| T2 — Security headers (HSTS / CSP / XFO / Permissions-Policy) | 🚀 Live | Score 100. |
| T3 — Next `<Image>` migration | ⏳ Open | See Block I. |
| T4 — Per-route OG images | ⏳ Open | See I3. |
| T5 — Hero H1 spacing | 🚀 Live | Visual `<br/>` + span. |
| T6 — `BreadcrumbList` on subpages | 🚀 Live | 15 routes wired. |
| T7 — `BlogPosting.dateModified` | 🚀 Live | From `updated` frontmatter. |
| T8 — Q&A blocks on flagship pages (AEO) | ⏳ Open | Visible Q&A on `/features/builder`, `/pricing`, `/compare/*`. AEO eligibility without FAQ schema. |
| T9 — Trailing-slash enforcement | ⏳ Open | Pick a form. Add `trailingSlash: false` to `next.config.ts` if not already, plus a CF redirect rule for old `/path/` URLs if any indexed. |
| T10 — Meta description length on `/` | ⏳ Open | Trim from 162 → ≤155 chars. |
| T11 — Twitter handle `@weblab` | ⏳ Verify | Confirm handle is claimed; unclaim from `twitter.site/creator` if not. |
| T12 — PSI rate-limit workaround | ⏳ Open | Add `GOOGLE_API_KEY` to env so CWV checks don't get throttled. |

---

## Block M — Measurement & Monitoring

| Metric | Tool | Cadence | Day-30 target | Day-90 target |
|---|---|---|---|---|
| `weblab` (brand) position | GSC | Weekly | Top 3 | #1 |
| `weblab` Knowledge Panel | manual | Monthly | Wikidata entry live | KP visible |
| `website builder` position | GSC + Ahrefs/Semrush | Weekly | Top 30 | Top 10 |
| `visual site builder` position | GSC | Weekly | Top 20 | Top 10 |
| `react visual editor` position | GSC | Weekly | Top 10 | Top 3 |
| Indexed pages | GSC > Coverage | Weekly | All 49 sitemap URLs | 80+ (after P4) |
| Referring domains | Ahrefs | Weekly | +30 | +120 |
| CWV mobile (LCP/INP/CLS) | GSC > CWV | Weekly | All Good | All Good |
| Branded CTR | GSC | Weekly | ≥4% on `weblab` | ≥10% on `weblab` |
| Bing position | Bing Webmaster Tools | Monthly | Top 10 | Top 3 |
| CF edge cache hit ratio | CF Analytics | Daily | >50% on marketing routes | >80% |

---

## Recommended 14-day order

| Day | Task |
|---|---|
| Day 0 (today) | C4a — Cloudflare Cache Rule for marketing routes. T10 — trim meta description. T11 — verify `@weblab` handle. |
| Day 1–2 | I1 — Next `<Image>` migration on homepage grid. I2 — `priority` on LCP. Verify with `loading="lazy"` count. |
| Day 3 | S1 — fix `SoftwareApplication.offers`. S2 — trailing-slash canonical consistency. |
| Day 4 | L1 + L2 — cross-link orphans, Related posts on `/blog/[slug]`. |
| Day 5 | L3 — `aria-label` on anchorless links. B2 — submit Wikidata entry. |
| Day 6 | B5 step 7 — GitHub repo README/topics/about. |
| Day 7 | I3 — per-route OG images (start with `/`, `/pricing`, `/features/builder`, `/compare/lovable`). |
| Day 8 | T8 — Q&A blocks on `/features/builder` + `/pricing` + 2 `/compare/*`. |
| Day 9–10 | P5 — deepen 3 highest-traffic `/compare/*` pages. |
| Day 11–12 | P1 — flagship `/features/builder` enrichment + demo video. |
| Day 13 | B5 step 1 — ProductHunt launch schedule. |
| Day 14 | Re-run audit. `seo audit` against production. Compare scores. |

---

## What success looks like

- **Day 0–7**: CWV all-Good in GSC (after I1). CF cache hit ratio >50%. Single canonical + 1 H1 on every page (already true).
- **Day 30**: `weblab` ≤3 brand position. Wikidata Q-id propagating. +30 referring domains. All 49 sitemap URLs indexed.
- **Day 90**: `weblab` #1 with Knowledge Panel. `visual site builder` and `react visual editor` page-1. `website builder` top-15 (head term takes 6–12 months — see caveat).

---

## Caveat on "Website builder"

Head term dominated by Wix, Squarespace, GoDaddy, Hostinger, Webflow, Shopify. Realistic page-1 timeline **6–12 months**. Achievable adjacent wins in 90 days: `visual site builder`, `visual website builder`, `react visual editor`, `ai website builder for react`, `website builder for existing codebase`, `figma to react workflow`, and all `weblab vs <competitor>` queries. Concentrate effort there first; head term compounds from niche wins.
