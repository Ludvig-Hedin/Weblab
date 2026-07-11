# Project settings expansion — deferred sub-features

- **Discovered:** 2026-06-02 (project-settings expansion session)
- **Where:** `apps/web/client/src/components/ui/settings-modal/*`
- **Context:** Built this pass — Overview (General), Site Access tab, SEO tab (robots.txt + crawler/AI quick-inserts + llms.txt + custom sitemap.xml). The items below were deferred; each has a reason + a quick alternative.
- **Deferred — blocked by disabled publish/serving on Vercel (`TODO(publish-vercel)`):**
  - **Website password** + **Make staging private** — need a serving-layer auth gate on the published/staging site; nothing serves it yet. *Quick alt:* persist the setting now, label "applies once publishing is live" (no real protection until then). `pageAccess.passwordHash` schema already exists to build on.
  - **301 redirects** — need `next.config` redirects or a redirect server honoring them. *Quick alt:* persist a redirect list now; write to `next.config` / wire serving when publish lands.
  - **Forms** (sender name / send-to / submissions) — no form-capture backend, and submissions require the served site to POST somewhere. *Quick alt:* embed a 3rd-party form (Formspree/Tally) on the page — works with zero backend from us.
- **Deferred — feasible but medium-high / better handled elsewhere:**
  - **Fonts** (Google/custom/Adobe) — must inject into the user's project code (`next/font`, Tailwind v4 theme, or `<link>`) + an asset pipeline for custom uploads; fragile across arbitrary project setups. *Quick alt:* ask the AI chat ("use Inter") — it edits the project's actual font setup correctly today.
  - **Organize in folder** — no folder model exists; it's an org/dashboard-level concept, not per-project settings. *Quick alt:* project **tags** already exist for grouping.
  - **SEO v2** — auto-generate sitemap from the pages tree, global canonical URL (needs root-metadata plumbing like the Site tab), staging-indexing toggle (moot until staging serves). *Quick alt:* the custom `sitemap.xml` editor already shipped covers manual sitemaps.
  - **Overview: total asset size + site activity** — need storage metering + an `auditLog` query (the `auditLog` table exists, no client query yet).
- **Handoff prompts written** (2026-06-03) for picking these up: [docs/prompts/add-publishing-controls.md](docs/prompts/add-publishing-controls.md) (password · private staging · 301 redirects · Forms), [docs/prompts/add-fonts-tab.md](docs/prompts/add-fonts-tab.md), [docs/prompts/add-seo-v2.md](docs/prompts/add-seo-v2.md). The **folder** item is now DONE (folder dropdown shipped in General settings).
- **Tags:** `#feature` `#tech-debt` `#infra`
