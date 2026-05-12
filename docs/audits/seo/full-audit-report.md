# Weblab — Full SEO Audit Report (2026-05-11)

- **Site**: https://weblab.build
- **Audit date**: 2026-05-11
- **Audit type**: Full-site re-audit (homepage deep + sitewide signals + verification of prior fixes)
- **Method**: LLM-first analysis backed by `fetch_page`, `parse_html`, `robots_checker`, `llms_txt_checker`, `security_headers`, `redirect_checker`, `social_meta`, `broken_links`, `readability`, `internal_links`. Live HTTP verification via `curl` on production.
- **Prior audit**: 2026-05-09 (Block C/T/S/B fixes staged). This re-audit verifies which ones landed in production.

---

## 0. Headline

Prior staged fixes are **live in production**. Confirmed by live HTTP/HTML inspection on 2026-05-11:

| Prior critical | Status (today, live) |
|---|---|
| C1 — Single canonical per page | 🚀 **Deployed** — `/`, `/pricing`, `/compare/lovable`, `/features/builder`, `/blog/best-website-builder-2026` each return exactly **1** `rel="canonical"` |
| C2 — Fake `aggregateRating` removed | 🚀 **Deployed** — homepage JSON-LD now only emits Organization + WebSite + SoftwareApplication |
| C3 — Brand-entity enrichment on Organization | 🚀 **Deployed** — `@id`, `legalName`, `alternateName[]`, `slogan`, `foundingDate`, `founders[]`, `numberOfEmployees`, `address`, `contactPoint`, full `sameAs[]` all present |
| C4 — Cache-Control on marketing HTML | 🚀 **Deployed** — `cache-control: public, max-age=0, s-maxage=600, stale-while-revalidate=86400` (⚠️ `cf-cache-status: DYNAMIC` — CF zone caching rule still missing) |
| C5 — Single H1 per page | 🚀 **Deployed** — `/about`, `/features`, `/features/prototype` all return exactly 1 `<h1>` |
| C6 — Footer Contact 404 via CF Email Obfuscation | 🚀 **Deployed** — no `cdn-cgi/l/email-protection` and no `mailto:` on homepage/about/pricing |
| T1 — AI crawlers explicit in robots.txt | 🚀 **Deployed** — explicit rules for 20 agents |
| T2 — `X-Frame-Options: SAMEORIGIN` + full security header set | 🚀 **Deployed** — security score 100/100 |

Remaining open from prior plan: **T3 (Next `<Image>` migration)** is still not done — 91/91 homepage `<img>` tags lack `loading`, `srcset`, `width/height` attributes.

---

## 1. Scoring Summary (LLM-weighted, 0–100)

> Canonical weights per `SKILL.md`. Performance row marked N/A — PSI rate-limited this run.

| Category | Weight | Score | Notes |
|---|---|---|---|
| Technical SEO | 25% | **94** | Robots, sitemap (49 URLs), canonical (1/page), HSTS, full CSP, XFO, redirects clean. Only soft gap: CF edge cache still `DYNAMIC`. |
| Content Quality | 20% | **80** | 1,877 words on homepage, clear ICP framing. Flesch 32.1 (very difficult, college-level). |
| On-Page SEO | 15% | **90** | Title 50ch ✓, meta description 162ch (2 over the 160 soft cap), H1 unique, H2/H3 hierarchy fine. |
| Schema / Structured Data | 15% | **92** | Organization + WebSite + SoftwareApplication globally; BreadcrumbList on subpages. Price `0` USD on SoftwareApplication is misleading vs `/pricing`. |
| Performance (CWV) | 10% | N/A | **Environment limit:** PageSpeed Insights API rate-limited during the run (confidence: Hypothesis). |
| Image Optimization | 10% | **45** | 91 homepage images, 91 with descriptive alt ✓, **0 with `loading="lazy"`**, 0 with `srcset`, 0 with `width/height`. Still raw `<img>` tags. |
| AI Search Readiness (GEO) | 5% | **96** | `llms.txt` + `llms-full.txt` both 200; full AI-crawler allowlist; `inLanguage: en`; SearchAction in WebSite. |

