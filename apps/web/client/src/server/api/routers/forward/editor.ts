import { createTRPCClient, createWSClient, httpBatchLink, splitLink, wsLink } from '@trpc/client';
import { TRPCError } from '@trpc/server';
import superJSON from 'superjson';
import { z } from 'zod';

import type { EditorRouter } from '@weblab/rpc';
import { editorServerConfig } from '@weblab/rpc';

import { createTRPCRouter, protectedProcedure } from '../../trpc';

const { port, prefix } = editorServerConfig;
const urlEnd = `localhost:${port}${prefix}`;
const wsClient = createWSClient({ url: `ws://${urlEnd}` });

const editorClient = createTRPCClient<EditorRouter>({
    links: [
        splitLink({
            condition(op) {
                return op.type === 'subscription';
            },
            true: wsLink({ client: wsClient, transformer: superJSON }),
            false: httpBatchLink({
                url: `http://${urlEnd}`,
                transformer: superJSON,
            }),
        }),
    ],
});

// Wrap forwarded calls so non-JSON responses from the editor server (e.g.
// the dev-time editor server is down → Next.js returns an HTML 502 page)
// surface as proper tRPC errors instead of a client-side `Unexpected token
// '<', "<!doctype "...` JSON parse crash that breaks the consuming UI.
async function forwardCall<T>(label: string, op: () => Promise<T>): Promise<T> {
    try {
        return await op();
    } catch (err) {
        const message =
            err instanceof Error ? err.message : typeof err === 'string' ? err : String(err);
        if (/Unexpected token|JSON|fetch failed|ECONNREFUSED/i.test(message)) {
            throw new TRPCError({
                code: 'SERVICE_UNAVAILABLE',
                message: `Editor server unavailable (${label}). Start it with \`bun dev\` or wait for the sandbox to come back online.`,
                cause: err,
            });
        }
        throw err;
    }
}

// Export the router with all the forwarded procedures
export const editorForwardRouter = createTRPCRouter({
    sandbox: createTRPCRouter({
        create: protectedProcedure.input(z.string()).mutation(({ input }) => {
            return forwardCall('sandbox.create', () => editorClient.sandbox.create.mutate(input));
        }),
        start: protectedProcedure.input(z.string()).mutation(({ input }) => {
            return forwardCall('sandbox.start', () => editorClient.sandbox.start.mutate(input));
        }),

        stop: protectedProcedure.input(z.string()).mutation(({ input }) => {
            return forwardCall('sandbox.stop', () => editorClient.sandbox.stop.mutate(input));
        }),
        status: protectedProcedure.input(z.string()).query(({ input }) => {
            return forwardCall('sandbox.status', () => editorClient.sandbox.status.query(input));
        }),
    }),
    components: createTRPCRouter({
        listProjectComponents: protectedProcedure
            .input(z.object({ projectRoot: z.string().min(1).optional() }).optional())
            .query(async ({ input }) => {
                return forwardCall('components.listProjectComponents', () =>
                    editorClient.components.listProjectComponents.query({
                        projectRoot: input?.projectRoot ?? '.',
                    }),
                );
            }),
    }),
});
