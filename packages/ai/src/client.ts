// Client-safe exports — no Node.js builtins.
// Import from '@weblab/ai/client' in client components.

// Skills — client gets name+description summaries ONLY (no bodies) so the
// browser bundle never ships hundreds of KB of skill content. Server code that
// needs full bodies imports EMBEDDED_SKILLS from './skills/embedded' directly.
export { EMBEDDED_SKILL_SUMMARIES } from './skills/embedded-summaries';
export * from './skills/types';

// Context helpers (used by context-pills UI)
export * from './contexts';

// Tool classes, models, toolset (chat display components, tools registry)
export * from './tools';

// Provider manifest, types, and helpers (model picker, transport layers)
export * from './providers/manifest';

// Client-safe prompt helpers
export { getCloneSystemPrompt } from './prompt/constants/clone';

// Client-safe summarizer (token-budget gate + summary application).
// The LLM-running `summarizeConversation` lives only in the server entry.
export {
    KEEP_RECENT_TURNS,
    SUMMARIZE_THRESHOLD_RATIO,
    applySummaryToMessages,
    shouldSummarize,
    type ShouldSummarizeInput,
    type ShouldSummarizeResult,
} from './chat/summarizer-utils';

// Client-safe model router types + sentinel. resolveAutoModel is sync and
// pure so it's safe in the browser too, but the auth/usage-driven tier
// decision lives on the server — the client only needs to pass the sentinel.
export { AUTO_MODEL_ID, type AutoModelId, type UserTier } from './chat/model-router';