**Weighted total (excl. CWV):** ≈ **85 / 100 — Good** with one large fixable gap (images) and a few cleanup items.

Severity legend: 🔴 Critical · ⚠️ Warning · ✅ Pass · ℹ️ Info.

---

## 2. Critical Findings

**None.** No critical, indexing-blocking, or ranking-destructive issues observed today.

---

## 3. Warnings

| # | Element | Evidence | Impact | Confidence |
|---|---|---|---|---|
| W1 | Image lazy-loading | All **91** `<img>` on homepage have no `loading` attribute (`loading=null` in `parse.json`); live HTML: `loading="lazy"` count = 0, `srcset` count = 0 | LCP and bandwidth penalty on mobile; CLS risk from missing dimensions | Confirmed |
| W2 | Image dimensions | All sampled images have `width: null, height: null` | CLS risk; aspect-ratio reservation missing | Confirmed |
| W3 | Cloudflare edge cache still bypassing | Origin returns `cache-control: public, max-age=0, s-maxage=600, stale-while-revalidate=86400` but `cf-cache-status: DYNAMIC` on `/` and `/pricing` | Every request still reaches Railway origin; TTFB/LCP miss the edge win you paid for | Confirmed |
| W4 | Meta description length | Homepage meta is 162 chars (Google soft-truncates ~155–160) | Possible SERP truncation; minor | Confirmed |
| W5 | `SoftwareApplication.offers.price` = `"0"` USD | JSON-LD declares free offer but `/pricing` is in the sitemap as a real page | Misleading offer markup; Google may strip or distrust offer rich-result eligibility | Likely |
| W6 | Canonical trailing-slash inconsistency | `<link rel="canonical">` = `https://weblab.build` (no `/`), but `Organization.url` and `WebSite.url` = `https://weblab.build/` | Cosmetic; Google normalises, but pick one form | Confirmed |
| W7 | Anchor-less internal links | `internal_links.py` reports 16 internal links with no anchor text | Wasted ranking signal; usually icon/logo links missing `aria-label` | Confirmed |
| W8 | Blog post incoming-link depth | 20 `/blog/*` posts have only 1 incoming internal link each (the blog index) | Pages get indexed via sitemap but starve for internal equity; weak hub→spoke flow | Confirmed |
| W9 | Comparison/workflow hub interlinking | 14 `/compare/*` and 3 `/workflows/*` pages exist in sitemap; homepage exposes few of them in contextual anchors | Misses ranking lift on `weblab vs <competitor>` queries that are highly intent-rich | Likely |
| W10 | Readability | Flesch reading ease 32.1 (very difficult, college-level); avg sentence length 24.9 words | Lowers engagement and AI-snippet extraction quality | Confirmed |
| W11 | Homepage Twitter handle | Metadata sets `twitter:site` and `twitter:creator` = `@weblab` | If handle is not claimed/owned, Twitter strips card and value is wasted | Hypothesis |

---

## 4. Passes (confirmed live today)

