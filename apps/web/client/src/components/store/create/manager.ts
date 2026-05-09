import { makeAutoObservable } from 'mobx';

import type { FrameworkId } from '@weblab/framework';
import { DEFAULT_NEW_PROJECT_TEMPLATE } from '@weblab/constants';
import { createDefaultProject } from '@weblab/db';
import { CreateRequestContextType } from '@weblab/models';
import { type ImageMessageContext } from '@weblab/models/chat';

import { api } from '@/trpc/client';
import { parseRepoUrl } from '../editor/pages/helper';

/**
 * Phases the create-from-prompt flow goes through. Drives the loader the
 * Create component renders right after submit so the user sees real progress
 * instead of a blank-but-spinning button while sandbox forking happens.
 */
export type CreatePhase = 'idle' | 'forking-sandbox' | 'creating-project' | 'opening-editor';

export class CreateManager {
    error: string | null = null;
    phase: CreatePhase = 'idle';

    constructor() {
        makeAutoObservable(this);
    }

    async generateProjectName(prompt: string): Promise<string> {
        try {
            const generatedName = await api.project.generateName.mutate({
                prompt: prompt,
            });
            return generatedName;
        } catch (error) {
            console.error('Error generating project name:', error);
            return 'New Project';
        }
    }

    async startCreate(userId: string, prompt: string, images: ImageMessageContext[]) {
        this.error = null;
        // Track the forked sandbox so we can release it (best-effort) if any
        // step after `sandbox.fork` throws. Without this, the user pays for a
        // CodeSandbox sandbox that has no project row, no `/projects` entry,
        // and cannot be reached via `sandbox.delete` (which requires a branch).
        let forkedSandboxId: string | null = null;
        try {
            if (!userId) {
                console.error('No user ID found');
                return;
            }
            const config = {
                title: `Prompted project - ${userId}`,
                tags: ['prompt', userId],
            };

            this.phase = 'forking-sandbox';
            const [{ sandboxId, previewUrl }, projectName] = await Promise.all([
                api.sandbox.fork.mutate({
                    sandbox: DEFAULT_NEW_PROJECT_TEMPLATE,
                    config,
                }),
                this.generateProjectName(prompt),
            ]);
            forkedSandboxId = sandboxId;

            this.phase = 'creating-project';
            const project = createDefaultProject({
                overrides: {
                    name: projectName,
                    // DEFAULT_NEW_PROJECT_TEMPLATE is a Next.js sandbox. Persisting
                    // this lets the editor's preload-script injector pick the
                    // Next.js path immediately on first load instead of falling
                    // through to the framework-detection race that surfaced as
                    // "No router config found for preload script injection".
                    runtimeMetadata: { framework: 'nextjs' },
                },
            });
            const newProject = await api.project.create.mutate({
                project,
                sandboxId,
                sandboxUrl: previewUrl,
                creationData: {
                    context: [
                        {
                            type: CreateRequestContextType.PROMPT,
                            content: prompt,
                        },
                        ...images.map((image) => ({
                            type: CreateRequestContextType.IMAGE,
                            content: image.content,
                            mimeType: image.mimeType,
                        })),
                    ],
                },
            });

            // Sandbox is now attached to a project — clear so the catch path
            // does not try to delete it as an orphan.
            forkedSandboxId = null;
            this.phase = 'opening-editor';
            return newProject;
        } catch (error) {
            console.error(error);
            this.error = error instanceof Error ? error.message : 'An unknown error occurred';
            this.phase = 'idle';
            if (forkedSandboxId) {
                await api.sandbox.deleteOrphan
                    .mutate({ sandboxId: forkedSandboxId })
                    .catch((cleanupErr) => {
                        console.warn('[createManager] failed to clean up orphan sandbox', {
                            sandboxId: forkedSandboxId,
                            error:
                                cleanupErr instanceof Error
                                    ? cleanupErr.message
                                    : String(cleanupErr),
                        });
                    });
            }
            // Re-throw so the caller can distinguish thrown errors from a
            // legitimate `undefined` return (e.g. missing userId guard above).
            throw error;
        }
    }

    resetPhase() {
        this.phase = 'idle';
    }

