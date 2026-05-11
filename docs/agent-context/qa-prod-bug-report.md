# Production QA Bug Report — weblab.build

**Date:** 2026-05-11
**Tester:** Claude (headless Chromium via `gstack browse`)
**Scope:** Public marketing surface, auth flow, responsive (1440×900 desktop, 375×812 mobile).
**Not covered:** Authenticated app (`/projects`, editor, AI chat). Requires user OAuth handoff.

---

## CRITICAL — visible to every visitor

### BUG-1 — User-facing red error banner on landing hero

**Where:** `https://weblab.build/` hero section.
**What user sees:** Red text inside hero: `Error loading scene` / `Cannot set properties of undefined (setting 'id')`.
**Root cause:** UnicornStudio (`https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.33/dist/unicornStudio.umd.js`) WebGL init fails; the error message is rendered as fallback DOM content instead of being suppressed.
**Console trail:**
```
UnicornScene error: Error: Cannot set properties of undefined (setting 'id')
Unicorn.studio was unable to create WebGL context
TextureLoader: Renderer WebGL context is undefined
```
**Impact:** Any visitor whose browser fails WebGL (older Chromebooks, hardware-acceleration off, in-app browsers, headless) sees raw JS error text where the hero scene should be.
**Fix path:** Catch failure in the UnicornScene component, render nothing or a static fallback image instead of the error string.
**Evidence:** `/tmp/qa-hero.png`, `/tmp/qa-mobile-hero.png`

---

### BUG-2 — Pricing "Get Started Free" button invisible (dark text on dark bg)

