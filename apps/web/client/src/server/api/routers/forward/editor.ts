import { editorServerConfig, type EditorRouter } from '@weblab/rpc';
import { createTRPCClient, createWSClient, httpBatchLink, splitLink, wsLink } from '@trpc/client';
import superJSON from 'superjson';
import { z } from 'zod';
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

// Export the router with all the forwarded procedures
export const editorForwardRouter = createTRPCRouter({
    sandbox: createTRPCRouter({
        create: protectedProcedure.input(z.string()).mutation(({ input }) => {
            return editorClient.sandbox.create.mutate(input);
        }),
        start: protectedProcedure.input(z.string()).mutation(({ input }) => {
            return editorClient.sandbox.start.mutate(input);
        }),

        stop: protectedProcedure.input(z.string()).mutation(({ input }) => {
            return editorClient.sandbox.stop.mutate(input);
        }),
        status: protectedProcedure.input(z.string()).query(({ input }) => {
            return editorClient.sandbox.status.query(input);
        }),
    }),
    components: createTRPCRouter({
        listProjectComponents: protectedProcedure
            .input(z.object({ projectRoot: z.string().min(1).optional() }).optional())
            .query(async ({ input }) => {
                return editorClient.components.listProjectComponents.query({
                    projectRoot: input?.projectRoot ?? '.',
                });
            }),
    }),
});
