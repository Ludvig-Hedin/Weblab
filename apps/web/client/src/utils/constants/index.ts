export const Routes = {
    // Landing page
    HOME: '/',
    PRICING: '/pricing',
    FAQ: '/faq',
    ABOUT: '/about',
    CAREERS: '/careers',
    SITEMAP: '/site-map',
    DOWNLOAD: '/download',
    FEATURES: '/features',
    FEATURES_AI: '/features/ai',
    FEATURES_AI_FRONTEND: '/features/ai-for-frontend',
    FEATURES_BUILDER: '/features/builder',
    FEATURES_PROTOTYPE: '/features/prototype',

    // Workflows
    WORKFLOWS: '/workflows',
    WORKFLOWS_CLAUDE_CODE: '/workflows/claude-code',
    WORKFLOWS_VIBE_CODING: '/workflows/vibe-coding',

    // Auth
    LOGIN: '/login',
    AUTH_CALLBACK: '/auth/callback',
    AUTH_CODE_ERROR: '/auth/auth-code-error',
    AUTH_REDIRECT: '/auth/redirect',
    DEMO_ONLY: '/see-a-demo',

    // Dashboard
    PROJECTS: '/projects',
    PROJECT: '/project',
    NEW_PROJECT: '/projects/new',
    IMPORT_PROJECT: '/projects/import',
    IMPORT_GITHUB: '/projects/import/github',

    // Callback
    CALLBACK_STRIPE_SUCCESS: '/callback/stripe/success',
    CALLBACK_STRIPE_CANCEL: '/callback/stripe/cancel',
    CALLBACK_GITHUB_INSTALL: '/callback/github/install',
} as const;

export const ExternalRoutes = {
    DOCS: 'https://docs.weblab.build',
    BLOG: 'https://onlook.substack.com',
    X: 'https://x.com/weblab',
    GITHUB: 'https://github.com/Ludvig-Hedin/Weblab',
    CONTACT: 'mailto:contact@weblab.build',
    LINKEDIN: 'https://www.linkedin.com/company/weblab/',
    YOUTUBE: 'https://www.youtube.com/@weblab',
    SUBSTACK: 'https://onlook.substack.com/',
    DISCORD: 'https://discord.gg/ZZzadNQtns',
    BOOK_DEMO: 'https://meetings.hubspot.com/daniel-onlook/onboarding-to-onlook-with-daniel',
    DOWNLOAD_MAC: 'https://github.com/weblab/weblab/releases/latest/download/Weblab.dmg',
    DOWNLOAD_WIN: 'https://github.com/weblab/weblab/releases/latest/download/Weblab-Setup.exe',
    DOWNLOAD_LINUX: 'https://github.com/weblab/weblab/releases/latest/download/Weblab.AppImage',
    // iOS — placeholder until App Store listing is live. Until then point at
    // the TestFlight invite URL or the GitHub release for the unsigned IPA.
    DOWNLOAD_IOS: 'https://testflight.apple.com/join/PLACEHOLDER',
    DOWNLOAD_PAGE: 'https://github.com/weblab/weblab/releases/latest',
};

export const Git = {
    MAX_COMMIT_MESSAGE_LENGTH: 72,
    MAX_COMMIT_MESSAGE_BODY_LENGTH: 500,
} as const;

export const LocalForageKeys = {
    RETURN_URL: 'returnUrl',
    /** Set before opening the auth modal when the user clicks "Open local folder"
     *  while signed out. Consumed by useImportLocalProject to re-open the picker
     *  automatically after a successful sign-in. */
    PENDING_LOCAL_IMPORT: 'pendingLocalImport',
} as const;
