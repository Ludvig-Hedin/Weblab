export interface WebviewMetadata {
    id: string;
    title: string;
    src: string;
}

export enum EditorMode {
    DESIGN = 'design',
    CODE = 'code',
    PREVIEW = 'preview',
    PAN = 'pan',
    COMMENT = 'comment',
    CMS = 'cms',
}

export enum CmsTabValue {
    COLLECTIONS = 'collections',
    FIELDS = 'fields',
    SOURCES = 'sources',
}

export enum InsertMode {
    INSERT_TEXT = 'insert-text',
    INSERT_DIV = 'insert-div',
    INSERT_FLEX_DIV = 'insert-flex-div',
    INSERT_BUTTON = 'insert-button',
    INSERT_HEADING = 'insert-heading',
    INSERT_LINK = 'insert-link',
    INSERT_INPUT = 'insert-input',
    INSERT_IMAGE = 'insert-image',
    INSERT_WEBLAB_LIST = 'insert-weblab-list',
}

export enum SettingsTabValue {
    // Global tabs
    ACCOUNT = 'account',
    APPEARANCE = 'appearance',
    LANGUAGE = 'language',
    EDITOR = 'editor',
    AI = 'ai',
    SHORTCUTS = 'shortcuts',
    GITHUB = 'github',
    GIT = 'git',
    SUBSCRIPTION = 'subscription',
    // Project tabs
    SITE = 'site',
    DOMAIN = 'domain',
    PROJECT = 'project',
    VERSIONS = 'versions',
    // Legacy alias
    PREFERENCES = 'account',
}

export enum LeftPanelTabValue {
    PAGES = 'pages',
    LAYERS = 'layers',
    SEARCH = 'search',
    INSERT = 'insert',
    COMPONENTS = 'components',
    IMAGES = 'images',
    WINDOWS = 'windows',
    BRAND = 'brand',
    BRANCHES = 'branches',
    APPS = 'apps',
}

export enum BrandTabValue {
    COLORS = 'colors',
    FONTS = 'fonts',
}

export enum BranchTabValue {
    MANAGE = 'manage',
}

export enum MouseAction {
    MOVE = 'move',
    MOUSE_DOWN = 'click',
    DOUBLE_CLICK = 'double-click',
}
