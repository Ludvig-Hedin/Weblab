import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { LAST_WORKSPACE_SLUG_COOKIE } from '@/app/w/[slug]/_components/workspace-context';
import { api } from '@/trpc/server';

/**
 * Legacy `/projects` route. Workspaces own the canonical project list at
 * `/w/[slug]/projects`. Resolution order:
 *   1. `weblab.lastWorkspaceSlug` cookie — if it points at a workspace
 *      the caller is still a member of, land there.
 *   2. The first workspace from `workspace.list` (personal first, then
 *      alphabetical).
 *   3. Self-heal: create a personal workspace if the user has none and
 *      land there.
 *
 * Cookie wins because a returning user is likely working in the same
 * workspace they were last in — multi-workspace teams hated the
 * always-personal bounce.
 */
export default async function LegacyProjectsPage() {
    const workspaces = await api.workspace.list();
    if (workspaces.length > 0) {
        const cookieStore = await cookies();
        const lastSlug = cookieStore.get(LAST_WORKSPACE_SLUG_COOKIE)?.value;
        if (lastSlug) {
            const decoded = decodeURIComponent(lastSlug);
            const match = workspaces.find((w) => w.slug === decoded);
            if (match) {
                redirect(`/w/${match.slug}/projects`);
            }
        }
        redirect(`/w/${workspaces[0]!.slug}/projects`);
    }
    // Self-heal: create the missing personal workspace, then forward.
    const personal = await api.workspace.ensurePersonal();
    redirect(`/w/${personal.slug}/projects`);
}
