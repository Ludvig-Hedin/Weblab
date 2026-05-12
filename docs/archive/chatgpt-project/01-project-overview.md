# Weblab — Project Overview

## What it is

**Weblab** (weblab.build) is an open-source **visual-first code editor and AI builder** for web developers and product teams. Think Figma meets VS Code — you edit a live preview of your app directly, and the changes write real code underneath.

The core pitch: you can build, edit, and publish a Next.js/Tailwind project entirely in the browser without touching a text editor. AI handles code generation; you handle intent and design.

## Current status

- **Public**: Live at weblab.build.
- **Latest shipped**: v1.5 (AI Component Generation from natural language).
- **Active dev**: TipTap rich-text AI chat, CMS workspace, responsive breakpoints, framework auto-detection, desktop CLI bridge.
- **16 commits ahead of origin** on main with a large in-flight diff touching editor, chat, CMS, marketing, and database.

## What makes it different

1. **Visual editing writes real code.** Not snapshots or screenshots — actual JSX/Tailwind edits via Babel AST.
2. **AI-native.** Every surface has AI chat (Ask vs Build modes). Build mode makes file edits; Ask mode answers.
3. **Framework-aware.** Detects Next.js, Vite, Remix, Astro, TanStack Start, static HTML.
4. **GitHub-connected.** Auto-commits, branch support, pull upstream changes without leaving the editor.
5. **Real collaboration.** Multi-user live editing like Figma — cursor tracking, live selections.

## The tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 App Router + TailwindCSS 4 |
| State | MobX (editor engine) + React Query (server state via tRPC) |
| API | tRPC + Zod, 21 routers |
| Database | PostgreSQL via Supabase + Drizzle ORM |
| Auth | Supabase Auth (GitHub, Google OAuth) |
| AI | OpenRouter (primary), OpenAI (fallback), Anthropic, Ollama, local CLI |
| Code sandbox | CodeSandbox (cloud mode) |
| Hosting | Railway (the web app), Freestyle (user project publishing) |
| Package manager | **Bun only** |
| Monorepo | Bun workspaces, 25 packages under `@weblab/*` |

## User types

1. **Designers / product managers** — want to edit UI without engineering help.
2. **Frontend developers** — want AI pair-programming with visual preview.
3. **Indie makers** — want to ship a polished site fast.

## Project goals (current phase)

- Ship a polished public v2 with CMS workspace, breakpoints, and better AI chat.
- Expand marketing site (blog, comparison pages, SEO).
- Stabilize editor: sandbox startup, local mode, mobile fallback.
- Grow via GitHub presence and content (claude.ai/code, vibe-coding workflows).

## Repository

- **GitHub**: github.com/Ludvig-Hedin/Weblab
- **Local folder**: `onlook/` (legacy name, kept for shell/tooling compat)
- **Owner**: Ludvig Hedin (ludvighedin on GitHub)
