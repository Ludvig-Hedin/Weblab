'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';

import { Icons } from '@weblab/ui/icons';

import type { Id } from '@convex/_generated/dataModel';
import { toPreviewableUrl } from '../_components/canvas/frame/preview-url';
import { isLocalPreviewUrl } from '../_components/canvas/frame/use-sandbox-liveness';
import { StandalonePreview } from '../_components/standalone-preview';

/**
 * Standalone, resilient preview window for a project's running site.
 *
 * Opened in its own tab/window via `openPreviewWindow` (the editor's "Open
 * preview window" / "Pop out" controls). Inherits the Clerk auth + project
 * access gate from `project/[id]/layout.tsx`; deliberately does NOT boot the
 * editor engine, so it stays a light, fast surface.
 *
 * Hot reload is free: this tab loads the live dev-server URL, so the dev
 * server's HMR pushes updates here whenever the user edits in the editor.
 */
export default function ProjectPreviewPage() {
    const params = useParams<{ id: string }>();
    const projectId = params.id as Id<'projects'>;

    const branches = useQuery(api.branches.getByProjectId, {
        projectId,
        onlyDefault: true,
    });

    const resolved = useMemo(() => {
        if (!branches || branches.length === 0) return null;
        const defaultBranch = branches.find((b) => b.isDefault) ?? branches[0];
        const frame = defaultBranch?.frames?.[0];
        if (!frame?.url) return null;
        return { url: frame.url, branchId: frame.branchId as Id<'branches'> };
    }, [branches]);

    if (branches === undefined) {
        return <PreviewMessage icon="spinner" title="Loading preview…" />;
    }

    if (!resolved) {
        return (
            <PreviewMessage
                title="No preview available"
                body="This project doesn't have a running preview yet. Open it in the editor to start the dev server."
            />
        );
    }

    // A local (http://localhost) dev server can't be iframed from this https
    // origin (mixed content), and the cloud liveness probe rejects http URLs.
    // The editor's "Open preview window" already routes local projects to the
    // raw URL — so this page is only reached for local URLs via a direct
    // navigation. Surface the raw URL instead of a blank, blocked iframe.
    if (isLocalPreviewUrl(resolved.url)) {
        const raw = toPreviewableUrl(resolved.url);
        return (
            <PreviewMessage
                title="Local preview"
                body="This project runs on your machine. Open the raw dev-server URL directly:"
                action={{ label: raw, href: raw }}
            />
        );
    }

    return (
        <StandalonePreview projectId={projectId} branchId={resolved.branchId} url={resolved.url} />
    );
}

function PreviewMessage({
    icon,
    title,
    body,
    action,
}: {
    icon?: 'spinner';
    title: string;
    body?: string;
    action?: { label: string; href: string };
}) {
    return (
        <main className="bg-background-canvas flex h-screen w-screen flex-col items-center justify-center gap-3 p-8 text-center">
            {icon === 'spinner' && (
                <Icons.LoadingSpinner className="text-foreground-tertiary h-5 w-5 animate-spin" />
            )}
            <h1 className="text-foreground-primary text-base font-medium">{title}</h1>
            {body && <p className="text-foreground-secondary max-w-md text-sm">{body}</p>}
            {action && (
                <a
                    href={action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary max-w-md truncate text-sm underline"
                >
                    {action.label}
                </a>
            )}
        </main>
    );
}
