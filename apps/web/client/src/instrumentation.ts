import { registerOTel } from '@vercel/otel';
import { LangfuseExporter } from 'langfuse-vercel';

import { APP_NAME } from '@weblab/constants';

import { env } from '@/env';

// Tracks whether we have already wired the global crash handlers. Next.js calls
// `register()` on each runtime boot (nodejs + edge) so this guards against
// double-registration of `process` listeners during dev HMR cycles.
let crashHandlersRegistered = false;

/**
 * Surface silent crashes in Railway logs.
 *
 * On 2026-05-20 the production container died silently after ~25 hours, with
 * no stack trace in Railway's log stream. With zero healthy replicas and the
 * default `restartPolicyMaxRetries: 10`, Railway gave up and the apex started
 * returning `502 Application failed to respond` from the edge.
 *
 * Most likely cause: an unhandled promise rejection / OOM SIGKILL that left
 * no JS-side trace. These handlers log the failure to stdout so Railway
 * captures a fingerprint before the process dies. They explicitly DO NOT
 * swallow the error — letting Node terminate is the right move so Railway
 * restarts the container under the `ON_FAILURE` policy. See
 * docs/agent-memory/architecture-decisions.md (2026-05-20 entry).
 */
function registerProcessCrashHandlers() {
    if (crashHandlersRegistered) return;
    if (typeof process === 'undefined' || typeof process.on !== 'function') return;

    crashHandlersRegistered = true;

    process.on('unhandledRejection', (reason, promise) => {
        console.error(
            '[fatal] unhandledRejection — letting Node exit so Railway restarts the container',
            { reason, promise },
        );
    });

    process.on('uncaughtException', (error, origin) => {
        console.error(
            '[fatal] uncaughtException — letting Node exit so Railway restarts the container',
            { error, origin },
        );
    });

    // SIGTERM is what Railway sends during a redeploy / shutdown. Log it so we
    // can distinguish "platform asked us to stop" from "we crashed".
    process.on('SIGTERM', () => {
        console.warn(
            '[shutdown] received SIGTERM — Railway is restarting or replacing this replica',
        );
    });
}

export function register() {
    // `register()` is invoked once per Next.js runtime (nodejs + edge). The
    // process crash handlers use `process.on`, which is a Node.js-only API —
    // calling it on the Edge Runtime aborts the instrumentation hook with
    // "A Node.js API is used (process.on) which is not supported in the Edge
    // Runtime" and breaks middleware on every request. Gate strictly on the
    // Node.js runtime. `NEXT_RUNTIME` is injected by Next.js itself and is
    // intentionally not part of the validated `@/env` schema.
    // eslint-disable-next-line no-restricted-properties
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        registerProcessCrashHandlers();
    }

    const hasLangfuseConfig = Boolean(env.LANGFUSE_SECRET_KEY && env.LANGFUSE_PUBLIC_KEY);

    registerOTel({
        serviceName: `${APP_NAME} Web`,
        ...(hasLangfuseConfig && { traceExporter: new LangfuseExporter() }),
    });
}
