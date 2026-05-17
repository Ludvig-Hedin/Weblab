import type {
    PreviewImg,
    Project,
    ProjectRuntimeMetadata,
    ProjectStorageMode,
} from '@weblab/models';
import { ProjectAccessMode } from '@weblab/models';

import type { Project as DbProject } from '../../schema';

const VALID_STORAGE_MODES: readonly ProjectStorageMode[] = ['cloud', 'local', 'hybrid'];

const isValidStorageMode = (value: string | null | undefined): value is ProjectStorageMode =>
    !!value && (VALID_STORAGE_MODES as readonly string[]).includes(value);

const isEmptyRuntimeMetadata = (metadata: ProjectRuntimeMetadata | null | undefined): boolean =>
    !metadata || Object.keys(metadata).length === 0;

export const fromDbProject = (dbProject: DbProject): Project => {
    const tags = dbProject.tags ?? [];

    // Prefer the authoritative `storage_mode` column; fall back to the legacy
    // tag-based inference when the column has not been populated yet.
    const storageMode: ProjectStorageMode = isValidStorageMode(dbProject.storageMode)
        ? dbProject.storageMode
        : tags.includes('local')
          ? 'local'
          : tags.includes('hybrid')
            ? 'hybrid'
            : 'cloud';

    const runtime: ProjectRuntimeMetadata | null = isEmptyRuntimeMetadata(dbProject.runtimeMetadata)
        ? null
        : dbProject.runtimeMetadata;

    return {
        id: dbProject.id,
        name: dbProject.name,
        metadata: {
            createdAt: dbProject.createdAt,
            updatedAt: dbProject.updatedAt,
            previewImg: fromDbPreviewImg(dbProject),
            description: dbProject.description,
            tags,
            storageMode,
            runtime,
        },
    };
};

export const toDbProject = (project: Project): DbProject => {
    const { previewImgUrl, previewImgPath, previewImgBucket, updatedPreviewImgAt } = toDbPreviewImg(
        project.metadata.previewImg,
    );
    return {
        id: project.id,
        name: project.name,
        tags: project.metadata.tags ?? [],
        createdAt: project.metadata.createdAt,
        updatedAt: project.metadata.updatedAt,
        description: project.metadata.description,
        previewImgUrl,
        previewImgPath,
        previewImgBucket,
        updatedPreviewImgAt,
        storageMode: project.metadata.storageMode ?? 'cloud',
        runtimeMetadata: project.metadata.runtime ?? {},
        workspaceId: null,
        accessMode: ProjectAccessMode.RESTRICTED,

        // deprecated
        sandboxId: null,
        sandboxUrl: null,
    };
};

export function fromDbPreviewImg(dbProject: DbProject): PreviewImg | null {
    let previewImg: PreviewImg | null = null;
    if (dbProject.previewImgUrl) {
        previewImg = {
            type: 'url',
            url: dbProject.previewImgUrl,
            updatedAt: dbProject.updatedPreviewImgAt,
        };
    } else if (dbProject.previewImgPath && dbProject.previewImgBucket) {
        previewImg = {
            type: 'storage',
            storagePath: {
                bucket: dbProject.previewImgBucket,
                path: dbProject.previewImgPath,
            },
            updatedAt: dbProject.updatedPreviewImgAt,
        };
    }
    return previewImg;
}

export function toDbPreviewImg(previewImg: PreviewImg | null): {
    previewImgUrl: string | null;
    previewImgPath: string | null;
    previewImgBucket: string | null;
    updatedPreviewImgAt: Date | null;
} {
    const res: {
        previewImgUrl: string | null;
        previewImgPath: string | null;
        previewImgBucket: string | null;
        updatedPreviewImgAt: Date | null;
    } = {
        previewImgUrl: null,
        previewImgPath: null,
        previewImgBucket: null,
        updatedPreviewImgAt: null,
    };

    if (!previewImg) {
        return res;
    }

    if (previewImg.type === 'url' && previewImg.url) {
        res.previewImgUrl = previewImg.url;
    } else if (
        previewImg.type === 'storage' &&
        previewImg.storagePath?.path &&
        previewImg.storagePath.bucket
    ) {
        res.previewImgPath = previewImg.storagePath.path;
        res.previewImgBucket = previewImg.storagePath.bucket;
    }
    res.updatedPreviewImgAt = previewImg.updatedAt ?? new Date();
    return res;
}
