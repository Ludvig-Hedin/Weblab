import { makeAutoObservable } from 'mobx';

import type { FrameworkId } from '@weblab/framework';
import { DEFAULT_NEW_PROJECT_TEMPLATE } from '@weblab/constants';
import { createDefaultProject } from '@weblab/db';
import { getFrameworkAdapter } from '@weblab/framework';
import { CreateRequestContextType } from '@weblab/models';
import { type ImageMessageContext } from '@weblab/models/chat';

import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@/app/w/[slug]/_components/workspace-context';
import { api } from '@/trpc/client';
import { parseRepoUrl } from './parse-repo-url';

/**
 * Returns the workspace id the new project should land in. The dashboard
 * writes this to localStorage when the user opens a workspace; the create
 * flow reads it here so new projects respect the active workspace context
 * even though /projects/new lives outside /w/[slug]. When undefined, the
 * server falls back to the caller's personal workspace.
 */
function readActiveWorkspaceId(): string | undefined {
    if (typeof window === 'undefined') return undefined;
    try {
        const id = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
        return id && id.length > 0 ? id : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Phases the create-from-prompt flow goes through. Drives the loader the
 * Create component renders right after submit so the user sees real progress
 * instead of a blank-but-spinning button while sandbox forking happens.
 */
export type CreatePhase = 'idle' | 'forking-sandbox' | 'creating-project' | 'opening-editor';

/**
 * Thrown by every create-flow entry point when the caller did not supply a
 * userId. Callers should detect this with `isNotAuthenticatedError` and
 * re-open the auth modal instead of surfacing a misleading "Failed to create
 * project" toast. Using a named subclass (instead of a string sentinel)
 * prevents collisions with unrelated errors that happen to share the same
 * message — `instanceof` matches identity, not text.
 */
export class CreateFlowNotAuthenticatedError extends Error {
    constructor() {
        super('NOT_AUTHENTICATED');
        this.name = 'CreateFlowNotAuthenticatedError';
    }
}

export function isNotAuthenticatedError(error: unknown): boolean {
    return error instanceof CreateFlowNotAuthenticatedError;
}

/**
 * Thrown when a GitHub-template create flow is rejected for a user-correctable
 * reason (private repo, conflicting input). Distinct from network/sandbox
 * failures so callers can show a precise message instead of a generic
 * "Failed to create project" toast.
 */
export class CreateFlowInvalidInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CreateFlowInvalidInputError';
    }
}

