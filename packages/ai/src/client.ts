// Client-safe exports — no Node.js builtins.
// Import from '@weblab/ai/client' in client components.

// Skills
export { EMBEDDED_SKILLS } from './skills/embedded';
export * from './skills/types';

// Context helpers (used by context-pills UI)
export * from './contexts';

// Tool classes, models, toolset (chat display components, tools registry)
export * from './tools';

// Provider manifest, types, and helpers (model picker, transport layers)
export * from './providers/manifest';

// Client-safe prompt helpers
export { getCloneSystemPrompt } from './prompt/constants/clone';
