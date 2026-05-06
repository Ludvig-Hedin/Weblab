export type ProjectStorageMode = 'cloud' | 'local' | 'hybrid';

export type ProjectSyncStatus = 'disabled' | 'enabled' | 'paused' | 'conflict' | 'error';

export interface ProjectRuntimeMetadata {
    cloud?: {
        provider: 'code_sandbox';
        sandboxId?: string | null;
        previewUrl?: string | null;
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
