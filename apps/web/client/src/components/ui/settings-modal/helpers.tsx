export enum SettingsTabValue {
    // Global tabs
    ACCOUNT = 'account',
    APPEARANCE = 'appearance',
    LANGUAGE = 'language',
    EDITOR = 'editor',
    AI = 'ai',
    SKILLS = 'skills',
    SHORTCUTS = 'shortcuts',
    GITHUB = 'github',
    GIT = 'git',
    SUBSCRIPTION = 'subscription',
    // Project tabs
    SITE = 'site',
    DOMAIN = 'domain',
    SITE_ACCESS = 'site access',
    SEO = 'seo',
    PROJECT = 'project',
    VERSIONS = 'versions',
}

export interface SettingTab {
    label: SettingsTabValue | string;
    icon: React.ReactNode;
    component: React.ReactNode;
}

// Bug fix #58: Removed unused ComingSoonTab export — no callers in the codebase.
