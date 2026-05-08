import { type NextRequest } from 'next/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { env } from '~/env';
import { appRouter } from '~/server/api/root';
import { createTRPCContext } from '~/server/api/trpc';

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
    return createTRPCContext({
        headers: req.headers,
    });
};

const loggedErrors = new Map<string, number>();
const ERROR_DEDUPE_MS = 30_000;

function getCauseSummary(cause: unknown): string | null {
    if (!cause || typeof cause !== 'object') {
        return null;
    }

    const message = 'message' in cause && typeof cause.message === 'string' ? cause.message : null;
    const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : null;
    const nestedCause = 'cause' in cause ? getCauseSummary(cause.cause) : null;

    const summary = [code, message].filter(Boolean).join(': ');
    if (summary && nestedCause) {
        return `${summary}; cause: ${nestedCause}`;
    }
    return summary || nestedCause;
}

function shouldLogError(key: string): boolean {
    const now = Date.now();
    const lastLoggedAt = loggedErrors.get(key);
    if (lastLoggedAt && now - lastLoggedAt < ERROR_DEDUPE_MS) {
        return false;
    }
    loggedErrors.set(key, now);
    return true;
}

const handler = (req: NextRequest) =>
    fetchRequestHandler({
        endpoint: '/api/trpc',
        req,
        router: appRouter,
        createContext: () => createContext(req),
        onError:
            env.NODE_ENV === 'development'
                ? ({ path, error }) => {
                      const isExpectedLoggedOutUserQuery =
                          path === 'user.get' &&
                          (error.message === 'UNAUTHORIZED' ||
                              error.message === 'Auth session missing!');

                      if (isExpectedLoggedOutUserQuery) {
                          return;
                      }

                      const cause = getCauseSummary(error.cause);
                      const summary = cause ? `${error.message} (${cause})` : error.message;
                      const key = `${path ?? '<no-path>'}:${summary}`;

                      if (shouldLogError(key)) {
                          console.error(`❌ tRPC failed on ${path ?? '<no-path>'}: ${summary}`);
                      }
                  }
                : undefined,
    });

export { handler as GET, handler as POST };
