import type { ConvexHttpClient } from 'convex/browser';
import { makeAutoObservable, runInAction } from 'mobx';

import type { FrameworkId } from '@weblab/framework';
import { type ImageMessageContext } from '@weblab/models/chat';

import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@/app/w/[slug]/_components/workspace-context';
import { api as convexApi } from '@convex/_generated/api';
import { getConvexHttpClient } from '@/components/store/lib/convex-http-client';
import { parseRepoUrl } from './parse-repo-url';

// TODO(sandbox-port): The legacy create flow ran through the tRPC sandbox
// routers (`api.sandbox.fork`, `api.sandbox.createFromGitHub`,
// `api.sandbox.deleteOrphan`, `api.github.validate`) plus the bespoke
// `api.project.create` mutation that wrote the project graph and persisted
// the sandbox bindings in a single transaction. None of those have Convex
// equivalents yet — the corresponding Convex action
// (`api.projectActions.createBlank`) only handles the blank-project shape and
// does not accept prompts, image context, github subpaths, or pre-seeded
// templates. Until those paths are ported, the prompt / GitHub / public-
// template create flows fail fast with a user-visible error instead of
// silently corrupting state. `generateName` is wired through Convex so the
// title-generation path remains usable for the rest of the create UI.
const UNAVAILABLE_MESSAGE =
    'Project creation is temporarily unavailable while the sandbox layer is being migrated to Convex. Please check back shortly.';

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
    private convex: ConvexHttpClient = getConvexHttpClient();

    constructor() {
        makeAutoObservable(this);
    }

    async generateProjectName(prompt: string): Promise<string> {
        try {
            const generatedName = (await this.convex.action(
                convexApi.projectActions.generateName,
                {
                    prompt,
                },
            )) as string;
            return generatedName;
        } catch (error: unknown) {
            console.error('Error generating project name:', error);
            return 'New Project';
        }
    }

    /**
     * TODO(sandbox-port): replace once the prompt-create flow is ported to
     * Convex. The legacy implementation chained `api.sandbox.fork` →
     * `api.project.create`. Both still have no Convex equivalents that accept
     * a prompt + image context, so the entry point throws a friendly error
     * surfaced by the caller's toast. The signature is preserved so the
     * callers compile; the unused locals keep TS happy without changing the
     * public API.
     */
    async startCreate(
        userId: string,
        _prompt: string,
        _images: ImageMessageContext[],
    ): Promise<{ id: string }> {
        this.error = null;
        if (!userId) {
            throw new CreateFlowNotAuthenticatedError();
        }
        runInAction(() => {
            this.error = UNAVAILABLE_MESSAGE;
            this.phase = 'idle';
        });
        throw new Error(UNAVAILABLE_MESSAGE);
    }

    resetPhase() {
        this.phase = 'idle';
    }

    /**
     * TODO(sandbox-port): see `startCreate`. GitHub-template imports relied on
     * `api.github.validate`, `api.sandbox.createFromGitHub`, and
     * `api.project.create` — none have Convex equivalents yet.
     */
    async startGitHubTemplate(userId: string, repoUrl: string): Promise<{ id: string }> {
        this.error = null;
        if (!userId) {
            throw new CreateFlowNotAuthenticatedError();
        }
        // Validate the URL shape eagerly so the user gets a precise error for
        // a bad URL before hitting the unavailability message — preserves the
        // pre-migration UX where parseRepoUrl errors surfaced as a toast.
        parseRepoUrl(repoUrl);
        runInAction(() => {
            this.error = UNAVAILABLE_MESSAGE;
        });
        throw new Error(UNAVAILABLE_MESSAGE);
    }

    /**
     * TODO(sandbox-port): wraps `api.sandbox.createFromGitHub` — no Convex
     * equivalent yet. The shape is preserved so callers (currently only
     * `startPublicGitHubTemplate`) compile.
     */
    async createSandboxFromGithub(
        _repoUrl: string,
        _branch: string,
        _subpath?: string,
    ): Promise<{
        sandboxId: string;
        previewUrl: string;
        sandboxRuntime?: {
            provider: 'code_sandbox' | 'vercel_sandbox';
            snapshotId?: string;
            port?: number;
            devCommand?: string;
            runtime?: string;
        };
    }> {
        throw new Error(UNAVAILABLE_MESSAGE);
    }

    /**
     * TODO(sandbox-port): replace once template-based create lands in Convex.
     * Legacy implementation supported a fast `api.sandbox.fork` path for
     * pre-seeded templates plus a slow `api.sandbox.createFromGitHub` path.
     */
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
    }): Promise<{ id: string }> {
        this.error = null;
        if (!input.userId) {
            throw new CreateFlowNotAuthenticatedError();
        }
        if (input.sandboxId && input.subpath) {
            throw new CreateFlowInvalidInputError(
                'Cannot use subpath with pre-seeded sandbox templates.',
            );
        }
        runInAction(() => {
            this.error = UNAVAILABLE_MESSAGE;
        });
        throw new Error(UNAVAILABLE_MESSAGE);
    }
}
