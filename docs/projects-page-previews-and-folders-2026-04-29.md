# Projects Page Update

Date: 2026-04-29

## Summary

This update improves the `/projects` page with richer project previews, cleaner metadata, lightweight folders, and bulk project actions.

## User-Facing Changes

- Project cards now try multiple preview sources in order:
  - saved screenshot/preview image
  - live site URL iframe preview
  - a styled fallback preview surface instead of a flat gray box
- Project cards now show:
  - the site URL below the project name
  - the site favicon when available
  - the globe icon when no favicon can be resolved
- The page now supports folders with:
  - a create-folder flow
  - folder cards that preview the sites inside them
  - inline expansion to inspect projects inside a folder
- A subtle select mode now supports:
  - multi-select
  - bulk move to folder
  - bulk delete

## Technical Notes

- Project card URL data is derived from the existing project list response:
  - published custom domain first
  - preview domain second
  - default branch frame URL last
- Folder persistence is currently local to the client via `localforage`.
  - This avoids adding risky database or generated schema changes on the current branch.
  - Empty folders are still preserved because they are stored independently of project tags.
- The router change is read-only and does not change the project schema.

## Follow-Up


## 2026-05-03 Suggestion Pill Refresh

- The empty-state suggestion pills on `/projects` now prefill fuller project prompts instead of short `"Create a ..."` stubs.
- The weaker `About Page` and `Resume` starters were replaced with `SaaS Landing` and `Dashboard`.
- Each preset now includes:
  - a concrete product or persona
  - recommended sections
  - placeholder content direction
  - visual guidance so the generated result is useful on first click
- If folders need to sync across devices/accounts, the next step is a small backend-backed folder model or user preference field instead of `localforage`.