export function isInvalidInputError(error: unknown): boolean {
    return error instanceof CreateFlowInvalidInputError;
}

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
                // Throw a typed sentinel so callers can distinguish "user is
                // signed out" from a real failure and re-open the auth modal
                // instead of surfacing a misleading toast. The previous silent
                // return produced a dead-end (button reset, no feedback) when
                // a session expired between the auth gate and the click.
                throw new CreateFlowNotAuthenticatedError();
            }
            const config = {
                title: `Prompted project - ${userId}`,
                tags: ['prompt', userId],
            };

            this.phase = 'forking-sandbox';
            const [{ sandboxId, previewUrl, sandboxRuntime }, projectName] = await Promise.all([
                api.sandbox.fork.mutate({
                    sandbox: DEFAULT_NEW_PROJECT_TEMPLATE,
                    config,
                }),
                this.generateProjectName(prompt),
            ]);
            forkedSandboxId = sandboxId;
            // Defense-in-depth: a degenerate fork response (empty id/url)
            // would persist `frames.url = ''`, and the editor's
            // <iframe src=""> then resolves to the parent document URL —
            // the user sees Weblab rendered inside itself with no recovery
            // path. Reject here so the catch block deletes the orphan and
            // the toast surfaces the cause.
            if (!sandboxId || !previewUrl) {
                throw new Error(
                    'Sandbox fork returned an incomplete response (missing sandbox id or preview URL). Please try again.',
                );
            }

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
                sandboxRuntime,
                workspaceId: readActiveWorkspaceId(),
                creationData: {
                    context: [
                        {
                            type: CreateRequestContextType.PROMPT,
                            content: prompt,
                        },
                        ...images.map((image) => ({
                            // `as const` keeps `type` narrowed to the
                            // literal `IMAGE` member rather than widening to
                            // the full `CreateRequestContextType` enum, which
                            // is required by `ImageCreateRequestContext`.
                            type: CreateRequestContextType.IMAGE as const,
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
                throw new CreateFlowNotAuthenticatedError();
            }
            const { owner, repo } = parseRepoUrl(repoUrl);
            const { branch, isPrivateRepo } = await api.github.validate.mutate({
                owner: owner,
                repo: repo,
            });

            if (isPrivateRepo) {
                throw new CreateFlowInvalidInputError(
                    "The repository you've provided is private. Only public repositories are supported.",
                );
            }

            const [{ sandboxId, previewUrl, sandboxRuntime }, projectName] = await Promise.all([
                this.createSandboxFromGithub(repoUrl, branch),
                this.generateProjectName(`Import from GitHub repository: ${repo}`),
            ]);
            forkedSandboxId = sandboxId;
            // See `startCreate` — reject incomplete responses before
            // persisting so the orphan-cleanup path can fire.
            if (!sandboxId || !previewUrl) {
                throw new Error(
                    'Sandbox import returned an incomplete response (missing sandbox id or preview URL). Please try again.',
                );
            }
            const project = createDefaultProject({
                overrides: {
                    name: projectName,
                    // Hint Next.js to avoid the preload-injector framework
                    // detection race; adapter still re-validates from sandbox.
                    runtimeMetadata: { framework: 'nextjs' },
                },
            });
            const newProject = await api.project.create.mutate({
                project,
                sandboxId,
                sandboxUrl: previewUrl,
                sandboxRuntime,
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
            // Re-throw so the caller can surface a toast / re-open the
            // auth modal. Without this, callers see `!project`, no toast
            // fires, and the UX dies silently. Mirrors `startCreate`.
            throw error;
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
                throw new CreateFlowNotAuthenticatedError();
            }

            if (input.sandboxId && input.subpath) {
                throw new CreateFlowInvalidInputError(
                    'Cannot use subpath with pre-seeded sandbox templates.',
                );
            }

            let sandboxResult: {
                sandboxId: string;
                previewUrl: string;
                sandboxRuntime?: {
                    provider: 'code_sandbox' | 'vercel_sandbox';
                    snapshotId?: string;
                    port?: number;
                    devCommand?: string;
                    runtime?: string;
                };
            };

            if (input.sandboxId) {
                // Fast path: fork a pre-seeded sandbox template (~2 s).
                // Resolve the dev-server port from the template's framework
                // adapter (Next=3000, Vite=5173, Astro=4321, ...) so a non-Next
                // template added to EXTERNAL_TEMPLATES does not persist
                // `frames.url` pointing at port 3000 and 404 on first preview.
                // Same fix pattern as fork.ts L213-214. The slow path below
                // still goes through `sandbox.createFromGitHub`, which has its
                // own DEFAULT_PORT=3000 default — that call site is owned by
                // the sandbox router and must be fixed there.
                const templatePort = getFrameworkAdapter(input.framework ?? 'nextjs').template.port;
                sandboxResult = await api.sandbox.fork.mutate({
                    sandbox: { id: input.sandboxId, port: templatePort },
                    provider:
                        (input.framework ?? 'nextjs') === 'nextjs' ? undefined : 'code_sandbox',
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
            // See `startCreate` — reject incomplete responses before
            // persisting so the orphan-cleanup path can fire.
            if (!sandboxResult.sandboxId || !sandboxResult.previewUrl) {
                throw new Error(
                    'Sandbox provisioning returned an incomplete response (missing sandbox id or preview URL). Please try again.',
                );
            }

            const project = createDefaultProject({
                overrides: {
                    name: input.name,
                    description: input.description,
                    tags: ['template-import'],
                    // Default Next.js when caller didn't specify — avoids the
                    // preload-injector race on first load.
                    runtimeMetadata: { framework: input.framework ?? 'nextjs' },
                },
            });

            const newProject = await api.project.create.mutate({
                project,
                sandboxId: sandboxResult.sandboxId,
                sandboxUrl: sandboxResult.previewUrl,
                sandboxRuntime: sandboxResult.sandboxRuntime,
                workspaceId: readActiveWorkspaceId(),
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
            // Re-throw so the caller can surface a toast / re-open the
            // auth modal. Without this, callers see `!project`, no toast
            // fires, and the UX dies silently. Mirrors `startCreate`.
            throw error;
        }
    }
}
