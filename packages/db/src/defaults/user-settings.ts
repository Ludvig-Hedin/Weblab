import { v4 as uuid } from 'uuid';

import type { UserSettings as DbUserSettings } from '@weblab/db';
import { DefaultSettings } from '@weblab/constants';

export const createDefaultUserSettings = (userId: string): DbUserSettings => {
    return {
        id: uuid(),
        userId,
        autoApplyCode: DefaultSettings.CHAT_SETTINGS.autoApplyCode,
        expandCodeBlocks: DefaultSettings.CHAT_SETTINGS.expandCodeBlocks,
        showSuggestions: DefaultSettings.CHAT_SETTINGS.showSuggestions,
        showMiniChat: DefaultSettings.CHAT_SETTINGS.showMiniChat,
        shouldWarnDelete: DefaultSettings.EDITOR_SETTINGS.shouldWarnDelete,
        defaultModel: null,
        ollamaBaseUrl: null,
        maxImages: DefaultSettings.AI_SETTINGS.maxImages,
        enableBunReplace: DefaultSettings.EDITOR_SETTINGS.enableBunReplace,
        buildFlags: DefaultSettings.EDITOR_SETTINGS.buildFlags,
        theme: DefaultSettings.APPEARANCE_SETTINGS.theme,
        accentColor: DefaultSettings.APPEARANCE_SETTINGS.accentColor,
        fontFamily: DefaultSettings.APPEARANCE_SETTINGS.fontFamily,
        fontSize: DefaultSettings.APPEARANCE_SETTINGS.fontSize,
        uiDensity: DefaultSettings.APPEARANCE_SETTINGS.uiDensity,
        locale: DefaultSettings.LANGUAGE_SETTINGS.locale,
        autoCommit: DefaultSettings.GIT_SETTINGS.autoCommit,
        autoPush: DefaultSettings.GIT_SETTINGS.autoPush,
        commitMessageFormat: DefaultSettings.GIT_SETTINGS.commitMessageFormat,
        defaultBranchPattern: DefaultSettings.GIT_SETTINGS.defaultBranchPattern,
        customShortcuts: {},
    };
};
