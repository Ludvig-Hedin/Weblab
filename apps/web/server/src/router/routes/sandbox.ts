import { z } from 'zod';

import { publicProcedure, router } from '../trpc';

// TODO(bug-hunt 2026-05-28, F-500): every procedure here returns a hello-world
// stub. Catalog says "Sandbox lifecycle from editor → Fastify server" but no
// client code calls `trpc.sandbox.*` — every editor sandbox call references
// the not-yet-ported `api.sandbox.*` Convex namespace (see TODO(sandbox-port)
// throughout apps/web/client/src/components/store/editor/sandbox/). Either
// delete this router + drop the F-500 row, or implement the real lifecycle.
export const sandboxRouter = router({
    create: publicProcedure.input(z.string()).mutation(({ input }) => {
        return `hi ${input}`;
    }),

    start: publicProcedure.input(z.string()).mutation(({ input }) => {
        return `hi ${input}`;
    }),

    stop: publicProcedure.input(z.string()).mutation(({ input }) => {
        return {
            success: true,
            message: `Sandbox ${input} stopped`,
            timestamp: new Date().toISOString(),
        };
    }),

    status: publicProcedure.input(z.string()).query(({ input }) => {
        return {
            id: input,
            status: 'running',
            details: { cpu: '5%', memory: '120MB' },
            uptime: 1200,
        };
    }),
});
