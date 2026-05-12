# Audits

Point-in-time reports on the state of the product, the site, or specific dimensions (SEO, accessibility, performance, security, etc.).

## Catalog

| File | Date | What it audits | Status |
|---|---|---|---|
| [`website-product-audit.md`](./website-product-audit.md) | — | Marketing site + product surface review | Reference |
| [`seo/action-plan.md`](./seo/action-plan.md) | 2026-05-11 | SEO action plan: prioritized fixes, goals | Active |
| [`seo/full-audit-report.md`](./seo/full-audit-report.md) | 2026-05-11 | SEO audit + evidence + verification | Reference |

## Lifecycle

| State | Meaning |
|---|---|
| **Active** | Findings are open; reference for ongoing work. Don't archive. |
| **Reference** | Findings closed or absorbed into the codebase, but the report itself is still useful as a snapshot. |
| **Archive** | Superseded by a newer audit. Move to [`../archive/`](../archive). |

## When to re-run

- **SEO** — quarterly, or after any large IA/navigation change.
- **Accessibility** — before major UI launches, and quarterly.
- **Performance** — after large deps changes, and before launches.
- **Security** — quarterly, plus before any auth/secrets-touching change ships.

## How to add a new audit

1. Pick a subfolder by topic (`seo/`, `a11y/`, `perf/`, etc.) — create if it doesn't exist.
2. Name the file by what it audits, not by date (`action-plan.md`, `full-audit-report.md`). Put the date in the front-matter or first paragraph.
3. Add a row to the catalog above.
4. If the audit replaces an older one, move the older one to [`../archive/`](../archive) and link to it from the new audit.
