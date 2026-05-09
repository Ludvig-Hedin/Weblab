export interface UserSettings {
    id: string;
    chat: ChatSettings;
    editor: EditorSettings;
    ai: AISettings;
    appearance: AppearanceSettings;
    language: LanguageSettings;
    git: GitSettings;
    customShortcuts: Record<string, string>;
}

/** Shared behaviour flags that live in a single DB column set and appear in both chat and AI settings. */
export interface AIBehaviorSettings {
    showSuggestions: boolean;
    showMiniChat: boolean;
    autoApplyCode: boolean;
    expandCodeBlocks: boolean;
}

/**
 * Chat-related fields surfaced to the chat UI. Includes the user's chosen
 * default model and the Ollama base URL.
 *
 * Behaviour flags (`showSuggestions`, `showMiniChat`, `autoApplyCode`,
 * `expandCodeBlocks`) are intentionally inherited from `AIBehaviorSettings`
 * — they are shared with `AISettings` because the underlying DB columns are
 * shared. Always read/write through one interface; do not split a single
 * logical change across both. (CR-026)
 */
export interface ChatSettings extends AIBehaviorSettings {
    defaultModel?: string;
    ollamaBaseUrl?: string;
}

/**
 * AI-tab settings surface. The required `defaultModel` reflects that the
 * settings UI always renders a value (defaulting to {@link DEFAULT_CHAT_MODEL}
 * when no user preference exists).
 */
export interface AISettings extends AIBehaviorSettings {
    defaultModel: string;
    maxImages: number;
    /** Cmd+K inline edit on a code selection. */
    enableInlineEdit?: boolean;
    /** Tab/ghost-text autocomplete in the code editor. Off by default — opt-in. */
    enableTabAutocomplete?: boolean;
    /** One-click "Fix with AI" affordance on errors. */
    enableErrorFix?: boolean;
    /** Cmd+K on a selected element in the canvas designer. */
    enableDesignerInlineEdit?: boolean;
    /** Optional override for the inline-edit / fix model (defaults to GPT-5.4 mini). */
    inlineEditModel?: string;
    /** Optional override for the tab-complete model (defaults to Codestral). */
    tabCompleteModel?: string;
}

export interface EditorSettings {
    shouldWarnDelete: boolean;
    enableBunReplace: boolean;
    buildFlags: string;
}

export interface AppearanceSettings {
    theme: 'light' | 'dark' | 'system';
    accentColor: 'blue' | 'red' | 'green' | 'neutral';
    fontFamily: 'sans' | 'serif';
    fontSize: 'small' | 'medium' | 'large';
    uiDensity: 'compact' | 'comfortable';
}

export interface LanguageSettings {
    locale: 'en' | 'ja' | 'zh' | 'ko';
}

export interface GitSettings {
    autoCommit: boolean;
    autoPush: boolean;
    commitMessageFormat: string;
    defaultBranchPattern: string;
}
