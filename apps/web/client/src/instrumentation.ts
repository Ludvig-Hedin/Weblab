import { registerOTel } from '@vercel/otel';
import { LangfuseExporter } from 'langfuse-vercel';

import { APP_NAME } from '@weblab/constants';

import { env } from '@/env';

export async function register() {
    // `register()` is invoked once per Next.js runtime (nodejs + edge). The
    // process crash handlers use `process.on`, which is a Node.js-only API —
    // calling it on the Edge Runtime aborts the instrumentation hook with
    // "A Node.js API is used (process.on) which is not supported in the Edge
    // Runtime" and breaks middleware on every request. Gate strictly on the
    // Node.js runtime. `NEXT_RUNTIME` is injected by Next.js itself and is
    // intentionally not part of the validated `@/env` schema.
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { registerProcessCrashHandlers } =
            await import('./instrumentation-crash-handlers.server');
        registerProcessCrashHandlers();
    }

    const hasLangfuseConfig = Boolean(env.LANGFUSE_SECRET_KEY && env.LANGFUSE_PUBLIC_KEY);

    registerOTel({
        serviceName: `${APP_NAME} Web`,
        ...(hasLangfuseConfig && { traceExporter: new LangfuseExporter() }),
    });
}
