import type { ProjectFrameworkId, RouterType } from '@weblab/models';

/**
 * Identifier for a supported framework. New adapters must add an id here AND
 * register themselves in `./registry.ts`. Aliased to `ProjectFrameworkId` from
 * `@weblab/models` so values stored in `ProjectRuntimeMetadata.framework` are
 * the same type — readers in app code don't have to translate at the
 * persistence boundary.
 */
export type FrameworkId = ProjectFrameworkId;

/**
 * Identifier for an editor pipeline (parser/oid-injection/edit/generate strategy).
 * The pipeline implementations live in `@weblab/parser`'s pipelines module
 * (introduced in Phase 2). Adapters declare which pipelines apply to their
 * project shape.
 */
export type EditorPipelineId = 'jsx' | 'html' | 'astro';

/**
 * Lightweight representation of a project's files. Used by adapters'
 * `validate()` and `detectRouterType()` so they can inspect package.json /
 * directory layout without depending on the runtime sandbox provider.
 */
export interface ProjectFile {
    /** Forward-slash path relative to the project root, e.g. "package.json". */
    path: string;
    /** UTF-8 text content. Adapters should treat null as "binary or unreadable". */
    content: string | null;
}

export type ProjectFiles = ReadonlyArray<ProjectFile>;

export interface ValidationOk {
    isValid: true;
    /** Optional Next.js-specific router type. Other frameworks omit this. */
    routerType?: RouterType;
    /**
     * Optional warnings to surface to the user even though validation passed
     * (e.g. "no Tailwind detected; visual style edits may be limited").
     */
    warnings?: string[];
}

export interface ValidationFail {
    isValid: false;
    error: string;
}

export type ValidationResult = ValidationOk | ValidationFail;

export interface FrameworkTemplate {
    /**
     * Vercel Sandbox scaffolder identifier this framework provisions with.
     * `'pending'` means no scaffolder has been implemented yet — the framework
     * is registered for type-system completeness but is gated out of project
     * creation by `isFrameworkReady`. CodeSandbox template ids were retired
     * 2026-05-24; see docs/notes/2026-05-13-vercel-sandbox-provider.md.
     */
    vercelScaffold: 'nextjs' | 'static-html' | 'pending';
    /** Port the framework's dev server listens on inside the sandbox. */
    port: number;
    /**
     * Task name registered with the runtime that starts the dev server.
     * For Vercel sandboxes this is the script key in package.json (`'dev'`).
     */
    devTask: string;
    /**
     * True if the framework serves a pre-built static bundle rather than a
     * long-running dev server. Used by the static-html adapter; informs how
     * the editor wires up live-reload.
     */
    staticHosting?: boolean;
}

/**
 * Describes one supported framework. The adapter is the single source of
 * truth for "what does this framework look like, and how do we run/edit it?".
 *
 * Phase 1 introduces the interface and a Next.js adapter that captures
 * existing behavior. Subsequent phases add adapters for Vite, Remix, Astro,
 * TanStack Start, and static HTML.
 */
export interface FrameworkAdapter {
    readonly id: FrameworkId;
    readonly displayName: string;
    /** Default sandbox template + dev server contract for new projects. */
    readonly template: FrameworkTemplate;
    /** Editor pipelines that can edit files in this kind of project. */
    readonly pipelines: ReadonlyArray<EditorPipelineId>;

    /**
     * Inspect a candidate project (e.g. an uploaded folder) and decide
     * whether it can be opened as this kind of project. Adapters should
     * return a structured error string on failure rather than throwing.
     */
    validate(files: ProjectFiles): ValidationResult | Promise<ValidationResult>;

    /**
     * Optional Next.js-specific routing detection. Returns null when the
     * concept doesn't apply to this framework.
     */
    detectRouterType?(files: ProjectFiles): RouterType | null;
}
