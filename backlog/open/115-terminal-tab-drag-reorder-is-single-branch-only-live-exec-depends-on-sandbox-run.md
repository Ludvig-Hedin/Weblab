# Terminal tab drag-reorder is single-branch only; live exec depends on sandbox runtime

- **Discovered:** 2026-06-02 (terminal overhaul — F-331/F-331a/F-331b/F-480)
- **Where:** [terminal-area.tsx](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx) `handleReorder`; [session.ts](apps/web/client/src/components/store/editor/sandbox/session.ts) `reorderTerminalSessions`.
- **Symptom / limitation:** Drag-to-reorder of terminal tabs only works **within a single branch**. Dragging a tab across branch boundaries is a deliberate no-op because per-branch session maps can't represent cross-branch interleaving. The common single-branch project is unaffected. Multi-branch projects can't interleave tabs from different branches.
- **Also:** The new command input row + AI mode are fully wired to the provider PTY (`terminal.write`) / `session.runCommand`, but **live command execution depends on the Vercel sandbox runtime** (the TOP-PRIORITY entry below) — `VercelBrowserProvider.runCommand`/terminals are currently stubs, so commands won't produce output on cloud projects until that lands. Works today on the local `nodefs` provider. The AI translation route (F-480) is independent and works now (returns a command string).
- **Next step (reorder):** if cross-branch interleaving is ever needed, lift terminal ordering out of per-branch maps into a single editor-level ordered list keyed by composite `branchId-sessionId`.
- **Tags:** `#editor` `#terminal` `#low`
