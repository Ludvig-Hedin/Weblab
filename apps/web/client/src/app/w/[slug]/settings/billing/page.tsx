import { redirect } from 'next/navigation';

/**
 * Workspace-scoped billing shim.
 *
 * The sidebar (`/w/[slug]/settings/_components/settings-nav.tsx`) links the
 * "Billing" entry to the global `/pricing` page until workspace-level
 * subscriptions land. Until then, this route exists so that:
 *
 *   - Direct URLs like `/w/<slug>/settings/billing` (bookmarks, shared
 *     links, deep-link nav) don't 404 into the marketing not-found page.
 *   - Future work can render workspace-scoped subscription state here
 *     without changing any inbound links.
 *
 * Mirrors the redirect-only pattern used by `apps/web/client/src/app/settings/page.tsx`.
 *
 * TODO: replace with a workspace-scoped subscription/billing UI (plan,
 * seats, invoices) once `workspace.subscription.*` lands. The
 * `fromWorkspace` query string already carries the originating slug so
 * the destination can surface workspace context.
 */
interface BillingPageProps {
    params: Promise<{ slug: string }>;
}

export default async function WorkspaceBillingPage({ params }: BillingPageProps) {
    const { slug } = await params;
    redirect(`/pricing?fromWorkspace=${encodeURIComponent(slug)}`);
}
