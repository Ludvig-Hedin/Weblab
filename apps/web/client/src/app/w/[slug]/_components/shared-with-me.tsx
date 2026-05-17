'use client';

import Link from 'next/link';

import { Icons } from '@weblab/ui/icons';

import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';

/**
 * Surfaces projects the user is an explicit project-member of in workspaces
 * they don't belong to. Project-only invitees would otherwise have no
 * dashboard surface to find their shared projects. Rendered only on the
 * Personal workspace dashboard. Hides when there are no shared projects.
 */
export function SharedWithMe() {
    const { data, isLoading } = api.project.sharedWithMe.useQuery();

    if (isLoading || !data || data.length === 0) {
        return null;
    }

    return (
        <section className="mx-auto w-full max-w-6xl px-4">
            <header className="mb-3 flex items-center gap-2">
                <h2 className="text-foreground text-sm font-medium">Shared with me</h2>
                <span className="text-foreground-tertiary text-xs">
                    Projects in other workspaces
                </span>
            </header>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {data.map((project) => (
                    <li key={project.id}>
                        <Link
                            href={`${Routes.PROJECT}/${project.id}`}
                            className="border-border hover:bg-background-secondary/60 flex items-center gap-3 rounded-md border p-3 transition-colors"
                        >
                            <Icons.File className="text-foreground-tertiary h-4 w-4 shrink-0" />
                            <div className="flex min-w-0 flex-1 flex-col">
                                <span className="text-foreground truncate text-sm font-medium">
                                    {project.name}
                                </span>
                                <span className="text-foreground-tertiary truncate text-xs">
                                    Updated{' '}
                                    {new Date(project.metadata.updatedAt).toLocaleDateString()}
                                </span>
                            </div>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