    async startGitHubTemplate(userId: string, repoUrl: string) {
        this.error = null;
        let forkedSandboxId: string | null = null;
        try {
            if (!userId) {
                console.error('No user ID found');
                return;
            }
            const { owner, repo } = parseRepoUrl(repoUrl);
            const { branch, isPrivateRepo } = await api.github.validate.mutate({
                owner: owner,
                repo: repo,
            });

            if (isPrivateRepo) {
                this.error =
                    "The repository you've provided is private. Only public repositories are supported";
                return;
            }

            const [{ sandboxId, previewUrl }, projectName] = await Promise.all([
                this.createSandboxFromGithub(repoUrl, branch),
                this.generateProjectName(`Import from GitHub repository: ${repo}`),
            ]);
            forkedSandboxId = sandboxId;
            const project = createDefaultProject({
                overrides: {
                    name: projectName,
                },
            });
            const newProject = await api.project.create.mutate({
                project,
                sandboxId,
                sandboxUrl: previewUrl,
            });
            forkedSandboxId = null;
            return newProject;
        } catch (error) {
            console.error(error);
            this.error = error instanceof Error ? error.message : 'An unknown error occurred';
            if (forkedSandboxId) {
                await api.sandbox.deleteOrphan
                    .mutate({ sandboxId: forkedSandboxId })
                    .catch((cleanupErr) => {
                        console.warn('[createManager] failed to clean up orphan sandbox', {
                            sandboxId: forkedSandboxId,
                            error:
                                cleanupErr instanceof Error
                                    ? cleanupErr.message
                                    : String(cleanupErr),
                        });
                    });
            }
        }
    }

    async createSandboxFromGithub(repoUrl: string, branch: string, subpath?: string) {
        return await api.sandbox.createFromGitHub.mutate({
            repoUrl,
            branch,
            subpath,
        });
    }

    async startPublicGitHubTemplate(input: {
        userId: string;
        name: string;
        description: string;
        repoUrl: string;
        branch: string;
        subpath?: string;
        /**
         * Pre-seeded CodeSandbox sandbox ID. When provided, the fast `fork`
         * endpoint (~2 s) is used instead of `createFromGitHub` (~90 s).
         */
        sandboxId?: string;
        /**
         * Framework id from the template's metadata. Persisted in the new
         * project's runtime metadata so the chat AI and editor pipelines pick
         * up the right behavior. Defaults to 'nextjs' when omitted (matches
         * pre-multi-framework template authoring).
         */
        framework?: FrameworkId;
    }) {
        this.error = null;
        let forkedSandboxId: string | null = null;
        try {
            if (!input.userId) {
                console.error('No user ID found');
                return;
            }

            if (input.sandboxId && input.subpath) {
                this.error = 'Cannot use subpath with pre-seeded sandbox templates';
                return;
            }

            let sandboxResult: { sandboxId: string; previewUrl: string };

            if (input.sandboxId) {
                // Fast path: fork a pre-seeded sandbox template (~2 s).
                sandboxResult = await api.sandbox.fork.mutate({
                    sandbox: { id: input.sandboxId, port: 3000 },
                    config: {
                        title: input.name,
                        tags: ['template-import'],
                    },
                });
            } else {
                // Slow path: import directly from GitHub (~90 s).
                sandboxResult = await this.createSandboxFromGithub(
                    input.repoUrl,
                    input.branch,
                    input.subpath,
                );
            }
            forkedSandboxId = sandboxResult.sandboxId;

            const project = createDefaultProject({
                overrides: {
                    name: input.name,
                    description: input.description,
                    tags: ['template-import'],
                    runtimeMetadata: input.framework ? { framework: input.framework } : undefined,
                },
            });

            const newProject = await api.project.create.mutate({
                project,
                sandboxId: sandboxResult.sandboxId,
                sandboxUrl: sandboxResult.previewUrl,
            });
            forkedSandboxId = null;
            return newProject;
        } catch (error) {
            console.error(error);
            this.error = error instanceof Error ? error.message : 'An unknown error occurred';
            if (forkedSandboxId) {
                await api.sandbox.deleteOrphan
                    .mutate({ sandboxId: forkedSandboxId })
                    .catch((cleanupErr) => {
                        console.warn('[createManager] failed to clean up orphan sandbox', {
                            sandboxId: forkedSandboxId,
                            error:
                                cleanupErr instanceof Error
                                    ? cleanupErr.message
                                    : String(cleanupErr),
                        });
                    });
            }
        }
    }
}
