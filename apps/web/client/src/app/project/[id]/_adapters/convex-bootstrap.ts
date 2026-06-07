// Adapter between Convex `Doc<>` rows and the legacy editor store shape
// (`@weblab/models` Project / Branch). The editor was written against the
// Drizzle row shape (nested `sandbox: { id }`, `Date` timestamps, etc.) —
// post-migration we serve Convex docs, which use flat `sandboxId` strings
// and `number` epoch milliseconds. Keeps the conversion in one place so the
// stores don't need to learn about both shapes.

import type {
    Branch,
    Canvas,
    ChatConversation,
    ChatMessage,
    Frame,
    LayoutGuideConfig,
    Project,
} from '@weblab/models';
import { DefaultSettings } from '@weblab/constants';
import { AgentType } from '@weblab/models';

import type { EditorBootstrapData } from '../_hooks/use-start-project';

type ConvexProjectDoc = {
    _id: string;
    _creationTime: number;
    name: string;
    description?: string;
    tags?: string[];
    updatedAt: number;
    storageMode?: string;
    runtimeMetadata?: { framework?: string };
    workspaceId?: string;
    createdByUserId?: string;
    accessMode?: string;
    sandboxId?: string;
    sandboxUrl?: string;
    previewImg?: string | null;
};

type ConvexBranchDoc = {
    _id: string;
    _creationTime: number;
    projectId: string;
    name: string;
    description?: string;
    isDefault: boolean;
    updatedAt: number;
    gitBranch?: string;
    gitCommitSha?: string;
    gitRepoUrl?: string;
    sandboxId: string;
    runtimeType: string;
    runtimeMetadata: unknown;
    frames?: unknown[];
};

export function fromConvexProject(doc: ConvexProjectDoc): Project {
    // Cast through `unknown` — the legacy `Project` model carries fields the
    // Convex doc doesn't yet ship (e.g. previewImg URL, settings). Editor
    // surfaces that read those fields will see `undefined` and either fall
    // back to defaults or render an empty state, which is correct for a
    // freshly created project anyway.
    return {
        id: doc._id,
        name: doc.name,
        metadata: {
            createdAt: new Date(doc._creationTime),
            updatedAt: new Date(doc.updatedAt),
            previewImg: doc.previewImg
                ? { type: 'url', url: doc.previewImg, updatedAt: new Date(doc.updatedAt) }
                : null,
            description: doc.description ?? null,
            tags: doc.tags ?? [],
            storageMode: doc.storageMode ?? 'cloud',
            runtime: doc.runtimeMetadata ?? { framework: 'nextjs' },
        },
        // Legacy aliases retained for editor surfaces that still read the
        // pre-Project.metadata shape during the Convex migration.
        description: doc.description ?? null,
        createdAt: new Date(doc._creationTime),
        updatedAt: new Date(doc.updatedAt),
        previewImg: doc.previewImg ?? null,
        sandboxId: doc.sandboxId ?? '',
        sandboxUrl: doc.sandboxUrl ?? '',
        runtimeMetadata: doc.runtimeMetadata ?? { framework: 'nextjs' },
        // Legacy access mode strings; the editor only branches on
        // 'private' vs 'workspace' vs 'public'.
        accessMode: doc.accessMode ?? 'workspace',
        storageMode: (doc.storageMode ?? 'cloud') as never,
        tags: doc.tags ?? [],
        workspaceId: doc.workspaceId ?? null,
    } as unknown as Project;
}

