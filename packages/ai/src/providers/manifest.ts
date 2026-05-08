/**
 * Provider manifest — single source of truth for the t3code-style nested model picker.
 *
 * Drives the chat composer's provider sub-menus (Codex, Claude Code, Gemini,
 * OpenCode, Cursor, Ollama) plus the existing OpenRouter cloud list. Keep this
 * file pure data + types: no React, no Node, no env access. Importable from
 * the renderer, the desktop main process, and Next.js route handlers alike.
 */

import { CHAT_MODEL_OPTIONS, OPENROUTER_MODELS } from '@weblab/models';

export type ProviderKind =
    | 'openrouter'
    | 'ollama'
    | 'codex'
    | 'claude-code'
    | 'gemini'
    | 'opencode'
    | 'cursor';

export type ProviderModelEntry = {
    id: string;
    label: string;
};

export type ProviderWebOAuth = {
    /** Path on this app that starts the OAuth flow (e.g. /api/auth/providers/gemini/start). */
    startPath: string;
    /** Stable identifier persisted in user_provider_connection.provider. */
    provider: string;
};

export type ProviderManifestEntry = {
    kind: ProviderKind;
    label: string;
    /** Icon name resolved against `Icons` in `@weblab/ui`. Renderer-only concern. */
    icon: string;
    /** Local CLI binary name. Absent for `openrouter` (cloud-only). */
    binary?: string;
    /** Documentation/install link shown in the setup dialog. */
    installUrl: string;
    /** Terminal command to authenticate the CLI (desktop path). Absent if not applicable. */
    authCommand?: string;
    /** OAuth flow on the hosted web — null when only the desktop path is supported. */
    webOAuth?: ProviderWebOAuth;
    /** Models exposed in the sub-menu. Empty for providers that only discover at runtime (Ollama, OpenCode). */
    models: ReadonlyArray<ProviderModelEntry>;
    /** Gemini-style "Custom model…" input. */
    supportsCustomModel?: boolean;
    /** OpenCode-style search box atop the submenu. */
    supportsModelSearch?: boolean;
    /** Ollama-only "Pull model…" / "Quit Ollama" affordances. */
    ollamaSpecials?: boolean;
};

const OPENROUTER_ENTRY: ProviderManifestEntry = {
    kind: 'openrouter',
    label: 'Cloud',
    icon: 'Sparkles',
    installUrl: 'https://openrouter.ai',
    models: CHAT_MODEL_OPTIONS.map((o) => ({ id: o.model, label: o.label })),
};

const OLLAMA_ENTRY: ProviderManifestEntry = {
    kind: 'ollama',
    label: 'Ollama',
    icon: 'BoxModel',
    binary: 'ollama',
    installUrl: 'https://ollama.com/download',
    models: [],
    ollamaSpecials: true,
};

