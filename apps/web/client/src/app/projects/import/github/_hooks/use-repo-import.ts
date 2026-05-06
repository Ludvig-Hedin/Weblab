'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TRPCClientError } from '@trpc/client';

import type { GitHubRepository } from '@weblab/github';

import { api as clientApi } from '@/trpc/client';
import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';

export const useRepositoryImport = () => {
    const router = useRouter();
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { data: user } = api.user.get.useQuery();

    const importRepository = async (selectedRepo: GitHubRepository, signal?: AbortSignal) => {
        const checkAborted = () => {
            if (signal?.aborted) {
                throw new DOMException('Import cancelled', 'AbortError');
            }
        };

        if (!user?.id) {
            setError('No user found');
            return;
        }

        if (!selectedRepo) {
            setError('No repository selected');
            return;
        }

        setIsImporting(true);
        setError(null);

        try {
            checkAborted();
            const { sandboxId, previewUrl } = await clientApi.sandbox.createFromGitHub.mutate(
                {
                    repoUrl: selectedRepo.clone_url,
                    branch: selectedRepo.default_branch,
                },
                {
                    signal,
                },
            );
            checkAborted();

            const project = await clientApi.project.create.mutate(
                {
                    project: {
                        name: selectedRepo.name ?? 'New project',
                        description: selectedRepo.description || 'Imported from GitHub',
                    },
                    userId: user.id,
                    sandboxId,
                    sandboxUrl: previewUrl,
                },
                {
                    signal,
                },
            );

            if (!project) {
                throw new Error('Failed to create project');
            }

            checkAborted();
            router.push(`${Routes.PROJECT}/${project.id}`);
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
            // Surface the actual tRPC error (it carries the server-side reason).
            // Fall back to a generic hint when there's no message — typically
            // auth/permission failures benefit from a nudge to check repo
            // visibility and Weblab GitHub access (issue #40).
            const fallback =
                "Failed to import repository. If this keeps happening, check that the repo is public or that you've granted access to Weblab.";
            const errorMessage =
                error instanceof TRPCClientError
                    ? error.message
                    : error instanceof Error
                      ? error.message
                      : fallback;
            setError(errorMessage);
            console.error('Error importing repository:', error);
        } finally {
            setIsImporting(false);
        }
    };

    const clearError = () => {
        setError(null);
    };

    return {
        isImporting,
        error,
        importRepository,
        clearError,
    };
};
