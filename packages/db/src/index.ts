/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unused-vars */
// Post-migration stub: the Drizzle workspace was removed. This shim keeps the
// import path alive for files that haven't been migrated yet to Convex types
// + helpers. New code must NOT add new imports from @weblab/db.

// ---------- Type aliases (placeholders) ----------
// Many type imports come from CMS / workspace / project surfaces that have
// Convex equivalents (Doc<'projects'>, Doc<'cmsCollections'>, etc.). Until
// those call sites are rewritten to use the Convex Doc<T> types, these
// permissive aliases keep TypeScript quiet.

export type CmsCollection = Record<string, unknown> & { id: string; name: string; slug: string };
export type CmsField = Record<string, unknown> & { id: string; key: string; type: string };
export type CmsItem = Record<string, unknown> & { id: string };
export type CmsSource = Record<string, unknown> & { id: string; name: string; type: string };
export type CmsBinding = Record<string, unknown> & { id: string };
export type CmsCollectionPage = Record<string, unknown> & { id: string; pagePath: string };

export type ProjectInvitation = Record<string, unknown> & {
    id: string;
    projectId: string;
    inviteeEmail: string;
    role: string;
    memberRole?: string;
    token: string;
    status: string;
    expiresAt: Date | number;
};
// Drizzle was strict-typed via discriminated unions per CreateRequestContextType.
// The Convex schema stores `context: v.any()` for the same reason. Loosen to
// `any[]` so legacy `.filter((c) => c.type === ...)` chains keep compiling.
export interface ProjectCreateRequest {
    id: string;
    projectId: string;
    context: any[];
    status: string;
    [key: string]: unknown;
}
export type ProjectMember = Record<string, unknown> & {
    projectId: string;
    userId: string;
    role: string;
};

// Publish dropdown reads many fields off Deployment as React children — leave
// commonly-displayed fields typed concretely; `any` rest catches the long
// tail without forcing a `as` cast at every JSX site.
export interface Deployment {
    id: string;
    projectId: string;
    status: string;
    type: string;
    urls?: string[];
    message?: string;
    progress?: number;
    error?: string;
    requestedBy?: string;
    sandboxId?: string;
    provider?: string;
    buildLog?: string;
    buildScript?: string;
    buildFlags?: string;
    envVars?: Record<string, string>;
    updatedAt?: number | Date;
    createdAt?: number | Date;
    [key: string]: any;
}

// ---------- Constants ----------
// These were canvas defaults inlined in the Drizzle workspace. Re-exported
// here so consumers don't need to know they moved.

export const DefaultDesktopFrame = {
    width: 1440,
    height: 900,
    x: 0,
    y: 0,
} as const;

export const GROUP_GUTTER = 96 as const;

export interface BreakpointPreset {
    id: string;
    name: string;
    width: number;
    height: number;
    order: number;
}

export const DEFAULT_BREAKPOINT_PRESETS: BreakpointPreset[] = [
    { id: 'desktop', name: 'Desktop', width: 1440, height: 900, order: 0 },
    { id: 'tablet', name: 'Tablet', width: 768, height: 1024, order: 1 },
    { id: 'phone', name: 'Phone', width: 375, height: 812, order: 2 },
];

// ---------- Legacy schema re-exports (table objects used by Drizzle queries) ----------
// These tables are only used inside legacy code paths that throw at runtime
// via `db` from `./client`. Exported as `unknown`-typed objects so type
// inference doesn't barf on `eq(users.id, ...)` style calls — the runtime
// throws immediately anyway.

export const users = {} as Record<string, unknown>;
export const userProviderConnections = {} as Record<string, unknown>;
export const legacySubscriptions = {} as Record<string, unknown>;
export const subscriptions = {} as Record<string, unknown>;
export const projects = {} as Record<string, unknown>;

// ---------- Helpers (legacy mappers — no-op or throw) ----------

export function createDefaultProject(args: unknown): unknown {
    throw new Error(
        '[@weblab/db] createDefaultProject removed — use api.projects.create via Convex.',
    );
}

// toDbMessage maps an AI SDK `UIMessage` (the in-memory chat shape:
// `{ id, role, parts, metadata }`) into the Convex `messages` row shape that
// `api.messages.replaceConversationMessages` validates against
// (`messageInsertArgs`: `conversationId` + `content: v.string()` + `role` +
// optional `parts`/`context`/`checkpoints`/`usage`).
//
// The previous stub spread the UIMessage verbatim, which detonated the
// persist mutation: `content` was missing (required), the client UUID `id`
// failed `v.id('messages')` validation, and the extra `metadata` field was
// rejected by the strict `v.object`. Every chat turn threw
// `ArgumentValidationError` AFTER the stream had flushed, so conversations
// silently vanished on reload. We now derive `content` from the text parts
// and lift the persisted metadata fields to top-level, dropping `id`/`metadata`.
export function toDbMessage(
    msg: Record<string, any>,
    conversationId?: string,
): Record<string, any> {
    const parts: any[] = Array.isArray(msg.parts) ? msg.parts : [];
    const content = parts
        .filter((p) => p?.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text as string)
        .join('');
    const metadata: Record<string, any> =
        msg.metadata && typeof msg.metadata === 'object' ? msg.metadata : {};

    const row: Record<string, any> = {
        role: msg.role,
        content,
        parts,
        context: Array.isArray(metadata.context) ? metadata.context : [],
        checkpoints: Array.isArray(metadata.checkpoints) ? metadata.checkpoints : [],
    };
    if (metadata.usage !== undefined) row.usage = metadata.usage;
    if (conversationId) row.conversationId = conversationId;
    return row;
}

// toDbFrame / toDbPartialFrame returned plain DB-shape objects. Stub returns
// the passed-in object as-is so legacy spreads (`{ ...toDbPartialFrame(f) }`)
// keep compiling. Runtime behavior is acceptable because the api.frame.update
// callers themselves throw via the trpc shim.
export function toDbFrame(args: any): Record<string, any> {
    return (args ?? {}) as Record<string, any>;
}

export function toDbPartialFrame(args: any): Record<string, any> {
    return (args ?? {}) as Record<string, any>;
}
