export type BranchRuntimeType = 'cloud' | 'local' | 'hybrid';

export interface BranchRuntime {
    type: BranchRuntimeType;
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
        enabled: boolean;
        status: 'disabled' | 'enabled' | 'paused' | 'conflict' | 'error';
        lastSyncedAt?: Date | null;
    };
}

export interface Branch {
    id: string;
    projectId: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    isDefault: boolean;
    git: {
        branch: string | null;
        commitSha: string | null;
        repoUrl: string | null;
    } | null;
    sandbox: {
        id: string;
    };
    runtime: BranchRuntime;
}
