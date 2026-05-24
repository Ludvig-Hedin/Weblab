'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api as convexApi } from '@convex/_generated/api';
import { useConvex, useQuery } from 'convex/react';

import type { GitHubRepository } from '@weblab/github';

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

        // Track the forked sandbox so we can release it if project.create fails
        // mid-flight — otherwise the orphan keeps consuming sandbox quota
        // (matches the blank-create flow in components/store/create/manager.ts).
        let forkedSandboxId: string | null = null;
        let didOpenEditor = false;
        try {
            checkAborted();
            // TODO(sandbox-port): api.sandbox.createFromGitHub has no Convex
            // equivalent yet — surface a clear error until the route lands.
            const createFromGitHub = async (
                _args: { repoUrl: string; branch: string },
                _opts: { signal?: AbortSignal },
            ): Promise<{
                sandboxId: string;
                previewUrl: string;
                sandboxRuntime: unknown;
            }> => {
                throw new Error('GitHub import is temporarily unavailable.');
            };
            const { sandboxId, previewUrl, sandboxRuntime } = await createFromGitHub(
                {
                    repoUrl: selectedRepo.clone_url,
                    branch: selectedRepo.default_branch,
                },
                {
                    signal,
                },
            );
            forkedSandboxId = sandboxId;
            checkAborted();

            setPhase('creating-project');
            const project = await convex.mutation(convexApi.projects.create, {
                name: selectedRepo.name ?? 'New project',
                description: selectedRepo.description ?? 'Imported from GitHub',
                sandboxId,
                sandboxUrl: previewUrl,
                sandboxRuntime: sandboxRuntime as never,
                framework: 'nextjs',
            });

            if (!project) {
                throw new Error('Failed to create project');
            }

            // Project owns the sandbox now — clear the cleanup token.
            forkedSandboxId = null;
            checkAborted();
            setPhase('opening-editor');
            didOpenEditor = true;
            router.push(`${Routes.PROJECT}/${project._id}`);
        } catch (error: unknown) {
            if (forkedSandboxId) {
                // TODO(sandbox-port): api.sandbox.deleteOrphan has no Convex
                // equivalent yet — orphan cleanup is a no-op until the route lands.
                console.warn('[useRepositoryImport] orphan sandbox cleanup unavailable', {
                    sandboxId: forkedSandboxId,
                });
            }
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
            // Surface the actual error message (it carries the server-side
            // reason). Fall back to a generic hint when there's no message —
            // typically auth/permission failures benefit from a nudge to check
            // repo visibility and Weblab GitHub access (issue #40).
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
