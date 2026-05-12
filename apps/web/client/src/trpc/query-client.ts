import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import SuperJSON from 'superjson';

function getTRPCErrorCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null) {
        return undefined;
    }

    const data = 'data' in error ? error.data : undefined;
    if (typeof data !== 'object' || data === null || !('code' in data)) {
        return undefined;
    }

    return typeof data.code === 'string' ? data.code : undefined;
}

export const createQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: {
                // With SSR, we usually want to set some default staleTime
                // above 0 to avoid refetching immediately on the client
                staleTime: 30 * 1000,
                // Editor work is long-running. A user tab-switching to copy
                // a Figma frame should not trigger a full refetch storm.
                // Opt-in per-query if a surface really needs freshness on focus.
                refetchOnWindowFocus: false,
                retry: (failureCount, error) => {
                    const code = getTRPCErrorCode(error);
                    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
                        return false;
                    }
                    if (code === 'NOT_FOUND' || code === 'BAD_REQUEST') {
                        return false;
                    }
                    return failureCount < 2;
                },
            },
            dehydrate: {
                serializeData: SuperJSON.serialize,
                shouldDehydrateQuery: (query) =>
                    defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
            },
            hydrate: {
                deserializeData: SuperJSON.deserialize,
            },
        },
    });
