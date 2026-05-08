import { registerOTel } from '@vercel/otel';
import { LangfuseExporter } from 'langfuse-vercel';

import { APP_NAME } from '@weblab/constants';

import { env } from '@/env';

export function register() {
    const hasLangfuseConfig = Boolean(env.LANGFUSE_SECRET_KEY && env.LANGFUSE_PUBLIC_KEY);

    registerOTel({
        serviceName: `${APP_NAME} Web`,
        ...(hasLangfuseConfig && { traceExporter: new LangfuseExporter() }),
    });
}
