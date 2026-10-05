import { expect, it } from 'bun:test';

it('keeps startup telemetry from consuming fetch responses while retaining tracing', async () => {
    // OTel and crash handlers mutate process globals, so exercise real startup in isolation.
    const script = `
        import { strict as assert } from 'node:assert';
        import { mock } from 'bun:test';
        import { trace } from '@opentelemetry/api';

        let exporterCreated = false;
        mock.module(${JSON.stringify(new URL('./env.ts', import.meta.url).pathname)}, () => ({
            env: { LANGFUSE_SECRET_KEY: 'fixture-secret', LANGFUSE_PUBLIC_KEY: 'fixture-public' },
        }));
        mock.module('langfuse-vercel', () => ({
            LangfuseExporter: class {
                constructor() { exporterCreated = true; }
                export(_spans, done) { done({ code: 0 }); }
                async shutdown() {}
            },
        }));

        let cloneCalls = 0;
        let fetchCalls = 0;
        const nativeFetch = async () => {
            fetchCalls++;
            const response = new Response(new ReadableStream({
                start(controller) {
                    for (const part of ['{"ready":', 'true,"label":', '"frozen"}']) {
                        controller.enqueue(new TextEncoder().encode(part));
                    }
                    controller.close();
                },
            }), { headers: { 'content-type': 'application/json' } });
            const clone = response.clone.bind(response);
            response.clone = () => { cloneCalls++; return clone(); };
            return response;
        };
        globalThis.fetch = nativeFetch;
        const { register } = await import(${JSON.stringify(new URL('./instrumentation.ts', import.meta.url).href)});
        await register();
        assert.equal(globalThis.fetch, nativeFetch);
        assert.notEqual(process.env.NEXT_OTEL_FETCH_DISABLED, '1');
        assert.equal(exporterCreated, true);
        const span = trace.getTracer('startup-regression').startSpan('manual-span');
        assert.equal(span.isRecording(), true);
        const response = await fetch('https://fixture.invalid/ready');
        const reader = response.body.getReader();
        const chunks = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        await reader.cancel();
        assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString('utf8')), { ready: true, label: 'frozen' });
        assert.equal(fetchCalls, 1);
        assert.equal(cloneCalls, 0);
        span.end();
        process.exit(0);
    `;
    const child = Bun.spawn([process.execPath, '--eval', script], {
        cwd: new URL('..', import.meta.url).pathname,
        env: {
            ...Object.fromEntries(
                Object.entries(process.env).filter(
                    ([key]) =>
                        !/^(OTEL_|LANGFUSE_|VERCEL_OTEL_)/.test(key) &&
                        key !== 'NEXT_OTEL_FETCH_DISABLED',
                ),
            ),
            NODE_ENV: 'test',
            NEXT_RUNTIME: 'nodejs',
            OTEL_SDK_DISABLED: 'false',
            OTEL_TRACES_SAMPLER: 'always_on',
        },
        stdout: 'pipe',
        stderr: 'pipe',
    });
    // Startup handles SIGTERM without exiting. Recheck this owned child before escalation.
    let killTimeout: ReturnType<typeof setTimeout> | undefined;
    const stopChild = () => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill('SIGTERM');
        killTimeout ??= setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        }, 250);
    };
    const timeout = setTimeout(stopChild, 10_000);
    try {
        const [exitCode, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ]);
        expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    } finally {
        clearTimeout(timeout);
        if (child.exitCode !== null || child.signalCode !== null) clearTimeout(killTimeout);
        stopChild();
    }
}, 15_000);
