const isDev = process.env.NODE_ENV === 'development';
const BASE_EXCLUDED_DIRECTORIES = ['node_modules', 'dist', 'build', '.git', '.next'] as const;

export const CUSTOM_OUTPUT_DIR = '.next-prod';
export const WEBLAB_CACHE_DIRECTORY = '.weblab';

// Preload script. Fetch from local public folder in dev, fetch from CDN in prod.
export const WEBLAB_PRELOAD_SCRIPT_FILE = 'weblab-preload-script.js';
// Fetch path to load from local
export const WEBLAB_DEV_PRELOAD_SCRIPT_SRC = `/${WEBLAB_PRELOAD_SCRIPT_FILE}`;
// Path to write into sandbox
export const WEBLAB_DEV_PRELOAD_SCRIPT_PATH = `public/${WEBLAB_PRELOAD_SCRIPT_FILE}`;
// Fetch url to load from CDN.
//
// jsDelivr serves this file from the PINNED commit only — it does not track a
// branch. So whenever the preload bundle is rebuilt
// (apps/web/client/public/weblab-preload-script.js), you MUST:
//   1. push the rebuilt bundle to a commit on `main`,
//   2. bump this SHA to that commit, AND
//   3. append the PREVIOUS url to PRIOR_WEBLAB_PROD_PRELOAD_SCRIPT_SRCS below.
// Step 3 lets the layout injector strip the stale <Script> tag baked into
// existing user projects and re-inject the current one on next sandbox boot.
// Skipping the bump silently breaks every preload method added since the pin —
// penpal throws "Method `X` is not found" (incident: copy-to-figma, 2026-06-17).
// After bumping, run `bun run check:preload-pin` to confirm jsDelivr serves the
// new bundle with every client-required method BEFORE deploying.
// TODO(preload-pin): the SHA still needs a manual bump per rebuild; full removal
// (app-origin delivery) is tracked in BACKLOG "Prod preload pin staleness".
const WEBLAB_PROD_PRELOAD_SCRIPT_SRC =
    'https://cdn.jsdelivr.net/gh/Ludvig-Hedin/Weblab@d73589eedb16a13b17b8bf5edf22511bde77053a/apps/web/client/public/weblab-preload-script.js';
// Superseded prod pins. Every previous WEBLAB_PROD_PRELOAD_SCRIPT_SRC must live
// here so projects whose layout baked in an old URL get migrated to the current
// pin via DEPRECATED_PRELOAD_SCRIPT_SRCS below.
const PRIOR_WEBLAB_PROD_PRELOAD_SCRIPT_SRCS = [
    'https://cdn.jsdelivr.net/gh/Ludvig-Hedin/Weblab@ec326199ed4eb89b135594a4ad57277c625aa9ac/apps/web/client/public/weblab-preload-script.js',
];
// Officially exported src to load from local or CDN
export const WEBLAB_PRELOAD_SCRIPT_SRC = isDev
    ? WEBLAB_DEV_PRELOAD_SCRIPT_SRC
    : WEBLAB_PROD_PRELOAD_SCRIPT_SRC;

export const DEPRECATED_PRELOAD_SCRIPT_SRCS = [
    '/onlook-preload-script.js',
    'https://cdn.jsdelivr.net/gh/onlook-dev/onlook@d3887f2/apps/web/client/public/onlook-preload-script.js',
    'https://cdn.jsdelivr.net/gh/onlook-dev/onlook@main/apps/web/client/public/onlook-preload-script.js',
    // Superseded weblab prod pins — strip + migrate stale tags baked into layouts.
    ...PRIOR_WEBLAB_PROD_PRELOAD_SCRIPT_SRCS,
    // Intentionally reversed to deprecate non-preferred (local in prod, CDN in dev) usage.
    isDev ? WEBLAB_PROD_PRELOAD_SCRIPT_SRC : WEBLAB_DEV_PRELOAD_SCRIPT_SRC,
];

// IX runtime — Webflow-style Interactions runtime bundle. Ships into user's
// preview iframe AND published site. Distinct from preload script (which is
// editor-only). Read by `<Script>` injected in root layout / static HTML head.
export const WEBLAB_IX_RUNTIME_FILE = 'weblab-ix-runtime.js';
export const WEBLAB_DEV_IX_RUNTIME_SRC = `/${WEBLAB_IX_RUNTIME_FILE}`;
export const WEBLAB_DEV_IX_RUNTIME_PATH = `public/${WEBLAB_IX_RUNTIME_FILE}`;
const WEBLAB_PROD_IX_RUNTIME_SRC = `/${WEBLAB_IX_RUNTIME_FILE}`;
export const WEBLAB_IX_RUNTIME_SRC = isDev ? WEBLAB_DEV_IX_RUNTIME_SRC : WEBLAB_PROD_IX_RUNTIME_SRC;
export const DEPRECATED_IX_RUNTIME_SRCS: string[] = [];

