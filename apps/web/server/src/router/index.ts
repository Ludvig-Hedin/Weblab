import { componentsRouter } from './routes/components';
import { sandboxRouter } from './routes/sandbox';
import { router } from './trpc';

export const appRouter = router({
    sandbox: sandboxRouter,
    components: componentsRouter,
});

export type AppRouter = typeof appRouter;
