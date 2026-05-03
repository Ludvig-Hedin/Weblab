import { Orientation, Theme } from './frame';

export const APP_NAME = 'Weblab';
export const APP_DOMAIN = 'weblab.build';
export const APP_TAGLINE = 'Cursor for Designers';
export const APP_SCHEMA = 'onlook'; // keep: URL protocol, backend contract
export const HOSTING_DOMAIN = 'onlook.live'; // keep: hosting infra, change in Phase 2
export const MAX_NAME_LENGTH = 50;
export enum EditorAttributes {
    // DOM attributes
    WEBLAB_TOOLBAR = 'weblab-toolbar',
    WEBLAB_RECT_ID = 'weblab-rect',
    WEBLAB_STYLESHEET_ID = 'weblab-stylesheet',
    WEBLAB_STUB_ID = 'weblab-drag-stub',
    WEBLAB_MOVE_KEY_PREFIX = 'wbl-',
    OVERLAY_CONTAINER_ID = 'overlay-container',
    CANVAS_CONTAINER_ID = 'canvas-container',
    STYLESHEET_ID = 'weblab-default-stylesheet',

    // IDs (short codes injected into compiled output — kept stable)
    DATA_WEBLAB_ID = 'data-oid',
    DATA_WEBLAB_INSTANCE_ID = 'data-oiid',
    DATA_WEBLAB_DOM_ID = 'data-odid',
    DATA_WEBLAB_COMPONENT_NAME = 'data-ocname',

    // Data attributes
    DATA_WEBLAB_IGNORE = 'data-weblab-ignore',
    DATA_WEBLAB_INSERTED = 'data-weblab-inserted',
    DATA_WEBLAB_DRAG_SAVED_STYLE = 'data-weblab-drag-saved-style',
    DATA_WEBLAB_DRAGGING = 'data-weblab-dragging',
    DATA_WEBLAB_DRAG_DIRECTION = 'data-weblab-drag-direction',
    DATA_WEBLAB_DRAG_START_POSITION = 'data-weblab-drag-start-position',
    DATA_WEBLAB_NEW_INDEX = 'data-weblab-new-index',
    DATA_WEBLAB_EDITING_TEXT = 'data-weblab-editing-text',
    DATA_WEBLAB_DYNAMIC_TYPE = 'data-weblab-dynamic-type',
    DATA_WEBLAB_CORE_ELEMENT_TYPE = 'data-weblab-core-element-type',
}

export const DefaultSettings = {
    SCALE: 0.7,
    PAN_POSITION: { x: 175, y: 100 },
    URL: 'http://localhost:3000/',
    ASPECT_RATIO_LOCKED: false,
    DEVICE: 'Custom:Custom',
    THEME: Theme.System,
    ORIENTATION: Orientation.Portrait,
    MIN_DIMENSIONS: { width: '280px', height: '360px' },
    COMMANDS: {
        run: 'bun run dev',
        build: 'bun run build',
        install: 'bun install',
    },
    IMAGE_FOLDER: 'public',
    IMAGE_DIMENSION: { width: '100px', height: '100px' },
    FONT_FOLDER: 'fonts',
    FONT_CONFIG: 'app/fonts.ts',
    TAILWIND_CONFIG: 'tailwind.config.ts',
    CHAT_SETTINGS: {
        showSuggestions: true,
        autoApplyCode: true,
        expandCodeBlocks: false,
        showMiniChat: false,
        maxImages: 5,
    },
    EDITOR_SETTINGS: {
        shouldWarnDelete: false,
        enableBunReplace: true,
        buildFlags: '--no-lint',
    },
    AI_SETTINGS: {
        defaultModel: 'moonshotai/kimi-k2',
        showSuggestions: true,
        showMiniChat: false,
        autoApplyCode: true,
        expandCodeBlocks: false,
        maxImages: 5,
    },
    APPEARANCE_SETTINGS: {
        theme: 'system' as const,
        accentColor: 'blue' as const,
        fontFamily: 'sans' as const,
        fontSize: 'medium' as const,
        uiDensity: 'comfortable' as const,
    },
    LANGUAGE_SETTINGS: {
        locale: 'en' as const,
    },
    GIT_SETTINGS: {
        autoCommit: false,
        autoPush: false,
        commitMessageFormat: 'feat: {description}',
        defaultBranchPattern: 'feature/{timestamp}',
    },
};

export const DEFAULT_COLOR_NAME = 'DEFAULT';
