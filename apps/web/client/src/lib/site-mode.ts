import { env } from '@/env';

/**
 * Site mode switch. See docs/guides/local-app-mode.md.
 *
 * - `cloud` (default): the full hosted Weblab web app and marketing site.
 * - `local`: weblab.build only promotes the Mac app (weblab-local). Sign-up,
 *   pricing and cloud-only claims are hidden; sign-in is limited to the
 *   allowlist. Nothing is deleted, flip the env var back to restore it all.
 *
 * Defaults are repeated here because the Docker build and runtime set
 * SKIP_ENV_VALIDATION, which skips the zod defaults in `env.ts`.
 */
export const IS_LOCAL_APP_MODE = env.NEXT_PUBLIC_SITE_MODE === 'local';

export const LOCAL_APP_DOWNLOAD_URL =
    env.NEXT_PUBLIC_LOCAL_APP_DOWNLOAD_URL ||
    'https://github.com/Ludvig-Hedin/airship/releases/latest/download/Weblab-mac-arm64.dmg';