const CODEX_ENTRY: ProviderManifestEntry = {
    kind: 'codex',
    label: 'Codex',
    icon: 'Sparkles',
    binary: 'codex',
    installUrl: 'https://github.com/openai/codex',
    authCommand: 'codex login',
    webOAuth: { startPath: '/api/auth/providers/codex/start', provider: 'codex' },
    models: [
        { id: 'gpt-5.4', label: 'GPT-5.4' },
        { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
        { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
        { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
        { id: 'gpt-5.2', label: 'GPT-5.2' },
        { id: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
    ],
};

const CLAUDE_CODE_ENTRY: ProviderManifestEntry = {
    kind: 'claude-code',
    label: 'Claude',
    icon: 'Cube',
    binary: 'claude',
    installUrl: 'https://docs.anthropic.com/en/docs/claude-code',
    authCommand: 'claude auth login',
    // Intentionally no webOAuth — Anthropic does not expose the consumer
    // subscription via OAuth, so Claude on hosted web stays "Desktop only".
    models: [
        { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
        { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
        { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    ],
};

const GEMINI_ENTRY: ProviderManifestEntry = {
    kind: 'gemini',
    label: 'Gemini',
    icon: 'GoogleLogo',
    binary: 'gemini',
    installUrl: 'https://github.com/google-gemini/gemini-cli',
    authCommand: 'gemini auth login',
    webOAuth: { startPath: '/api/auth/providers/gemini/start', provider: 'gemini' },
    models: [
        { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
        { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
    supportsCustomModel: true,
};

const OPENCODE_ENTRY: ProviderManifestEntry = {
    kind: 'opencode',
    label: 'OpenCode',
    icon: 'Code',
    binary: 'opencode',
    installUrl: 'https://opencode.ai',
    webOAuth: { startPath: '/api/auth/providers/opencode/start', provider: 'opencode' },
    // Models are discovered at runtime via the local app-server's HTTP API;
    // hardcoded list left empty so the picker shows a "Loading…" state until
    // the adapter populates it.
    models: [],
    supportsModelSearch: true,
};

const CURSOR_ENTRY: ProviderManifestEntry = {
    kind: 'cursor',
    label: 'Cursor',
    icon: 'CursorLogo',
    binary: 'cursor-agent',
    installUrl: 'https://docs.cursor.com/cli',
    authCommand: 'cursor-agent login',
    webOAuth: { startPath: '/api/auth/providers/cursor/start', provider: 'cursor' },
    models: [{ id: 'cursor-default', label: 'Cursor (default)' }],
};

/**
 * Render order for the picker. OpenRouter renders as a flat top section;
 * everything else renders as a sub-menu in this order.
 */
export const PROVIDER_MANIFEST: ReadonlyArray<ProviderManifestEntry> = [
    OPENROUTER_ENTRY,
    CODEX_ENTRY,
    CLAUDE_CODE_ENTRY,
    GEMINI_ENTRY,
    OPENCODE_ENTRY,
    CURSOR_ENTRY,
    OLLAMA_ENTRY,
];

const MANIFEST_BY_KIND: ReadonlyMap<ProviderKind, ProviderManifestEntry> = new Map(
    PROVIDER_MANIFEST.map((e) => [e.kind, e]),
);

export function getProviderManifest(kind: ProviderKind): ProviderManifestEntry {
    const entry = MANIFEST_BY_KIND.get(kind);
    if (!entry) throw new Error(`Unknown provider kind: ${kind}`);
    return entry;
}

/** Providers that can run their CLI on the user's machine (desktop path). */
export const CLI_PROVIDER_KINDS: ReadonlyArray<ProviderKind> = [
    'codex',
    'claude-code',
    'gemini',
    'opencode',
    'cursor',
];

/** Map a stored model string back to its provider — covers legacy single-string state. */
export function inferProviderFromModelId(model: string): ProviderKind {
    if (model.startsWith('ollama/')) return 'ollama';
    const cloud = OPENROUTER_ENTRY.models.find((m) => m.id === model);
    if (cloud) return 'openrouter';
    for (const entry of PROVIDER_MANIFEST) {
        if (entry.kind === 'openrouter' || entry.kind === 'ollama') continue;
        if (entry.models.some((m) => m.id === model)) return entry.kind;
    }
    return 'openrouter';
}

export type ProviderStatusKind = 'ready' | 'install' | 'sign-in' | 'desktop-only' | 'loading';

export type ProviderStatus = {
    kind: ProviderStatusKind;
    /** Live model list (Ollama tags, OpenCode discovery). Empty when status is not 'ready'. */
    discoveredModels?: ReadonlyArray<ProviderModelEntry>;
    /** Optional human-friendly version string for tooltips. */
    version?: string;
    /** Account email if signed in via web OAuth. */
    accountEmail?: string;
};

/**
 * Default status used by the renderer until the real probe resolves. We render
 * `loading` so the UI can show skeletons rather than "Install" CTAs that flash
 * for users who *do* have the binary.
 */
export const DEFAULT_PROVIDER_STATUS: ProviderStatus = { kind: 'loading' };

/**
 * Re-export of the existing default-model identifier so picker code can avoid
 * pulling from `@weblab/models` directly.
 */
export const DEFAULT_PROVIDER: ProviderKind = 'openrouter';
export const DEFAULT_MODEL_ID: string = OPENROUTER_MODELS.OPEN_AI_GPT_5_5;
