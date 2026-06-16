import ws from '@fastify/websocket';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import fastify from 'fastify';

import type { EditorServerOptions } from '@weblab/rpc';

import { appRouter } from './router';
import { createContext } from './router/context';

export function createServer(opts: EditorServerOptions) {
    const dev = opts.dev ?? true;
    // Honor the platform-injected PORT (Railway/Fly/etc.) ahead of the static
    // default so the deployed sandbox server listens where the platform routes.
    const port = process.env.PORT ? Number(process.env.PORT) : (opts.port ?? 8080);
    const trpcPrefix = opts.prefix ?? '/api/trpc';
    const server = fastify({ logger: dev });

    server.register(ws);
    server.register(fastifyTRPCPlugin, {
        prefix: trpcPrefix,
        useWSS: true,
        trpcOptions: { router: appRouter, createContext },
    });

    server.get('/', async () => {
        return { hello: 'weblab' };
    });

    // Explicit liveness endpoints for platform health checks. Both paths are
    // served because a service created in the same Railway project inherits the
    // repo-root railway.toml `healthcheckPath = "/api/health"`, while a
    // standalone deploy may probe `/health`. Answer 200 on either.
    server.get('/health', async () => {
        return { ok: true };
    });
    server.get('/api/health', async () => {
        return { ok: true };
    });

    const stop = async () => {
        await server.close();
    };
    const start = async () => {
        try {
            // Bind 0.0.0.0, not the fastify default 127.0.0.1 — a loopback bind
            // is unroutable inside a container, so the platform's proxy can
            // never reach it and the WS upgrade never completes.
            await server.listen({ port, host: '0.0.0.0' });
            console.log('listening on port', port);
        } catch (err) {
            server.log.error(err);
            process.exit(1);
        }
    };

    return { server, start, stop };
}
