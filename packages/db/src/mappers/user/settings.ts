import type { UserSettings } from '@weblab/models';
import { DefaultSettings } from '@weblab/constants';

import type { UserSettings as DbUserSettings } from '../../schema';

export const fromDbUserSettings = (settings: DbUserSettings): UserSettings => {
    return {
        id: settings.id,
        // chat shares the four behaviour flags with ai (same DB columns).
        // ai is the canonical write path (see toDbUserSettings), so we use
        // AI_SETTINGS defaults here to keep fallback values consistent.
        chat: {
            autoApplyCode: settings.autoApplyCode ?? DefaultSettings.AI_SETTINGS.autoApplyCode,
            expandCodeBlocks:
                settings.expandCodeBlocks ?? DefaultSettings.AI_SETTINGS.expandCodeBlocks,
            showSuggestions:
                settings.showSuggestions ?? DefaultSettings.AI_SETTINGS.showSuggestions,
            showMiniChat: settings.showMiniChat ?? DefaultSettings.AI_SETTINGS.showMiniChat,
            defaultModel: settings.defaultModel ?? DefaultSettings.AI_SETTINGS.defaultModel,
            ollamaBaseUrl: settings.ollamaBaseUrl ?? undefined,
        },
        editor: {
            shouldWarnDelete:
                settings.shouldWarnDelete ?? DefaultSettings.EDITOR_SETTINGS.shouldWarnDelete,
            enableBunReplace:
                settings.enableBunReplace ?? DefaultSettings.EDITOR_SETTINGS.enableBunReplace,
            buildFlags: settings.buildFlags ?? DefaultSettings.EDITOR_SETTINGS.buildFlags,
        },
        ai: {
            defaultModel: settings.defaultModel ?? DefaultSettings.AI_SETTINGS.defaultModel,
            showSuggestions:
                settings.showSuggestions ?? DefaultSettings.AI_SETTINGS.showSuggestions,
            showMiniChat: settings.showMiniChat ?? DefaultSettings.AI_SETTINGS.showMiniChat,
            autoApplyCode: settings.autoApplyCode ?? DefaultSettings.AI_SETTINGS.autoApplyCode,
            expandCodeBlocks:
                settings.expandCodeBlocks ?? DefaultSettings.AI_SETTINGS.expandCodeBlocks,
            maxImages: settings.maxImages ?? DefaultSettings.AI_SETTINGS.maxImages,
        },
        appearance: {
            theme:
                (settings.theme as UserSettings['appearance']['theme']) ??
                DefaultSettings.APPEARANCE_SETTINGS.theme,
            accentColor:
                (settings.accentColor as UserSettings['appearance']['accentColor']) ??
                DefaultSettings.APPEARANCE_SETTINGS.accentColor,
            fontFamily:
                (settings.fontFamily as UserSettings['appearance']['fontFamily']) ??
                DefaultSettings.APPEARANCE_SETTINGS.fontFamily,
            fontSize:
                (settings.fontSize as UserSettings['appearance']['fontSize']) ??
                DefaultSettings.APPEARANCE_SETTINGS.fontSize,
            uiDensity:
                (settings.uiDensity as UserSettings['appearance']['uiDensity']) ??
                DefaultSettings.APPEARANCE_SETTINGS.uiDensity,
        },
        language: {
            locale:
                (settings.locale as UserSettings['language']['locale']) ??
                DefaultSettings.LANGUAGE_SETTINGS.locale,
        },
        git: {
            autoCommit: settings.autoCommit ?? DefaultSettings.GIT_SETTINGS.autoCommit,
            autoPush: settings.autoPush ?? DefaultSettings.GIT_SETTINGS.autoPush,
            commitMessageFormat:
                settings.commitMessageFormat ?? DefaultSettings.GIT_SETTINGS.commitMessageFormat,
            defaultBranchPattern:
                settings.defaultBranchPattern ?? DefaultSettings.GIT_SETTINGS.defaultBranchPattern,
        },
        customShortcuts: (settings.customShortcuts as Record<string, string>) ?? {},
    };
};

export const toDbUserSettings = (userId: string, settings: UserSettings): DbUserSettings => {
    return {
        id: settings.id,
        userId,
        autoApplyCode: settings.ai.autoApplyCode,
        expandCodeBlocks: settings.ai.expandCodeBlocks,
        showSuggestions: settings.ai.showSuggestions,
        showMiniChat: settings.ai.showMiniChat,
        maxImages: settings.ai.maxImages,
        defaultModel: settings.ai.defaultModel,
        ollamaBaseUrl: settings.chat.ollamaBaseUrl ?? null,
        shouldWarnDelete: settings.editor.shouldWarnDelete,
        enableBunReplace: settings.editor.enableBunReplace,
        buildFlags: settings.editor.buildFlags,
        theme: settings.appearance.theme,
        accentColor: settings.appearance.accentColor,
        fontFamily: settings.appearance.fontFamily,
        fontSize: settings.appearance.fontSize,
        uiDensity: settings.appearance.uiDensity,
        locale: settings.language.locale,
        autoCommit: settings.git.autoCommit,
        autoPush: settings.git.autoPush,
        commitMessageFormat: settings.git.commitMessageFormat,
        defaultBranchPattern: settings.git.defaultBranchPattern,
        customShortcuts: settings.customShortcuts ?? {},
    };
};