| # | Element | Evidence |
|---|---|---|
| P1 | HTTPS + HSTS | `strict-transport-security: max-age=31536000; includeSubDomains` |
| P2 | Complete CSP | `default-src 'self'; …; frame-ancestors 'self'; object-src 'none'` |
| P3 | `X-Frame-Options: SAMEORIGIN` + `X-Content-Type-Options: nosniff` + `Referrer-Policy: strict-origin-when-cross-origin` + `Permissions-Policy` | All present, security score 100 |
| P4 | Robots.txt | 200, sitemap reference, sensible disallow set (`/api/`, `/auth/`, `/projects/`, `/design-system`) |
| P5 | AI-crawler policy | Explicit allow/disallow per agent: Googlebot, Bingbot, DuckDuckBot, GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, anthropic-ai, Claude-Web, PerplexityBot, Perplexity-User, Applebot, Applebot-Extended, Google-Extended, CCBot, cohere-ai, Meta-ExternalAgent, FacebookBot, Bytespider, Diffbot |
| P6 | Sitemap | `/sitemap.xml` 200, 49 URLs, valid lastmod (2026-05-09), sane priorities |
| P7 | llms.txt + llms-full.txt | Both 200; structured Core Pages / Workflows / Comparisons / Blog sections |
| P8 | Title tag | 50 chars: `Weblab - AI Visual Website Builder for React Teams` |
| P9 | Canonical present + 1/page | Verified on `/`, `/pricing`, `/compare/lovable`, `/features/builder`, `/blog/best-website-builder-2026` |
| P10 | OG + Twitter | All required tags present, `summary_large_image`, 1200×630 image with alt |
| P11 | JSON-LD | 2 blocks on `/` (Org + WebSite + SoftwareApp inside; 2 script tags), 3 on `/pricing`, 3 on `/features/builder` |
| P12 | No redirect chain on root | 0 hops, direct 200 in ~400ms |
| P13 | No broken internal links | `broken_links.py`: 0/21 broken |
| P14 | Robots meta | `index, follow` |
| P15 | Single H1 per page | Confirmed on `/`, `/about`, `/features`, `/features/prototype` |
| P16 | All images have descriptive alt | 91/91 on homepage |
| P17 | Word count | 1,877 words on homepage |
| P18 | Cache-Control header set on marketing routes | `public, max-age=0, s-maxage=600, stale-while-revalidate=86400` (now needs CF cache rule to actually cache) |

---

## 5. Info / Not Applicable

| # | Element | Note |
|---|---|---|
| I1 | Hreflang | Empty array; single-locale (`en`) site — appropriate. Add only if expanding to a second language/market. |
| I2 | FAQPage schema | Visible FAQ section on page; FAQPage rich-results restricted to gov/healthcare since 2023-08 — **do not add**. |
| I3 | HowTo schema | Deprecated 2023-09 — **do not add**. |
| I4 | Core Web Vitals | **Environment limit** — PSI API rate-limited. Re-run with `GOOGLE_API_KEY` or check Search Console field data directly. |
| I5 | CSP `unsafe-inline`/`unsafe-eval` for scripts/styles | Security hygiene note, not SEO. |
| I6 | `cf-cache-status: DYNAMIC` despite cacheable headers | Cloudflare zone needs a Cache Rule (Rules → Cache Rules) to honour origin `s-maxage` for marketing paths. Origin is doing its part; CF policy is the gap. |

---

## 6. Schema Detail

**Organization** — comprehensive: `@id` (entity unification), `legalName`, 3 `alternateName`, `slogan`, `description`, `foundingDate: 2024`, `founders[Person]` with LinkedIn `sameAs`, `numberOfEmployees`, `address` (SE), `contactPoint` (support@weblab.build), `image`, full `logo` ImageObject, `sameAs[]` (GitHub + LinkedIn + YouTube + Substack).

**WebSite** — `@id`, `inLanguage: en`, `publisher → @id Organization`, `potentialAction: SearchAction` targeting `/blog?q={search_term_string}`.

**SoftwareApplication** — globally injected. `applicationCategory: DeveloperApplication`, `applicationSubCategory: Website Builder`, `operatingSystem: Web, macOS, Windows, Linux`, `featureList[10]`, `creator/publisher → @id Organization`. **Issue:** `offers.price: "0"` USD `availability: InStock` — confirm against `/pricing`. Recommendation: switch to `AggregateOffer` with `lowPrice` (free tier) and `highPrice` (top plan), or move offer markup to a `Product`-typed entity scoped to the pricing page.

Missing-but-useful: `aggregateRating` once you have public reviews (G2, Capterra, ProductHunt, Trustpilot). `VideoObject` once a demo lands on `/features/builder`.

---

## 7. Content & E-E-A-T

- Founder named (`Ludvig Hedin`), LinkedIn `sameAs`, jobTitle — **Experience/Authoritativeness** signals present.
- Address country (SE), customer-support email — **Trust** signal present.
- Programmatic content depth: ~20 blog posts, 14 `/compare/*` pages, 3 `/workflows/*` pages, 5 `/features/*` pages — strong topical breadth.
- Open gaps:
  - Author bios on `/blog/[slug]` (LinkedIn URL, headshot, short bio block).
  - Customer quotes/testimonials with real attribution on flagship pages.
  - Wikidata entity for `Weblab` — single largest unlock for a Knowledge Panel on the brand SERP.

