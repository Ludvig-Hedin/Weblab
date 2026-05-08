import { makeAutoObservable } from 'mobx';

import type { FrameworkId } from '@weblab/framework';
import { DEFAULT_NEW_PROJECT_TEMPLATE } from '@weblab/constants';
import { createDefaultProject } from '@weblab/db';
import { CreateRequestContextType } from '@weblab/models';
import { type ImageMessageContext } from '@weblab/models/chat';

import { api } from '@/trpc/client';
import { parseRepoUrl } from '../editor/pages/helper';

export class CreateManager {
    error: string | null = null;

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
        try {
            if (!userId) {
                console.error('No user ID found');
                return;
            }
            const config = {
                title: `Prompted project - ${userId}`,
                tags: ['prompt', userId],
            };

            const [{ sandboxId, previewUrl }, projectName] = await Promise.all([
                api.sandbox.fork.mutate({
                    sandbox: DEFAULT_NEW_PROJECT_TEMPLATE,
                    config,
                }),
                this.generateProjectName(prompt),
            ]);
            const project = createDefaultProject({
                overrides: {
                    name: projectName,
                },
            });
            const newProject = await api.project.create.mutate({
                project,
                userId,
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

            return newProject;
        } catch (error) {
            console.error(error);
            this.error = error instanceof Error ? error.message : 'An unknown error occurred';
        }
    }

    async startGitHubTemplate(userId: string, repoUrl: string) {
        this.error = null;
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
            const project = createDefaultProject({
                overrides: {
                    name: projectName,
                },
            });
            const newProject = await api.project.create.mutate({
                project,
                userId,
                sandboxId,
                sandboxUrl: previewUrl,
            });
            return newProject;
        } catch (error) {
            console.error(error);
            this.error = error instanceof Error ? error.message : 'An unknown error occurred';
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

            const project = createDefaultProject({
                overrides: {
                    name: input.name,
                    description: input.description,
                    tags: ['template-import'],
                    runtimeMetadata: input.framework ? { framework: input.framework } : undefined,
                },
            });

            return await api.project.create.mutate({
                project,
                userId: input.userId,
                sandboxId: sandboxResult.sandboxId,
                sandboxUrl: sandboxResult.previewUrl,
            });
        } catch (error) {
            console.error(error);
            this.error = error instanceof Error ? error.message : 'An unknown error occurred';
        }
    }
}
