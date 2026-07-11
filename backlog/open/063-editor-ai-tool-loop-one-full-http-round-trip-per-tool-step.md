# Editor AI tool loop: one full HTTP round-trip per tool step

- **Discovered:** 2026-06-16 (bug-hunt; ai-loop AI-1, verdict partial/high)
- **Where:** `packages/ai/src/tools/toolset.ts:54-73`; `apps/web/client/src/app/project/[id]/_hooks/use-chat/index.tsx:161-164`; `apps/web/client/src/app/api/chat/route.ts`
- **Symptom:** read/list/grep/edit are client tools with no server `execute`, so each assistant turn ending in tool-calls terminates the server stream and the browser fires a fresh POST `/api/chat` that re-runs the full route setup + re-sends the growing transcript. N sequential tool turns ≈ N round-trips. (The biggest per-step stall — unbounded mem0 search — was fixed 2026-06-16: timeout + skip-on-continuation in route.ts.)
- **Next step (cheap wins first):** Cache per-turn-invariant context (skills, tier, summary, projects.get) across continuation POSTs of the same turn (key on conversationId+traceId or thread via the transport). Lean on the existing conversation summarizer so continuations ship a compacted transcript. Confirm the Anthropic prefix cache is actually hit on continuations. Server-side tool batching (convert read tools to ServerTool) is a separate, large architecture project — requires a server-authoritative file store for the agent; do not bundle.
- **Risk if ignored:** Multi-step AI tasks feel slow on high-latency networks even after the mem0 fix.
- **Tags:** `#tech-debt` `#ai` `#perf`
