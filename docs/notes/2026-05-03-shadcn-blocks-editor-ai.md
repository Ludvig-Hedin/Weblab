# Shadcn Blocks In Editor And AI

Date: 2026-05-03

## Status

Implemented the first shadcn blocks integration for the editor insert panel and AI prompt context.

## User-Facing Changes

- The editor Add panel now has a Blocks tab with searchable installed shadcnblocks.
- Blocks can be clicked for placement mode or dragged onto the canvas.
- The required CTA, logo, about, awards, blog, careers, case study, code example, community, comparison, compliance, download, experience, project, product quick view, help, chart, leaderboard, and stats blocks are installed locally in `apps/web/client/src/components`.
- A small set of installed shadcn/ui primitives is listed separately from complete blocks.

## Architecture Notes

- The block manifest lives in `packages/constants/src/shadcn-blocks.ts` so editor UI and AI prompts use the same source of truth.
- Block drag payloads use `application/weblab-block+json` plus the existing JSON drop channel for compatibility.
- Block insertion uses the existing structural insert flow with a JSX `codeBlock` wrapper. Parser import injection adds the required component import when inserting a block into a page.
- AI system prompts now include installed block names, import targets, and Bun/shadcn CLI guidance.

## Verification

- `bun run typecheck` passes for `@weblab/web-client`.
- `bun test test/prompt/prompt.test.ts` passes in `packages/ai`.
- `bun test test/html-pipeline.test.ts test/template.test.ts test/transform.test.ts` passes in `packages/parser`.
- Standalone `bun --filter @weblab/parser typecheck` is still blocked by existing workspace alias/JSX config issues unrelated to this change.
