export const Routes = {
    // Landing page
    HOME: '/',
    PRICING: '/pricing',
    FAQ: '/faq',
    ABOUT: '/about',
    SITEMAP: '/site-map',
    DOWNLOAD: '/download',
    BLOG: '/blog',
    CHANGELOG: '/changelog',
    SECURITY: '/security',
    FEATURES: '/features',
    FEATURES_AI: '/features/ai',
    FEATURES_AI_FRONTEND: '/features/ai-for-frontend',
    FEATURES_BUILDER: '/features/builder',
    FEATURES_PROTOTYPE: '/features/prototype',
    COMPARE: '/compare',

    // Workflows
    WORKFLOWS: '/workflows',
    WORKFLOWS_CLAUDE_CODE: '/workflows/claude-code',
    WORKFLOWS_VIBE_CODING: '/workflows/vibe-coding',
    WORKFLOWS_CODEX: '/workflows/codex',

    // Auth — Clerk sign-in/sign-up flow. The legacy `/login` route directory
    // was deleted during the Clerk migration; these point at the live routes.
    LOGIN: '/sign-in',
    LOGIN_VERIFY: '/sign-in/verify',
    AUTH_CALLBACK: '/auth/callback',
    AUTH_CODE_ERROR: '/auth/auth-code-error',
    AUTH_REDIRECT: '/auth/redirect',
    PROFILE_SETUP: '/profile-setup',

    // Dashboard
    PROJECTS: '/projects',
    MARKETPLACE: '/projects/marketplace',
    PROJECT: '/project',
    NEW_PROJECT: '/projects/new',
    PROJECT_CREATING: '/projects/creating',
    PROJECT_TEMPLATES: '/projects/templates',
    IMPORT_PROJECT: '/projects/import',
    IMPORT_GITHUB: '/projects/import/github',
    IMPORT_FIGMA: '/projects/import/figma',

    // Callback
    CALLBACK_STRIPE_SUCCESS: '/callback/stripe/success',
    CALLBACK_STRIPE_CANCEL: '/callback/stripe/cancel',
    CALLBACK_GITHUB_INSTALL: '/callback/github/install',
} as const;

export const ExternalRoutes = {
    DOCS: 'https://docs.weblab.build',
    GITHUB: 'https://github.com/Ludvig-Hedin/Weblab',
    CONTACT: 'mailto:contact@weblab.build',
    LINKEDIN: 'https://www.linkedin.com/company/weblab/',
    YOUTUBE: 'https://www.youtube.com/@weblab',
    SUBSTACK: 'https://weblab.substack.com/',
    // First-party download endpoints (/api/download/[platform]) — they 302 to
    // the latest release asset so the browser downloads the installer in
    // place instead of navigating to a GitHub page. The macOS build is a
    // single universal DMG (Intel + Apple Silicon), so the "Intel" link
    // serves the same artifact.
    DOWNLOAD_MAC: '/api/download/mac',
    DOWNLOAD_MAC_INTEL: '/api/download/mac-intel',
    DOWNLOAD_WIN: '/api/download/windows',
    DOWNLOAD_LINUX: '/api/download/linux',
    // iOS — placeholder until App Store listing is live. Until then point at
    // the TestFlight invite URL or the GitHub release for the unsigned IPA.
    DOWNLOAD_IOS: 'https://testflight.apple.com/join/PLACEHOLDER',
    // Our own download page — never the GitHub releases page.
    DOWNLOAD_PAGE: '/download',
};

export const Git = {
    MAX_COMMIT_MESSAGE_LENGTH: 72,
    MAX_COMMIT_MESSAGE_BODY_LENGTH: 500,
} as const;

export const LocalForageKeys = {
    RETURN_URL: 'returnUrl',
    /** Set before opening the auth modal when the user clicks "Import folder to cloud"
     *  while signed out. Consumed by useImportLocalProject to re-open the picker
     *  automatically after a successful sign-in. */
    PENDING_LOCAL_IMPORT: 'pendingLocalImport',
    /** Set once the first-run editor onboarding tour has been seen (or dismissed).
     *  Read on editor mount; the tour is suppressed when this flag is truthy. */
    ONBOARDING_SEEN: 'weblab-onboarding-seen',
    /** Project id the user most recently opened. Used by the offline bootstrap
     *  to know which project to fall through to when a SSR fetch fails. */
    LAST_OPENED_PROJECT_ID: 'weblab-last-opened-project-id',
    /**
     * Per-branch undo/redo history persisted to IndexedDB. Keyed by branch id.
     * Schema-versioned so stale entries are discarded on format change.
     */
    BRANCH_HISTORY: (branchId: string) => `weblab_history_v1_${branchId}`,
} as const;

/** Convenience export — the tour module imports this directly. */
export const ONBOARDING_SEEN_KEY = LocalForageKeys.ONBOARDING_SEEN;

/** Per-project key tracking which conversation the user last had open.
 *  Used to restore the same chat thread on return instead of defaulting to
 *  whichever conversation was most-recently `updatedAt` (which can change
 *  due to auto-titling, collaborator edits, etc.). */
export const lastActiveConversationKey = (projectId: string) =>
    `lastActiveConversation:${projectId}`;
