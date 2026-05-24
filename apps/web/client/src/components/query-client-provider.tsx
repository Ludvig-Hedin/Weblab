'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// React Query provider. Post-migration: most network requests go through
// Convex, but a few legacy components (project capabilities, hooks that ship
// with @tanstack/react-query) still call `useQueryClient()` directly.
// Mounting a private client here keeps them happy without resurrecting the
// tRPC + React Query plumbing.
export function AppQueryClientProvider({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        retry: false,
                        refetchOnWindowFocus: false,
                    },
                },
            }),
    );
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
