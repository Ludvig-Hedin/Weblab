import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchMutation, fetchQuery } from 'convex/nextjs';

import { LAST_WORKSPACE_SLUG_COOKIE } from '@/app/w/[slug]/_components/workspace-context';
import { getCurrentUser, getSignInUrl } from '@/utils/auth/current-user';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Top-level `/settings` shim. Workspaces own the canonical settings UI at
 * `/w/[slug]/settings/general`, but old links and habit bring users to
 * `/settings`. Resolve the active workspace using the same precedence as
 * `/projects`:
 *   1. `weblab.lastWorkspaceSlug` cookie when it still maps to a workspace
 *      the caller is a member of.
 *   2. The first workspace from `workspace.list` (personal first, then
 *      alphabetical).
 *   3. Self-heal: create a personal workspace if the user has none.
 */
export default async function LegacySettingsPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect(getSignInUrl('/settings'));
    }

    const { getToken } = await auth();
    const token = await getToken({ template: 'convex' });

    // Wrap so a backend failure on this redirect-only shim doesn't dump the
    // user into Next's generic error boundary. Fall back to /projects with a
    // query flag the client can surface as a toast.
    let workspaces: Awaited<ReturnType<typeof fetchQuery<typeof api.workspaces.list>>>;
    try {
        workspaces = await fetchQuery(api.workspaces.list, {}, { token: token ?? undefined });
    } catch {
        redirect('/projects?settingsFailed=1');
    }

    if (workspaces.length > 0) {
        const cookieStore = await cookies();
        const lastSlug = cookieStore.get(LAST_WORKSPACE_SLUG_COOKIE)?.value;
        if (lastSlug) {
            const decoded = decodeURIComponent(lastSlug);
            const match = workspaces.find((w) => w.slug === decoded);
            if (match) {
                redirect(`/w/${match.slug}/settings/general`);
            }
        }
        redirect(`/w/${workspaces[0]!.slug}/settings/general`);
    }
    // Self-heal: create the missing personal workspace, then forward.
    // Keep `redirect()` outside the try/catch — it throws NEXT_REDIRECT for
    // control flow and must not be swallowed by the failure branch.
    let personal: Awaited<ReturnType<typeof fetchMutation<typeof api.workspaces.ensurePersonal>>>;
    try {
        personal = await fetchMutation(
            api.workspaces.ensurePersonal,
            {},
            { token: token ?? undefined },
        );
    } catch {
        redirect('/projects?settingsFailed=1');
    }
    redirect(`/w/${personal.slug}/settings/general`);
}
