'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api as convexApi } from '@convex/_generated/api';
import { useConvex, useQuery } from 'convex/react';

import type { GitHubRepository } from '@weblab/github';

import type { Id } from '@convex/_generated/dataModel';
import { readActiveWorkspaceId } from '@/utils/active-workspace';
import { Routes } from '@/utils/constants';

export type GitHubImportPhase =
    | 'idle'
    | 'cloning-repository'
    | 'creating-project'
    | 'opening-editor';

export const useRepositoryImport = () => {
    const router = useRouter();
    const [isImporting, setIsImporting] = useState(false);
    const [phase, setPhase] = useState<GitHubImportPhase>('idle');
    const [error, setError] = useState<string | null>(null);

    const user = useQuery(convexApi.users.me, {});
    const convex = useConvex();

    const importRepository = async (selectedRepo: GitHubRepository, signal?: AbortSignal) => {
        const checkAborted = () => {
            if (signal?.aborted) {
                throw new DOMException('Import cancelled', 'AbortError');
            }
        };

        if (!user?._id) {
            setError('No user found');
            return;
        }

        if (!selectedRepo) {
            setError('No repository selected');
            return;
        }

        setIsImporting(true);
        setPhase('cloning-repository');
        setError(null);

        let didOpenEditor = false;
        try {
            checkAborted();
            // `createFromGit` clones the repo into a fresh Vercel sandbox AND
            // persists the project graph in one action (its own sandbox cleanup
            // on failure), returning the new project id. This replaces the old
            // two-step (provision sandbox → projects.create) flow that ran
            // through the pre-Convex tRPC sandbox routers.
            const { projectId } = await convex.action(convexApi.projectActions.createFromGit, {
                repoUrl: selectedRepo.clone_url,
                branch: selectedRepo.default_branch,
                name: selectedRepo.name,
                description: selectedRepo.description ?? 'Imported from GitHub',
                workspaceId: readActiveWorkspaceId() as Id<'workspaces'> | undefined,
            });
            checkAborted();

            setPhase('opening-editor');
            didOpenEditor = true;
            router.push(`${Routes.PROJECT}/${projectId}`);
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
            // Surface the actual error message (it carries the server-side
            // reason). Fall back to a generic hint when there's no message —
            // typically a private repo or revoked access. createFromGit clones
            // over HTTPS without an auth token, so private repos fail here with
            // a clone error until token passthrough lands.
            const fallback =
                "Failed to import repository. If this keeps happening, check that the repo is public or that you've granted access to Weblab.";
            const errorMessage = error instanceof Error ? error.message : fallback;
            setError(errorMessage);
            console.error('Error importing repository:', error);
        } finally {
            if (!didOpenEditor) {
                setIsImporting(false);
                setPhase('idle');
            }
        }
    };

    const clearError = () => {
        setError(null);
    };

    return {
        isImporting,
        phase,
        error,
        importRepository,
        clearError,
    };
};
