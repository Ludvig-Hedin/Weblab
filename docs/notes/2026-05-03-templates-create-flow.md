# Templates Create Flow - 2026-05-03

## Summary

The create-project flow now surfaces starter templates directly on `/projects/new`.
Users can browse curated Next.js templates, open a details page, preview the live
template, view source links, see related templates, and create a Weblab project
from a public GitHub template.

## User-Facing Changes

- `/projects/new` now includes a starter template grid below the AI prompt box.
- `/projects/templates/[id]` shows template details, source links, live preview,
  use action, and related templates.
- The template catalog includes:
  - Next.js Boilerplate
  - Startd
  - Portfolio Starter Kit
  - Marketing Site
  - Next.js & shadcn/ui Admin Dashboard
  - Blog Starter Kit

## Architectural Notes

- Template metadata lives in
  `apps/web/client/src/app/projects/_components/templates/template-data.ts`.
- Public GitHub template creation uses `CreateManager.startPublicGitHubTemplate`,
  which creates a CodeSandbox project from GitHub and then creates the Weblab
  project record through the existing project API.
- `Routes.PROJECT_TEMPLATES` was added so detail links do not hardcode the base
  template route.

## Follow-Up

- The current sandbox import contract accepts a GitHub URL and branch. Some
  upstream examples are repository subdirectories, so if CodeSandbox does not
  support those tree URLs reliably, the backend should be extended with an
  explicit `subdirectory` field.