export function fromConvexBranch(doc: ConvexBranchDoc): Branch {
    return {
        id: doc._id,
        projectId: doc.projectId,
        name: doc.name,
        description: doc.description ?? null,
        createdAt: new Date(doc._creationTime),
        updatedAt: new Date(doc.updatedAt),
        isDefault: doc.isDefault,
        git:
            doc.gitBranch || doc.gitCommitSha || doc.gitRepoUrl
                ? {
                      branch: doc.gitBranch ?? null,
                      commitSha: doc.gitCommitSha ?? null,
                      repoUrl: doc.gitRepoUrl ?? null,
                  }
                : null,
        // Re-wrap the flat `sandboxId` column in the nested shape the editor
        // stores were written against. SandboxManager dereferences
        // `branch.sandbox.id` in its session-start path — leaving this flat
        // throws `TypeError: Cannot read properties of undefined (reading 'id')`
        // before the editor ever finishes init.
        sandbox: { id: doc.sandboxId },
        // Build BranchRuntime from the two Convex columns: `runtimeType`
        // ('cloud'|'local'|'hybrid') carries the required discriminant the
        // editor branches on (session.ts reads `branch.runtime.type`), while
        // `runtimeMetadata` carries provider-specific fields. Dropping
        // runtimeType (the previous `runtime: runtimeMetadata`) left
        // `runtime.type` undefined, misclassifying every branch.
        runtime: {
            ...(doc.runtimeMetadata && typeof doc.runtimeMetadata === 'object'
                ? (doc.runtimeMetadata as Record<string, unknown>)
                : {}),
            // `type` is the discriminant the editor branches on — keep it last
            // so a stray `type` key inside runtimeMetadata can't clobber it.
            type: doc.runtimeType || 'cloud',
        } as never,
    } as unknown as Branch;
}

// ── Conversation / Canvas / Frame / Message adapters ─────────────────────────
// The editor stores (ConversationManager, CanvasManager, FramesManager) and the
// AI SDK chat hook were written against the `@weblab/models` shapes, NOT the
// flat Convex `Doc<>` rows that `getEditorBootstrap` / `conversations.list` /
// `messages.listByConversation` return. Without these adapters the bootstrap
// path fed raw docs straight into the stores (`initialBootstrap={... as any}`),
// so `conversation.id` was `undefined` (chat panel stuck on the loading spinner
// forever), `canvas.id` was `undefined` (pan/zoom never persisted), and frame
// reads like `frame.breakpoint.order` threw on the flat row shape.

type ConvexConversationDoc = {
    _id: string;
    _creationTime: number;
    projectId: string;
    agentType?: string;
    displayName?: string;
    updatedAt: number;
    suggestions?: unknown;
};

type ConvexUserCanvasDoc = {
    _id: string;
    userId: string;
    canvasId: string;
    scale: number;
    x: number;
    y: number;
    // Per-user canvas chrome toggles. Optional because legacy rows predate
    // the columns; readers default to false (rulers) / true (guides).
    showRulers?: boolean;
    showLayoutGuides?: boolean;
};

type ConvexCanvasDoc = { _id: string; projectId: string };

type ConvexFrameDoc = {
    _id: string;
    canvasId: string;
    branchId?: string;
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
    groupId?: string;
    breakpointId?: string;
    breakpointName?: string;
    breakpointOrder?: number;
    // Optional Figma-style layout guides stored as a flat array on the frame
    // row. The Convex validator (schema.ts) keeps these in lock-step with
    // `LayoutGuideConfig` in @weblab/models.
    layoutGuides?: LayoutGuideConfig[];
};

type ConvexMessageDoc = {
    _id: string;
    _creationTime: number;
    conversationId: string;
    content: string;
    role: string;
    parts?: unknown;
    context?: unknown;
    checkpoints?: unknown;
    usage?: unknown;
};

export function fromConvexConversation(doc: ConvexConversationDoc): ChatConversation {
    return {
        id: doc._id,
        agentType: (doc.agentType as AgentType | undefined) ?? AgentType.ROOT,
        title: doc.displayName ?? null,
        projectId: doc.projectId,
        createdAt: new Date(doc._creationTime),
        updatedAt: new Date(doc.updatedAt),
        suggestions: Array.isArray(doc.suggestions)
            ? (doc.suggestions as ChatConversation['suggestions'])
            : [],
    };
}