---

## 8. Internal Linking

| Metric | Value |
|---|---|
| Pages crawled (depth 1 from `/`) | 16 |
| Unique internal pages found | 39 |
| Total internal links | 292 |
| Avg internal links per page | 18.2 (min 3 · max 39) |
| Orphan candidates (≤1 inbound) | **20** (all blog posts) |
| Anchorless links | 16 |
| Nofollow links | 0 |

**Top anchor concentrations**: Footer-dominated — `Terms of Service` ×16, `Privacy Policy` ×16, `Sign In` ×14, `About` ×14, `Blog` ×14, `Features` ×14, `Pricing` ×14, `AI` ×14. Footer is doing the heavy lifting; in-content links are sparse.

**Action**: add a `Related posts` block to `/blog/[slug]/page.tsx` (3–4 sibling posts), auto-link `/blog/weblab-vs-<x>` from `/compare/<x>` and vice versa, and add 6–8 contextual links from `/features/builder` into top blog posts and `/compare/*`.

---

## 9. Performance (Inferred — confidence: Hypothesis)

PSI API rate-limited. Inferred-only signals:

- Origin TTFB ~400ms on cold root request from this machine (well under 600ms target).
- `cf-cache-status: DYNAMIC` means **all** repeat requests are still hitting the origin. Cloudflare cache rule is the single biggest perf win left, separate from the image work.
- 91 raw `<img>` without lazy/srcset/dimensions = LCP and CLS risk on mobile, especially for the image-grid section below the fold.

Re-run when not rate-limited:
```bash
python3 ~/.claude/skills/seo/scripts/pagespeed.py https://weblab.build --strategy mobile --json
```

---

## 10. Verification Commands (run against production)

```bash
# 1. Single canonical per page
for p in / /pricing /compare/lovable /features/builder /blog/best-website-builder-2026; do
  n=$(curl -s "https://weblab.build$p" | grep -c 'rel="canonical"')
  echo "canonicals=$n on $p (expect 1)"
done

# 2. JSON-LD blocks
for p in / /pricing /features/builder; do
  n=$(curl -s "https://weblab.build$p" | grep -c 'application/ld+json')
  echo "ld+json=$n on $p (expect >=2)"
done

# 3. AI crawlers in robots
curl -s https://weblab.build/robots.txt | grep -E 'GPTBot|ClaudeBot|PerplexityBot|Google-Extended' | head -4

# 4. Security headers
curl -sI https://weblab.build/ | grep -iE 'strict-transport|x-frame|x-content-type|content-security-policy' | head -5

# 5. Cache-Control + CF cache status
curl -sI https://weblab.build/pricing | grep -iE 'cache-control|cf-cache-status'

# 6. Single H1 per page
for p in / /about /features /features/prototype; do
  n=$(curl -s "https://weblab.build$p" | grep -c '<h1')
  echo "h1=$n on $p (expect 1)"
done

# 7. Image-attribute coverage on homepage
curl -s https://weblab.build/ | grep -oE 'loading="lazy"' | wc -l   # expect 91 after T3
curl -s https://weblab.build/ | grep -oE 'srcset=' | wc -l           # expect 91 after T3

# 8. Sitemap
curl -sI https://weblab.build/sitemap.xml | head -3
```

---

## 11. Environment Limitations

- **PageSpeed Insights**: API rate-limited — CWV (LCP/INP/CLS) not captured in this run. Re-run with `GOOGLE_API_KEY` or fetch from GSC.
- **Visual analysis** (Playwright screenshots, above-the-fold checks) not executed.
- **Indexation status** (Search Console coverage report) not accessible from this environment.

Findings are otherwise grounded in directly observed HTTP responses and parsed HTML.

---

## 12. Score Interpretation

| Score | Rating |
|-------|--------|
| 90-100 | Excellent |
| 70-89 | Good ← Weblab sits here (~85) |
| 50-69 | Needs Improvement |
| 30-49 | Poor |
| 0-29 | Critical |

See `ACTION-PLAN.md` for prioritised fixes.
