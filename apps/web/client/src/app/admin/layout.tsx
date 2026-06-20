import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchQuery } from 'convex/nextjs';

/**
 * Server-side gate for /admin/*. The actual data queries
 * (`aiUsageEvents.aggregateAdmin`, `aiUsageEvents.listAdmin`) already verify
 * the caller's email against `WEBLAB_ADMIN_EMAILS` on the Convex deployment,
 * but without this layout an unauthenticated visitor can still load the
 * route shell and learn the existence + structure of the admin surface
 * (column names, model identifiers, telemetry layout). Returning 404 here
 * makes the route invisible to anyone who isn't an admin AND adds a
 * defense-in-depth layer in case the Convex env var is ever misconfigured.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const { userId, getToken } = await auth();
    if (!userId) {
        notFound();
    }
    const token = await getToken({ template: 'convex' });
    if (!token) {
        notFound();
    }
    let isAdmin = false;
    try {
        isAdmin = await fetchQuery(api.aiUsageEvents.amIAdmin, {}, { token });
    } catch {
        // Convex unreachable / JWT misconfigured → treat as not-admin so the
        // surface stays hidden even when the backend can't answer.
        isAdmin = false;
    }
    if (!isAdmin) {
        notFound();
    }
    return <>{children}</>;
}