// Interactions config — source of truth in `.weblab/interactions.json`, mirrored
// to `public/_weblab/interactions.json` (Next.js) or `__weblab-interactions.json`
// (static HTML root) so the runtime can fetch it at page load.
export const WEBLAB_INTERACTIONS_FILE = 'interactions.json';
export const WEBLAB_INTERACTIONS_INITIAL_CSS_FILE = 'interactions-initial.css';
export const WEBLAB_INTERACTIONS_CACHE_PATH = `${WEBLAB_CACHE_DIRECTORY}/${WEBLAB_INTERACTIONS_FILE}`;
export const WEBLAB_INTERACTIONS_PUBLIC_DIR = 'public/_weblab';
export const WEBLAB_INTERACTIONS_PUBLIC_PATH = `${WEBLAB_INTERACTIONS_PUBLIC_DIR}/${WEBLAB_INTERACTIONS_FILE}`;
export const WEBLAB_INTERACTIONS_PUBLIC_INITIAL_CSS_PATH = `${WEBLAB_INTERACTIONS_PUBLIC_DIR}/${WEBLAB_INTERACTIONS_INITIAL_CSS_FILE}`;
export const WEBLAB_INTERACTIONS_STATIC_HTML_PATH = `__weblab-${WEBLAB_INTERACTIONS_FILE}`;
export const WEBLAB_INTERACTIONS_STATIC_HTML_INITIAL_CSS_PATH = `__weblab-${WEBLAB_INTERACTIONS_INITIAL_CSS_FILE}`;
export const WEBLAB_INTERACTIONS_PUBLIC_SRC = `/_weblab/${WEBLAB_INTERACTIONS_FILE}`;
export const WEBLAB_INTERACTIONS_PUBLIC_INITIAL_CSS_SRC = `/_weblab/${WEBLAB_INTERACTIONS_INITIAL_CSS_FILE}`;

export const DEFAULT_IMAGE_DIRECTORY = 'public';

// Files in otherwise-excluded directories that we DO want to sync (the
// `.weblab/` cache is excluded wholesale, but interactions.json must
// round-trip so external editors can read/write it).
export const SYNC_FILE_OVERRIDES = [WEBLAB_INTERACTIONS_CACHE_PATH];

export const EXCLUDED_SYNC_PATHS = [
    ...BASE_EXCLUDED_DIRECTORIES,
    'static',
    'out',
    CUSTOM_OUTPUT_DIR,
    WEBLAB_CACHE_DIRECTORY,
    WEBLAB_DEV_PRELOAD_SCRIPT_PATH,
    WEBLAB_DEV_IX_RUNTIME_PATH,
];

export const IGNORED_UPLOAD_DIRECTORIES = [...BASE_EXCLUDED_DIRECTORIES, CUSTOM_OUTPUT_DIR];

export const EXCLUDED_PUBLISH_DIRECTORIES = [...BASE_EXCLUDED_DIRECTORIES, 'coverage'];

const JSX_FILE_EXTENSIONS = ['.jsx', '.tsx'];

export const JS_FILE_EXTENSIONS = ['.js', '.ts', '.mjs', '.cjs'];

// Nextjs allow jsx in js and ts files so we need to support both
export const NEXT_JS_FILE_EXTENSIONS = [...JSX_FILE_EXTENSIONS, ...JS_FILE_EXTENSIONS];

export const SUPPORTED_LOCK_FILES = [
    'bun.lock',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
];

export const BINARY_EXTENSIONS = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.bmp',
    '.svg',
    '.ico',
    '.webp',
    '.pdf',
    '.zip',
    '.tar',
    '.gz',
    '.rar',
    '.7z',
    '.mp3',
    '.mp4',
    '.wav',
    '.avi',
    '.mov',
    '.wmv',
    '.exe',
    '.bin',
    '.dll',
    '.so',
    '.dylib',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.otf',
];

export const IGNORED_UPLOAD_FILES = [
    '.DS_Store',
    'Thumbs.db',
    'yarn.lock',
    'package-lock.json',
    'pnpm-lock.yaml',
    'bun.lockb',
    '.env.local',
    '.env.development.local',
    '.env.production.local',
    '.env.test.local',
];

export const IMAGE_EXTENSIONS = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/ico',
    'image/x-icon',
    'image/avif',
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
];

// File-extension groups used to classify assets in the editor Assets panel.
export const FONT_FILE_EXTENSIONS = ['.woff', '.woff2', '.ttf', '.eot', '.otf'];

export const DOCUMENT_FILE_EXTENSIONS = [
    '.pdf',
    '.txt',
    '.md',
    '.mdx',
    '.csv',
    '.rtf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
];

/**
 * Compression presets for common use cases
 */
export const COMPRESSION_IMAGE_PRESETS = {
    web: {
        quality: 80,
        format: 'webp' as const,
        progressive: true,
        effort: 4,
    },
    thumbnail: {
        quality: 70,
        width: 300,
        height: 300,
        format: 'webp' as const,
        keepAspectRatio: true,
    },
    highQuality: {
        quality: 95,
        format: 'jpeg' as const,
        progressive: true,
        mozjpeg: true,
    },
    lowFileSize: {
        quality: 60,
        format: 'webp' as const,
        effort: 6,
    },
} as const;