// Merges the shared `canvases` row (its `_id` is the canvas id saves key off)
// with the per-user `userCanvases` row (scale + pan position). `userCanvas` is
// null until the user pans/zooms for the first time.
export function fromConvexCanvas(
    canvas: ConvexCanvasDoc,
    userCanvas: ConvexUserCanvasDoc | null,
): Canvas {
    return {
        id: canvas._id,
        userId: userCanvas?.userId ?? '',
        scale: userCanvas?.scale ?? DefaultSettings.SCALE,
        position: userCanvas
            ? { x: userCanvas.x, y: userCanvas.y }
            : { ...DefaultSettings.PAN_POSITION },
        // Per-user canvas chrome toggles. Forward only when the column
        // exists on the row — the CanvasManager keeps its defaults
        // (rulers off / guides on) when these are undefined.
        showRulers: userCanvas?.showRulers,
        showLayoutGuides: userCanvas?.showLayoutGuides,
    };
}

// Inverse of `toConvexFrame` in frames/manager.ts. The Convex row is flat
// (`x`/`y`/`width`/`height`/`breakpoint*`); the editor model nests them.
// Breakpoint width isn't persisted, so fall back to the frame width (matches
// the `breakpoint.width || dimension.width` reads in the manager).
export function fromConvexFrame(doc: ConvexFrameDoc): Frame {
    return {
        id: doc._id,
        branchId: doc.branchId ?? '',
        canvasId: doc.canvasId,
        groupId: doc.groupId ?? '',
        breakpoint: {
            id: doc.breakpointId ?? 'desktop',
            name: doc.breakpointName ?? 'Desktop',
            width: doc.width,
            order: doc.breakpointOrder ?? 0,
        },
        position: { x: doc.x, y: doc.y },
        dimension: { width: doc.width, height: doc.height },
        url: doc.url,
        // Forward layout guides as-is. Convex validators already shape the
        // array to match `LayoutGuideConfig`; legacy rows lacking the column
        // come through as `undefined` and the overlay treats them as empty.
        layoutGuides: doc.layoutGuides,
    };
}

// Inverse of `toDbMessage` (packages/db). The Convex row keeps `content` +
// top-level `context`/`checkpoints`/`usage`; the AI SDK `ChatMessage` carries
// those under `metadata` and keys identity off `id` (the row's `_id`).
export function fromConvexMessage(doc: ConvexMessageDoc): ChatMessage {
    return {
        id: doc._id,
        role: doc.role as ChatMessage['role'],
        parts: (Array.isArray(doc.parts) ? doc.parts : []) as ChatMessage['parts'],
        metadata: {
            createdAt: new Date(doc._creationTime),
            conversationId: doc.conversationId,
            context: (Array.isArray(doc.context) ? doc.context : []) as never,
            checkpoints: (Array.isArray(doc.checkpoints) ? doc.checkpoints : []) as never,
            usage: doc.usage as never,
        },
    } as ChatMessage;
}

type ConvexBootstrap = {
    canvas: {
        canvas: ConvexCanvasDoc;
        userCanvas: ConvexUserCanvasDoc | null;
        frames: ConvexFrameDoc[];
    } | null;
    conversations: ConvexConversationDoc[];
    creationRequest: Record<string, unknown> | null;
};

// Raw `getEditorBootstrap` result → the `EditorBootstrapData` the editor route
// (`use-start-project`) expects. `project`/`branches` are consumed separately
// via `ProjectProviders`, so they're intentionally dropped here.
export function fromConvexBootstrap(raw: ConvexBootstrap): EditorBootstrapData {
    return {
        canvas: raw.canvas
            ? {
                  userCanvas: fromConvexCanvas(raw.canvas.canvas, raw.canvas.userCanvas),
                  frames: raw.canvas.frames.map(fromConvexFrame),
              }
            : null,
        conversations: raw.conversations.map(fromConvexConversation),
        creationRequest: raw.creationRequest
            ? ({
                  ...raw.creationRequest,
                  id: String((raw.creationRequest as { _id?: string })._id ?? ''),
              } as unknown as EditorBootstrapData['creationRequest'])
            : null,
    };
}
