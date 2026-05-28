import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

import type { Context } from './context';

const t = initTRPC.context<Context>().create({
    transformer: superjson,
    errorFormatter({ shape }) {
        return shape;
    },
    // Required for `bun test` to import any route module without triggering
    // `@trpc/server` v11's runtime guard: "You're trying to use @trpc/server
    // in a non-server environment." The guard exists to catch accidental
    // browser bundling, but bun's test runner reports `typeof window`
    // identically to a browser, so the heuristic flags valid server-side
    // unit tests for our route helpers (e.g. `extractReactComponents`).
    // Production code still runs through Fastify which is always
    // server-side; this flag widens module load, not runtime semantics.
    allowOutsideOfServer: true,
});

export const router = t.router;
export const publicProcedure = t.procedure;