**Where:** `/pricing`, Free tier card.
**What user sees:** Empty dark pill where the CTA should be.
**Computed style:**
- `color: rgb(26, 26, 26)` (near-black #1A1A1A)
- `background-color: oklab(0.268502 ... / 0.3)` (dark grey, 30% opacity)
- Page background: dark.
**Diagnosis:** Button is using the shadcn `outline`/`ghost` variant (`bg-background hover:bg-accent`) which expects a light surface. The token does not invert under the dark theme on this page.
**Impact:** The primary CTA for the Free tier is illegible. Conversions for the free plan are likely zero on this page.
**Evidence:** `/tmp/qa-pricing-hero.png` — the empty rounded rectangle below `$0/month`.
**Likely fix:** Replace variant with `default` / `primary`, or add a dark-mode color override.

---

### BUG-3 — `/docs` and `/contact` return 404

**Where:**
- `https://weblab.build/docs` → renders `404` (H1: "4\n0\n4"). Footer link is `https://docs.weblab.build` (external subdomain, fine), but typed/shared `weblab.build/docs` 404s with no redirect to the subdomain.
- `https://weblab.build/contact` → 404. Footer "Contact" exists only as a non-functional `<button>` (clicking it does nothing — no modal, no `mailto:`, no navigation).
**Impact:** Dead footer link path on `/contact` button; broken UX for users who guess `/docs`.
**Fix path:**
- Redirect `/docs` → `https://docs.weblab.build` (Next.js `redirects()` in `next.config.js`).
- Either wire the Contact button to a modal/mailto, or make it a link to a real `/contact` route, or remove it.

---

### BUG-4 — `<title>` duplicated `| Weblab | Weblab` on almost every page

**Examples:**
| Path | Current `<title>` |
|------|-------------------|
| `/blog` | `Blog \| Weblab \| Weblab` |
| `/changelog` | `Changelog \| Weblab \| Weblab` |
| `/faq` | `FAQ \| Weblab - AI-Powered Visual Editor for Frontend Development \| Weblab` |
| `/features` | `Features \| Weblab — AI Visual Editor for React Teams \| Weblab` |
| `/pricing` | `Pricing \| Weblab — Visual Editor for React \| Weblab` |
| `/terms-of-service` | `Terms of Service \| Weblab \| Weblab` |
| `/privacy-policy` | `Privacy Policy \| Weblab \| Weblab` |
| `/site-map` | `Sitemap \| Weblab \| Weblab` |
| `/workflows` | `Workflows \| Integrate Weblab with Claude Code, Cursor & AI Coding Tools \| Weblab \| Weblab` (TRIPLE) |
| `/blog/best-visual-editor-react-2026` | `Best Visual Editors for React in 2026 \| Weblab Blog \| Weblab` |

**Root cause:** Per-page metadata already contains `| Weblab` (or `| Weblab Blog`); the root layout `metadata.title.template` appends ` | Weblab` again.
**Impact:** SEO ranking penalty, ugly browser tab labels, social-share previews.
**Fix path:** Either drop `| Weblab` from each page's per-page title, or change the root template from `'%s | Weblab'` to `'%s'` and keep per-page strings as-is.

---

### BUG-5 — Free-tier credits copy is self-contradicting

**Where:** `/pricing` Free tier bullets.
**Reads:**
- "5 AI credits a day"
- "15 AI credits a month"

5/day × 30 = 150/month, not 15. One of the two is wrong. If daily is the cap, monthly bullet is wrong. If monthly is the cap, "5/day" misleads.
**Fix path:** Decide the real policy and remove the contradiction.

---

### BUG-6 — `/download` page contradicts its own `<title>`

**Where:** `/download`.
**Title:** `Download Weblab | Mac, Windows, Linux & iOS | Weblab`
**Actual content:** Only **macOS** (DMG) + **iOS** ("Coming soon"). No Windows, no Linux.
**Impact:** False advertising in tab/SEO; users on Windows/Linux who land there hit a dead end.
**Fix path:** Either ship the missing builds, or remove "Windows, Linux" from the title and any nav/SEO copy.

---

## HIGH — visible but lower blast radius

### BUG-7 — Login page is light-themed; rest of site is dark

**Where:** `/login`, `/login/verify`.
**Behavior:** Whole login flow renders with light background while every other route uses the dark theme. Jarring transition on first click.
**Evidence:** `/tmp/qa-login.png`
**Fix path:** Apply the same `ThemeProvider` defaults to the auth routes, or commit to one theme per the brand.

---

### BUG-8 — Login "Continue with email" enables on any string

**Where:** `/login` email field.
**Repro:** Type `not-an-email` → "Continue with email" becomes enabled → click submits → silent failure (no visible toast, no inline error). Snapshot shows an empty `[alert]` region appears momentarily then disappears.
**Fix path:** Add client-side email format validation (regex or `<input type="email">` `:invalid`). Keep button disabled until valid. Render a persistent error on failed submit instead of an empty alert region.

---

### BUG-9 — Mobile menu has theme + layout glitches

**Where:** `weblab.build` at 375×812 → tap hamburger.
1. Menu panel renders in **light theme** over dark site.
2. Expanding "Product" causes its submenu (which includes "Claude Code") to **overflow under the next collapsed header "Resources"** — visual overlap, last submenu item is unreadable.
3. **No "Sign In" affordance** in the mobile menu — only "Get Started". Desktop has Sign In in the top bar; mobile users must guess.
**Evidence:** `/tmp/qa-mobile-menu.png`, `/tmp/qa-mobile-menu-expanded.png`
**Fix path:** Match menu theme to global theme, cap submenu height (or push sibling sections down), add Sign In to the mobile footer of the menu.

---

### BUG-10 — Anonymous tRPC calls log errors as `error` level

**Where:** Every public page including `/`, `/blog/*`.
**Behavior:** `user.get` and `provider.connectionsList` fire on first paint for unauthenticated visitors and log
```
TRPCClientError: UNAUTHORIZED  (query: user.get)
TRPCClientError: UNAUTHORIZED  (query: provider.connectionsList)
```
at `console.error` level.
**Why it matters:** Pollutes Sentry / browser-DevTools dashboards. Treating an expected anon state as an error makes real auth failures invisible. Also: why is the marketing site issuing these queries at all on `/`?
**Fix path:**
- Don't fire `user.get`/`provider.connectionsList` from the marketing root layout when there's no session cookie.
- If they must fire, swallow `UNAUTHORIZED` and log at `info`/`debug` so it is not "error".

---

### BUG-11 — `PostHog key is not set` warning on every page

**Where:** Every page console.
**Log:** `[warning] PostHog key is not set, skipping initialization`
**Impact:** Production analytics is silently off. Either the env var is missing from Railway, or PostHog was removed and the initialization stub was left behind.
**Fix path:** Set `NEXT_PUBLIC_POSTHOG_KEY` in Railway env or remove the PostHog init call.

---

### BUG-12 — Modal copy mismatches the CTA that opened it

**Where:** Landing → "Clone a website" / "Import from GitHub" / "Import folder".
**Behavior:** All three open the same modal titled `Sign in to edit`. The CTA promised "clone" / "import", but the modal copy is the editor sign-in copy.
**Fix path:** Either parametrise the modal heading per CTA ("Sign in to clone", "Sign in to import"), or use a single generic verb like "Sign in to continue".

---

## MEDIUM — polish / SEO / consistency

### BUG-13 — Hero H1 outline-style text has near-zero contrast

**Where:** `/` hero `H1: Design on your real codebase. Ship a real PR.` and `/download` H1 `Download Weblab`.
**Behavior:** Heading rendered as faint outline (probably a text-stroke or low-opacity gradient effect). On the landing it is meant to be revealed by the WebGL scene fading in, so when the scene fails the headline is unreadable. On `/download` the same effect is used without the WebGL prop, so it's just permanently faint.
**Evidence:** `/tmp/qa-hero.png`, `/tmp/qa-download.png`
**Fix path:** Either guarantee the scene loads (BUG-1) or use a solid heading with the effect layered on top (so failure falls back to readable text). On `/download` the effect should be removed since there's no animated reveal.

---

### BUG-14 — `Version 0.1.0` on login page conflicts with `v1.7` everywhere else

Landing changelog claims `v1.7 May 10, 2026`. Login page footer reads `Version 0.1.0`.
**Fix path:** Wire the login page footer to the same package version source as the rest of the app, or remove it.

---

### BUG-15 — "For Teams" section on `/pricing` duplicates Enterprise

The three-tier table already has `Enterprise — Custom pricing — Contact Us`. The "For Teams" block below repeats the proposition with a second `Contact us` CTA. Reads as accidental duplication.
**Fix path:** Decide whether For Teams is a separate plan (then differentiate copy) or fold it into Enterprise.

---

### BUG-16 — Empty `<select>` and email-input render with no placeholder text on `/pricing`

Pro tier shows an empty pill next to "Get Started" (the credit-tier dropdown — selected value not rendered visually although DOM says "100 Credits per Month"). "For Teams" shows an empty input pill next to "Get Started" (email input with no placeholder).
**Fix path:** Pro dropdown: ensure the selected value renders. For Teams: add `placeholder="you@company.com"` or a label.

---

### BUG-17 — `/changelog` ARIA / DOM structure has no `<article>` entries

DOM query `article, [class*=changelog]` returns 0 nodes — the entries are rendered with no semantic container. Acceptable visually, but bad for screen readers and for any structured-data tooling.

---

## LOW — noted, not blockers

- **GPU stall warning:** `[.WebGL-0x...] GL Driver Message ... GPU stall due to ReadPixels` on landing. Probably the WebGL scene fighting itself. Not user-visible.
- **Auth-route redirect query string:** `/projects` (unauth) redirects to `/login?returnUrl=%2Fprojects` — correct, mentioning here for completeness.
- **Sitemap completeness:** Sitemap includes `/compare/*` but the footer/nav doesn't link them. They're indexable but invisible. Not a bug, but a missed funnel.
- **OTP page resend timer:** 60s countdown disables the button correctly, but `/login/verify` shows a generic `Token has expired or is invalid` inline message that appears *before the user submits* (it surfaces from a server-side state, not a click). Confusing on first load. Worth investigating.

---

## What was NOT tested (needs follow-up)

These all require authenticated access:

- `/projects` (project list)
- Editor: AI chat (TipTap composer), canvas, sandbox iframe
- New project flow: Clone website / Import GitHub / Import folder / Start blank
- Publish flow / custom domain
- Stripe checkout (`/pricing` → upgrade)
- Settings / billing / team
- Mobile menu Resources/About sections (they did not expand on first click — could not confirm if content exists)
- Real "Sign in with GitHub" / "Sign in with Google" OAuth round-trip

**Recommended next step:** run `$B handoff` so the user can OAuth in their real Chrome, then `$B resume` and I'll walk the authenticated flows: editor, AI chat, GitHub import, publish, billing.

---

## Files (screenshots referenced)

```
/tmp/qa-landing.png
/tmp/qa-hero.png
/tmp/qa-login.png
/tmp/qa-otp.png
/tmp/qa-download.png
/tmp/qa-download-full.png
/tmp/qa-pricing.png
/tmp/qa-pricing-hero.png
/tmp/qa-mobile-landing.png
/tmp/qa-mobile-hero.png
/tmp/qa-mobile-menu.png
/tmp/qa-mobile-menu-expanded.png
/tmp/qa-features-hero.png
/tmp/qa-about-hero.png
/tmp/qa-faq.png
/tmp/qa-clone.png
/tmp/qa-product-hover-clean.png
/tmp/qa-product-keyboard.png
/tmp/qa-chat-submit.png
/tmp/qa-404.png
/tmp/qa-mobile-resources.png
```

---

# Round 2 — Additional Findings (2026-05-11, same session)

## CRITICAL

### BUG-18 — `flow-background.json` refetched 162× per landing visit

**Where:** `https://weblab.build/` (landing only).
**Behavior:** `performance.getEntriesByType('resource')` for `flow-background.json` after ~4s on landing returns **162 entries**. Same file, same URL, hit over and over.
**Root cause:** UnicornStudio retry loop (BUG-1). WebGL init fails → scene attempts to reinitialise → fetches the JSON config → fails again → repeat with no backoff.
**Impact:**
- Massive server log noise and bandwidth on every visitor whose WebGL fails.
- Burns CPU on the client (each retry runs through the create-plane code path).
- Inflates request count for Vercel/Railway analytics, can trip rate limits.
**Repro:**
```js
performance.getEntriesByType('resource').filter(e => /flow-background/.test(e.name)).length
// → 162 after 4s on landing
// → 0 on /pricing, /download, anywhere else
```
**Fix path:** Cap retry attempts (e.g., `MAX_RETRIES = 3`), or detect WebGL availability before mounting UnicornScene and skip mount when unsupported.

---

### BUG-19 — Desktop header dropdowns (Product/Resources/About) inaccessible by keyboard

**Where:** Every page, top nav.
**Behavior:**
- Hovering "Product" with a mouse opens the submenu (8 sublinks, works).
- The trigger button has **no** `aria-expanded`, **no** `aria-haspopup`, **no** `role`, **no** `data-state` attribute.
- Tab order skips the button on first nav (Tab1=Logo, Tab2=GitHub icon, Tab3=Resources, Product not landed via plain Tab from logo).
- Pressing Enter on a focused dropdown trigger does NOT open the submenu (0 sublinks reachable).
**Impact:** Screen reader users have no idea these are interactive. Keyboard-only users can't reach `/features/*` or `/workflows/*` from the nav. WCAG 2.1.1 + 4.1.2 violation.
**Fix path:** Replace the raw `<button>` with a Radix `NavigationMenu` trigger (which sets `aria-expanded`, `aria-haspopup`, supports keyboard activation), or add the attributes + keypress handler manually.

---

### BUG-20 — Invisible "Build" buttons on `/features` (same dark-on-dark issue as BUG-2)

**Where:** `/features` (and likely others using the same component).
**Computed style:** `color: rgb(26, 26, 26)`, `background-color: rgba(0, 0, 0, 0)` (transparent) on a dark page. Contrast delta ≈ 78 — well below WCAG AA.
**Same root cause** as BUG-2: shadcn outline-variant token is light-mode only, not inverting under the dark theme.
**Fix path:** One token fix likely solves both. Add `dark:bg-foreground dark:text-background` to the variant, or use `default` variant instead.

---

## HIGH

### BUG-21 — `/faq` has two `<h1>` elements

**Where:** `/faq`
**H1s:** `"Weblab Frequently Asked Questions"` and `"Frequently Asked Questions"` (the second from a section header rendered as H1 instead of H2).
**Impact:** SEO confusion + a11y outline misordered.
**Fix path:** Downgrade the second to `<h2>`.

---

### BUG-22 — No cookie / consent banner anywhere

**Where:** Entire site.
**Behavior:**
- No banner offered on first visit.
- No `cookie`/`consent`/`gdpr` UI string in any DOM I queried.
- Supabase auth cookie `sb-...-code-verifier` is set just by clicking "Sign in with GitHub" (before any consent).
**Risk:** EU/UK visitors → GDPR + ePrivacy Directive non-compliance. Even if PostHog is currently off (BUG-11), auth cookies are subject to consent rules in some jurisdictions.
**Note:** Privacy Policy page exists (`/privacy-policy`, 8,301 chars, mentions consent/cookie/GDPR 5×) — the *policy* is there, just no *enforcement UI*.
**Fix path:** Add a consent banner (e.g., `react-cookie-consent`, Cookiebot, or roll your own) gated on EU IP detection or shown to all.

---

### BUG-23 — Hero preloads 10+ large mockup JPEGs

**Where:** `/` (landing).
**Behavior:** 15 `<link rel="preload">` tags total; 10 of them are the "Villainterest" mockup screenshots (`/assets/the___daniel_*.jpg`, 18–77 KB each). These are below-the-fold demo art.
**Impact:** Preloads block higher-priority resources (fonts, JS chunks). On slow connections this delays first paint and Largest Contentful Paint.
**Fix path:** Remove `rel="preload"` from decorative below-the-fold images. Use `loading="lazy"` instead and let the browser fetch them on scroll.

---

### BUG-24 — Login OAuth `returnUrl` hardcoded to `/projects/new?resumeCreate=1`

**Where:** `/login` → "Sign in with GitHub" / "Sign in with Google".
**Behavior:** OAuth state encodes `returnUrl=%2Fprojects%2Fnew%3FresumeCreate%3D1` even when the user navigated to `/login` directly (no prompt, no `?returnUrl`).
**Repro:**
1. Clear cookies.
2. Visit `https://weblab.build/login`.
3. `localStorage` is empty.
4. Click "Sign in with GitHub" → URL contains `redirect_to=...auth/callback?returnUrl=%2Fprojects%2Fnew?resumeCreate=1`.
**Why it's a bug:** A user who arrives at `/login` from a footer link, a bookmark, or a "Sign In" header click expects to land at `/projects`, not at the new-project resume flow. The `resumeCreate=1` flag is meant for visitors who started a prompt on landing and were intercepted by the auth modal.
**Fix path:** Default `returnUrl` to `/projects` when the login page has no explicit `?returnUrl=` query param.

---

## MEDIUM

### BUG-25 — Compare page titles inconsistent (missing trailing `| Weblab`)

**Where:** `/compare/*` (lovable, bolt, v0, webflow, framer, replit, claude-code, emergent, wix, one-com, onlook).
**Behavior:** None of the per-comparison titles include the `| Weblab` suffix. `/compare` itself does. Every other section of the site does. SEO inconsistency.
```
/compare        → "Weblab vs ... | Weblab"   ✓
/compare/lovable → "Weblab vs Lovable — ..." (no | Weblab)
```
**Fix path:** Either drop ` | Weblab` from every title (BUG-4 fix) or add it here for consistency.

---

### BUG-26 — `/site-map` content blocks duplicated

**Where:** `/site-map`.
**Behavior:** The page renders a short intro list at the top with sections (Main Pages / Features / Workflows), then a full SECTIONS list below repeating the same nodes with longer descriptions. Two passes through the same data.
**Impact:** Looks like a template-render mistake; user scrolls through redundant content.
**Fix path:** Remove the top short-list block, keep only the canonical SECTIONS list.

---

### BUG-27 — Mobile hero: chat textarea overlaps the red "Error loading scene" banner

**Where:** Mobile (375×812) landing.
**Behavior:** With the WebGL failure (BUG-1) emitting "Error loading scene" inside the hero, the chat input below it sits with the error banner visually colliding behind/under the input. Stacking order is wrong and the typed prompt overlaps the error string.
**Evidence:** `/tmp/qa-mobile-resources.png` shows the pizza-shop prompt overlapping the red error text.
**Fix path:** Fixing BUG-1 (don't render error string) removes this. Until then, give the input a higher z-index or hide the error region on small viewports.

---

### BUG-28 — Anonymous prompt persists in chat box across full reload but not in storage

**Where:** Landing chat input (TipTap).
**Behavior:** Typed prompt survives a full `goto https://weblab.build` navigation even though `localStorage` and `sessionStorage` are both empty.
**Diagnosis:** Either Next.js client-side route cache + module-scope React state, or BFCache. Unclear yet whether the prompt persists across hard reloads from a fresh tab (browser-context).
**Why it matters:** If two different users share a device (kiosk, family laptop), one user's draft prompt could be visible to the next. Privacy leak.
**Fix path:** Clear the chat draft on navigation away from `/`, or store it under a session-scoped key that is wiped on visibility change.

---

## LOW

### BUG-29 — Landing chat textarea is a `<div contenteditable>` with no ARIA role

**Where:** Landing prompt input.
**Behavior:** `document.activeElement` is a `DIV` with no `role="textbox"`. The TipTap wrapper exposes a placeholder via `data-placeholder` and an `is-editor-empty` class.
**Impact:** Screen readers don't announce it as an input.
**Fix path:** Add `role="textbox"` and `aria-label="Describe what you want to build"` to the editable div, or wrap with a properly-labeled `<label for>`.

---

### BUG-30 — No `<link rel="preconnect">` to known third-party origins

**Where:** Landing.
**Behavior:** Site connects to `docs.weblab.build`, `accounts.google.com`, `github.com`, `cdn.jsdelivr.net` (UnicornStudio), and `*.supabase.co` for auth callbacks, but emits zero `preconnect` hints.
**Impact:** Cold OAuth click pays full DNS + TCP + TLS handshake to the provider. Same for the CDN call on first paint.
**Fix path:** Add `<link rel="preconnect" href="https://accounts.google.com">`, `https://github.com`, `https://cdn.jsdelivr.net`, and `https://ttdazmwohrvxsliapwai.supabase.co` in `app/layout.tsx`.

---

### BUG-31 — `/manifest.json` 404, only `/manifest.webmanifest` exists

**Where:** `/manifest.json` returns 404. `/manifest.webmanifest` returns 200.
**Impact:** None for compliant clients; some legacy Android Chrome versions and certain third-party install prompts still look for `/manifest.json`. Cosmetic, but creates one stray 404 per install attempt.
**Fix path:** Either add a Next.js redirect `/manifest.json` → `/manifest.webmanifest`, or serve both.

---

## What's now ruled OUT

- 91 `<img>` tags on landing all have `alt` (no missing alt text). Good.
- `<html lang="en">` set.
- 404 page is friendly with a "Back to home" CTA (`/tmp/qa-404.png`).
- All 20 blog post slugs return 200 with real content (3k–9k chars each).
- OAuth round-trip URLs are well-formed (GitHub, Google, Supabase callback).
- TLS / TTFB are healthy: load=272ms cold on landing.

---

## Updated counts (after Round 2)

- Critical: 9 / High: 10 / Medium: 9 / Low: 6 → **34**

---

# Round 3 — Real breaking bugs (focus: behavior, not styling)

## CRITICAL

### BUG-32 — Chat input has no max length: 100k+ chars accepted, layout breaks

**Where:** `/` landing prompt input (TipTap `<div contenteditable>`).
**Repro:**
```js
var d=document.querySelector('[contenteditable=true]');
d.focus();
document.execCommand('insertText',false,'A'.repeat(100000));
// Editor div now scrollHeight = 36218px, no scrollbar, page becomes 36k+ px tall.
```
**Behavior:**
- No `maxlength`. No client-side truncation. No "X chars over limit" warning.
- The editor `div` expands to **36,218 px** with 100k chars — no `max-height`, no internal scroll.
- "Send message" button stays **enabled** even with 100k chars in the field.
- Subsequent **paste** events stack on top: pasted 50k more → field reached **160k chars** in 22 ms.
- Submit click on 100k-char content fires the same auth modal as a one-line prompt — the request is dispatched to the server; backend may also lack input size enforcement (cost vector / DoS-shaped payload).
**Impact:**
1. **Layout-break:** A bored visitor can wreck the landing layout in 5 seconds. Other UI elements get pushed out of view.
2. **Cost / abuse:** Anonymous prompt is sent to AI inference once auth gates clear (free tier creditless attempts in the modal). 100k tokens × N visitors = bill.
3. **DoS-lite:** Repeated submits with 100k payloads from many IPs flood the prompt-handling endpoint.
**Fix path:**
- Add `maxlength: 4096` (or a sane product cap) to the TipTap config.
- Truncate paste content over the cap.
- Show a counter and disable Send when over.
- Server-side: validate `prompt.length` on the route handler too.

---

### BUG-33 — UnicornScene errors fire on *every* page, not just landing

**Where:** Confirmed by walking `/`, `/login`, `/pricing`, `/features`, `/faq`, `/blog`, `/changelog`, `/download`, `/about`, `/contact`, `/workflows`, `/compare`.
**Behavior:** Console emits the same `UnicornScene error: Cannot set properties of undefined (setting 'id')` + WebGL/TextureLoader failures on every page load. UnicornScene component is mounted in the global layout / a shared section.
**Why "critical":** BUG-1 said the red "Error loading scene" banner appears on the landing hero — that's the user-visible piece. This bug expands the scope: the failing component runs on every route, costs CPU, fetches `flow-background.json` repeatedly (BUG-18) per page mount, and spams every visitor's console with errors. Sentry / GA error tracking is full of these.
**Fix path:** Same as BUG-1 — feature-detect WebGL once at the layout level and skip mounting when unsupported. Don't ship a scene that can fail on every page.

---

### BUG-34 — Pro tier `<select>` value is invisible (dark text on dark)

**Where:** `/pricing` → Pro tier → "100 Credits per Month" dropdown.
**Computed:**
- `color: rgb(26,26,26)` (#1A1A1A near-black)
- `background-color: oklab(... / 0.3)` (dark grey 30% opacity)
- On dark page.
**Same root cause as BUG-2 / BUG-20.** Shadcn `select-trigger` variant doesn't invert under the dark theme.
**User impact (real, not cosmetic):** A Pro buyer can't read which credit tier they're choosing. The label and chevron are invisible until hovered.
**Note:** Pricing curve is correct: 100→$25, 200→$50, 400→$100, 800→$200, 1200→$294, 2000→$480, 3000→$705, 4000→$920, 5000→$1125, 7500→$1875, Unlimited→$3750. The value just can't be read.

---

### BUG-35 — Model picker / Pricing claim mismatch (false advertising)

**Where:** `/` landing chat model selector vs `/pricing` Free tier copy.
**Pricing claim (Free tier):** *"Pick your model — or bring your own key — Claude Opus 4.7, Sonnet 4.6, **Haiku 4.5**, GPT-5.5, Gemini 3.1 Pro, **DeepSeek V4**, **Mistral Codestral**, or your local **Ollama**."*
**Model picker actually shows:**
```
CLOUD: GPT-5.5, Claude Sonnet 4.6, Claude Opus 4.7, Gemini 3.1 Pro, DeepSeek V4 Pro, Kimi K2.6
CODEX: Sign in to Codex…
CLAUDE: Available in the Weblab desktop app
```
**Missing vs claim:** Haiku 4.5, Mistral Codestral, Ollama.
**Extra vs claim:** Kimi K2.6 (not advertised).
**Impact:** Users on the Free tier sign up expecting Mistral/Haiku/Ollama and don't get them. Marketing copy contradicts product.
**Fix path:** Pick one source of truth — either ship the missing models or rewrite the pricing bullet.

---

### BUG-36 — Email rate-limit error is not surfaced before the first ~9 sends

**Where:** `/login` → "Continue with email".
**Repro:**
1. Open `/login`.
2. Submit 9 distinct emails in ~30 s.
3. All 9 succeed (page navigates to `/login/verify?sentAt=...` each time, no UI error).
4. The 10th submission stays on `/login` and renders an inline paragraph "email rate limit exceeded".
**Impact:**
- Up to 9 OTP emails can be fired to arbitrary addresses per IP per window before any UI feedback or captcha kicks in. Email bombing primitive: pick a victim's address, submit 9× per minute from each of N IPs.
- A captcha (hCaptcha / Turnstile) on this form would close it.
**Fix path:**
- Front it with a captcha or proof-of-work challenge before calling `signInWithOtp`.
- Server-side: per-email rate limit (Supabase has per-IP only by default).
- Add a 30 s client cooldown between submits.

---

## HIGH

### BUG-37 — `/invitation/abc` (invalid slug) renders without `<h1>` and with duplicate title

**Where:** Any unknown invitation slug, e.g. `/invitation/abc`.
**Behavior:** Returns 200 (not 404). H1 is empty string. Body = `"You must be logged in to accept this invitation\nLogin or Signup"`. Title is `"Weblab | Weblab"` (BUG-4 double-suffix).
**Impact:** A user landing on a bogus or expired invitation slug sees a generic two-line page with no heading and no breadcrumb of *why* they're there.
**Fix path:** Add a real H1 ("Invitation"), explain the state (does this invite exist? expired? wrong account?), surface a "Continue to your projects" link for already-logged-in users.

---

### BUG-38 — `/invitation` (no slug) is a hard 404

`/invitation` returns the generic 404. Should probably redirect to `/projects` for logged-in users, or `/login` for anonymous.

---

### BUG-39 — `/auth/error` is 404; only `/auth/auth-code-error` exists

If any link, email template, or external system points users at `/auth/error`, they hit a dead 404 page instead of an informative auth-error screen.
**Fix path:** Either add a redirect `/auth/error` → `/auth/auth-code-error?reason=unknown`, or rename the real route to `/auth/error` and migrate any callers.

---

### BUG-40 — Auth error page leaks internal error keys to users

**Where:** `/auth/auth-code-error?reason=missing_code` shows literal `REASON: missing_code` block to the user. Other reasons (invalid_code, expired, malformed) hide the REASON section entirely. Inconsistent + jargon.
**Fix path:** Either always hide the raw reason key (log it to console / Sentry only) or translate to a human-readable sentence per case.

---

### BUG-41 — Desktop nav dropdowns also fail KB/SR (re-confirmed) + don't open on click, only on hover

Re-test from a clean state:
- Tab order: Logo → GitHub icon → Resources (Product is *not* directly tab-focusable).
- Pressing Enter on the focused trigger does NOT open the menu (`Array.from(...features...).length` still `0` after Enter).
- Hover opens the menu visually, but the trigger has no `aria-expanded`, no `aria-haspopup`, no `role`, no `data-state`.

This is BUG-19 with extra confirmation: **the entire nav is unreachable by keyboard or assistive tech**. WCAG 2.1.1 + 4.1.2.

---

### BUG-42 — `/login/verify` deep link (even with fresh `sentAt`) does not render the OTP form

**Where:** Open `https://weblab.build/login/verify?sentAt=<recent timestamp>` directly.
**Behavior:** Page renders the `/login` email form (Welcome / GitHub / Google / email), not the OTP entry. The URL bar still shows `/login/verify`.
**Impact:** Users who bookmark the verify page mid-OTP and come back later land at a confusing state — URL says "verify", page says "Welcome". The "Back to login" link in the real verify view also points users here.
**Fix path:** If there's no server-side OTP pending, redirect (server-side) to `/login` and clean the URL.

---

## MEDIUM

### BUG-43 — Anonymous chat draft survives back/forward without storage

**Where:** Landing.
**Repro:**
1. Type "PROMPT-TEST-XYZ" into chat (chat already had "a landing page for my pizza shop" from earlier — that prior draft also persists across reloads despite empty `localStorage`/`sessionStorage`).
2. Navigate to `/pricing`.
3. Navigate Back.
4. Chat now shows **the older draft only** ("a landing page for my pizza shop"), losing the "PROMPT-TEST-XYZ" added before navigation.
**So two bugs in one:**
- Drafts persist (privacy issue on shared devices, BUG-28).
- The version restored on back is *stale* — the most recent typed text is silently dropped.

---

### BUG-44 — `/api/health` returned 404 when fetched from `/login` origin

**Where:** Inside `/login`, `fetch('/api/health')` returned `404 text/html`. Same call from `/` origin returns `200 {"ok":true}`. Confirmed twice.
**Diagnosis:** Probably the rewrite/middleware strips the request when the referrer is on the login page, or there's a Next.js route conflict. Either way it's inconsistent and could mess with uptime monitors that fetch the health probe from session-cookied browsers.

---

### BUG-45 — `/site-map` includes a Sitemap meta-entry that points to itself

Inside `/site-map` the body lists *both* a top-level "Sitemap" item linking to `/site-map` and the long SECTIONS list. Self-reference + duplicate listing (BUG-26).

---

### BUG-46 — `/projects/[id]` (unauth) returns 404 instead of redirect-to-login

`/projects/new` correctly redirects to `/login?returnUrl=/projects/new`. `/projects/123` returns 404 even when no session cookie is present. Inconsistent auth gating:
- Logged-out user clicks a shared link → 404 instead of "sign in to view this project".
- Also leaks the fact that the project ID is unknown without auth.
**Fix path:** Always redirect to `/login?returnUrl=...` first; only 404 after auth confirms the project doesn't exist for *this* user.

---

## LOW / NOTED-NOT-BLOCKERS

### BUG-47 — No `maxlength` on `<input type="email">`; 500-char emails pass HTML5 validity

RFC 5321 caps local-part at 64 chars, full address at 254. The login input accepts strings well beyond both. Backend should reject; UI should too.

---

### BUG-48 — Landing chat "Build" mode picker does not open on click

**Where:** Landing, next to the model picker. Button has chevron, `data-slot="tooltip-trigger"`, but clicking does nothing — no dropdown, no tooltip on click.
**Repro:** `document.querySelectorAll('button')` find `Build`; `b.click()` → no `[role=menu]`, no `[data-state=open]` appears.
**Note:** It might be intentional that the anon-landing preview is "static" (the chat is a demo, not real). If so, why are the buttons interactive at all? Either make them fully interactive (open the mode picker) or remove the chevron and hover state.

---

### BUG-49 — Confirmed: no rate limit / captcha on OTP send before ~9th attempt; backend rate-limits silently after that

This is the matching observation for BUG-36. From this baseline you can choose: enforce a captcha on send #1, or trust Supabase's per-IP cap and surface the error from request #1. Right now you're between modes.

---

## Confirmed clean (round 3)

- No reflected XSS via `returnUrl`, query strings, or `fbclid`. Payloads do not enter the rendered DOM as scripts.
- No open redirect: `returnUrl=https://evil.com`, `javascript:alert(1)`, `//evil.com/pwn` are all stripped from the OAuth state passed to GitHub/Google.
- Internal `returnUrl=/pricing` etc. round-trips correctly through the OAuth state.
- All `/compare/*` SEO pages return 200 with substantive content (3.7k–6.2k chars).
- Anonymous tRPC POST returns proper `401 UNAUTHORIZED` JSON (good error contract).
- `/api/health` returns `{"ok":true}` from the public origin.

---

## Updated counts (after Round 3)

- **Critical:** 9 + **BUG-32..BUG-36** → **14**
- **High:** 10 + **BUG-37..BUG-42** → **16**
- **Medium:** 9 + **BUG-43..BUG-46** → **13**
- **Low:** 6 + **BUG-47..BUG-49** → **9**

Total: **52 issues** documented on the public surface.

---

## Top 5 to ship this week

1. **BUG-32** — chat input length cap (data + cost containment).
2. **BUG-36** — captcha or visible cooldown on OTP send (abuse prevention).
3. **BUG-1 + BUG-18 + BUG-33** — UnicornScene WebGL failure handling (one fix kills three bugs and unblocks Sentry signal).
4. **BUG-2 + BUG-20 + BUG-34** — single shadcn dark-mode variant fix solves all three invisible-button/select cases.
5. **BUG-41 (BUG-19)** — wire Radix `NavigationMenu` on the desktop header so keyboard + screen reader users can reach the nav.
