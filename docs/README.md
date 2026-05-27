# Weblab Documentation

This is the documentation hub for Weblab — for both **humans** and **coding agents**.

> **Audience legend:** 🤖 agent · 👤 human · 🤝 both

If you are an **agent**, your mandatory entry points are [`/CLAUDE.md`](../CLAUDE.md) and [`/AGENTS.md`](../AGENTS.md), then [`agent-memory/user-preferences.md`](./agent-memory/user-preferences.md) every session.

If you are a **human**, start with the [project README](../README.md), then [`guides/`](./guides) for how-tos. The **published documentation site** (docs.weblab.build) is built from [`apps/docs`](../apps/docs).

---

## Start here

| Audience | First read |
|---|---|
| 🤖 Agent | [`/CLAUDE.md`](../CLAUDE.md) · [`/AGENTS.md`](../AGENTS.md) · [`agent-memory/user-preferences.md`](./agent-memory/user-preferences.md) |
| 👤 Human (contributor) | [`/README.md`](../README.md) · [`/CONTRIBUTING.md`](../CONTRIBUTING.md) · [`guides/`](./guides) |
| 👤 Human (end-user) | The published site at [docs.weblab.build](https://docs.weblab.build) (source in [`apps/docs/content/docs/`](../apps/docs/content/docs)) |

---

## Map

| Folder | Audience | Purpose |
|---|---|---|
| [`agent-context/`](./agent-context) | 🤖 | Architecture reference docs (repo map, packages, tRPC routers, routes, editor, AI chat, CMS, breakpoints, data/API, design product context, UI enforcement) |
| [`agent-memory/`](./agent-memory) | 🤖 | Persistent agent memory: user preferences, feature log, architecture decisions, performance/tool audits |
| [`guides/`](./guides) | 👤 | Human how-tos (deployment, etc.) |
| [`audits/`](./audits) | 🤝 | Audits & reports (website-product, SEO action plan, full audit report) |
| [`feature-catalog.md`](./feature-catalog.md) | 🤝 | Master inventory of every user-facing + internal feature with paths and purposes |
| [`test-plan.md`](./test-plan.md) | 🤝 | Per-feature test matrix (unit / integration / E2E / manual) mapped to the catalog |
| [`prompts/`](./prompts) | 🤖 | Reusable prompts — currently `validate-feature.md` for end-to-end feature validation (code + frontend) |
| [`notes/`](./notes) | 🤖 | Dated working notes — fast running journal, format `YYYY-MM-DD-<topic>.md` |
| [`product/`](./product) | 👤 | Product planning & marketing (product-video plan/notes, marketing calendar, launches) |
| [`superpowers/`](./superpowers) | 🤝 | Feature plans (`plans/`) and design specs (`specs/`) |
| [`archive/`](./archive) | 🤝 | Stale material kept for searchability (legacy projects, closed reviews, old activity log) |
| [`../apps/docs/`](../apps/docs) | 👤 | Published docs site source (Fumadocs Next.js) — content under `apps/docs/content/docs/` |

---

## Agent docs

### Architecture reference — `agent-context/` 🤖

Read [`agent-context/README.md`](./agent-context/README.md) for the recommended read order. Highlights:

- [`current-progress.md`](./agent-context/current-progress.md) — what's in-flight
- [`repo-map.md`](./agent-context/repo-map.md) — where everything lives
- [`development-setup.md`](./agent-context/development-setup.md) — commands, env, validation
- [`packages-reference.md`](./agent-context/packages-reference.md) — all `packages/*`
- [`trpc-routers-reference.md`](./agent-context/trpc-routers-reference.md) — all routers
- [`routes-reference.md`](./agent-context/routes-reference.md) — all Next.js routes
- Deep dives: [`editor-architecture.md`](./agent-context/editor-architecture.md), [`ai-chat-architecture.md`](./agent-context/ai-chat-architecture.md), [`data-api-architecture.md`](./agent-context/data-api-architecture.md), [`cms-architecture.md`](./agent-context/cms-architecture.md), [`breakpoints-architecture.md`](./agent-context/breakpoints-architecture.md), [`design-product-context.md`](./agent-context/design-product-context.md)
- UI enforcement: [`button-enforcement.md`](./agent-context/button-enforcement.md), [`audit-dropdowns-popovers-menus.md`](./agent-context/audit-dropdowns-popovers-menus.md), [`audit-inputs-forms.md`](./agent-context/audit-inputs-forms.md)

### Persistent memory — `agent-memory/` 🤖

Read protocol in [`agent-memory/README.md`](./agent-memory/README.md). Files:

- [`user-preferences.md`](./agent-memory/user-preferences.md) — read every session
- [`feature-log.md`](./agent-memory/feature-log.md) — append on significant ships
- [`architecture-decisions.md`](./agent-memory/architecture-decisions.md) — append on architectural choices
- [`performance-audit.md`](./agent-memory/performance-audit.md), [`tool-system-audit.md`](./agent-memory/tool-system-audit.md) — point-in-time audits

### Working notes — `notes/` 🤖

Dated journal of in-flight work. Naming: `YYYY-MM-DD-<kebab-topic>.md`. See [`notes/README.md`](./notes/README.md).

---

## Guides — `guides/` 👤

- [`guides/deployment/`](./guides/deployment) — [Railway](./guides/deployment/railway.md), [Render POC](./guides/deployment/render-poc.md)

---

## Audits — `audits/` 🤝

- [`website-product-audit.md`](./audits/website-product-audit.md)
- [`seo/action-plan.md`](./audits/seo/action-plan.md) — SEO action plan
- [`seo/full-audit-report.md`](./audits/seo/full-audit-report.md) — Full SEO audit + evidence

Lifecycle and re-run cadence: [`audits/README.md`](./audits/README.md).

---

## Feature catalog & test plan 🤝

- [`feature-catalog.md`](./feature-catalog.md) — comprehensive inventory of every public route, editor surface, store manager, tRPC router, package, and integration with paths and purposes. Master reference for QA, onboarding, and audits.
- [`test-plan.md`](./test-plan.md) — per-feature test matrix (unit / integration / E2E / manual) mapped 1:1 to the catalog. Includes phased execution plan and open questions before automation.
- [`prompts/validate-feature.md`](./prompts/validate-feature.md) — reusable prompt to run end-to-end validation (code + frontend) for any feature ID, tag, section, or branch diff. Chains the relevant Claude skills.

Update both catalog + test plan whenever a new top-level feature ships.

---

## Product & marketing — `product/` 👤

- [`product-video-plan.md`](./product/product-video-plan.md), [`product-video-implementation-notes.md`](./product/product-video-implementation-notes.md)
- [`marketing/blog-content-calendar.md`](./product/marketing/blog-content-calendar.md)
- [`marketing/product-hunt-launch.md`](./product/marketing/product-hunt-launch.md)

---

## Feature plans — `superpowers/` 🤝

- [`plans/`](./superpowers/plans) — full implementation plans
- [`specs/`](./superpowers/specs) — design specs

---

## Published documentation site — `apps/docs/` 👤

The Fumadocs Next.js site that publishes to [docs.weblab.build](https://docs.weblab.build).

- Source content: [`apps/docs/content/docs/`](../apps/docs/content/docs)
- Dev: `bun docs` (from repo root) → `http://localhost:3000`
- Dev README: [`apps/docs/README.md`](../apps/docs/README.md)

---

## Archive — `archive/` 🤝

Stale material kept for searchability. See [`archive/README.md`](./archive/README.md) for what's in it and when it's safe to delete.

---

## Documentation discipline

When you ship something user-facing, update docs. Rules in [`/CLAUDE.md`](../CLAUDE.md) under "Documentation Discipline (for Agents)" and "Changelog & Blog — Shipping Announcements".

Quick rules of thumb:

- **Architecture changed?** → update the matching `agent-context/*-architecture.md`.
- **Shipped a major feature?** → append to `agent-memory/feature-log.md` and add a changelog entry.
- **New package / router / route?** → update `agent-context/packages-reference.md` / `trpc-routers-reference.md` / `routes-reference.md`.
- **In-flight working notes?** → drop a `notes/YYYY-MM-DD-<topic>.md`.
- **User-facing docs change?** → edit `apps/docs/content/docs/**`.
