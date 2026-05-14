export type ProjectStorageMode = 'cloud' | 'local' | 'hybrid';

export type ProjectSyncStatus = 'disabled' | 'enabled' | 'paused' | 'conflict' | 'error';

/**
 * The framework this project was created as. Stored as a string here (not a
 * `FrameworkId` typed import) because `@weblab/models` is a leaf package and
 * shouldn't depend on `@weblab/framework`. Callers in app code that have
 * `FrameworkId` available should narrow at the boundary.
 *
 * Stored inside `ProjectRuntimeMetadata` (a `jsonb` column) rather than as a
 * dedicated DB column so we can land framework awareness without a schema
 * migration. When the picker save lands, this is what the AI prompt selector
 * and editor pipelines read to behave correctly.
 */
export type ProjectFrameworkId =
    | 'nextjs'
    | 'vite-react'
    | 'remix'
    | 'astro'
    | 'tanstack-start'
    | 'static-html';

export interface ProjectRuntimeMetadata {
    cloud?: {
        provider: 'code_sandbox' | 'vercel_sandbox';
        sandboxId?: string | null;
        previewUrl?: string | null;
        snapshotId?: string | null;
        port?: number | null;
        devCommand?: string | null;
        runtime?: string | null;
    };
    local?: {
        rootPath?: string | null;
        devCommand?: string | null;
        port?: number | null;
    };
    sync?: {
        status: ProjectSyncStatus;
        lastSyncedAt?: Date | null;
    };
    /**
     * The framework adapter id this project was created as. Optional for
     * backward compatibility with projects created before multi-framework
     * support — readers should treat absence as `'nextjs'`.
     */
    framework?: ProjectFrameworkId | null;
}

export interface Project {
    id: string;
    name: string;
    metadata: {
        createdAt: Date;
        updatedAt: Date;
        previewImg: PreviewImg | null;
        description: string | null;
        tags: string[];
        storageMode?: ProjectStorageMode;
        runtime?: ProjectRuntimeMetadata | null;
    };
}

export interface PreviewImg {
    type: 'storage' | 'url';
    storagePath?: {
        bucket: string;
        path: string;
    };
    url?: string;
    updatedAt: Date | null;
}
