import { registerOTel } from '@vercel/otel';
import { LangfuseExporter } from 'langfuse-vercel';

import { APP_NAME } from '@weblab/constants';

export function register() {
    registerOTel({ serviceName: `${APP_NAME} Web`, traceExporter: new LangfuseExporter() });
}
