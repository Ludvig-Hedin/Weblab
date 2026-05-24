import type { PreviewImg, Project, ProjectRuntimeMetadata, ProjectStorageMode } from '@weblab/models';
import { STORAGE_BUCKETS } from '@weblab/constants';

import { getFileUrlFromStorage } from '@/utils/supabase/client';

export interface ProjectListItem extends Project {
    siteUrl?: string | null;
    previewUrl?: string | null;
    publishedUrl?: string | null;
    // Live dev-server URL for the project's running sandbox. Used as an
    // iframe fallback in the preview surface while the static screenshot is
    // (re-)captured. Internal only — do not surface in shareable UI.
    sandboxPreviewUrl?: string | null;
}

// Shape returned by the Convex `projects.list` query (flat Convex doc + extra fields).
type ConvexProjectListCard = {
    _id: string;
    _creationTime: number;
    name: string;
    description?: string;
    tags: string[];
    updatedAt: number;
    previewImgUrl?: string;
    previewImgPath?: string;
    previewImgBucket?: string;
    updatedPreviewImgAt?: number;
    storageMode?: string;
    runtimeMetadata?: unknown;
    siteUrl?: string | null;
    previewUrl?: string | null;
    publishedUrl?: string | null;
    sandboxPreviewUrl?: string | null;
};

export function fromConvexProjectListCard(doc: ConvexProjectListCard): ProjectListItem {
    let previewImg: PreviewImg | null = null;
    if (doc.previewImgPath) {
        previewImg = {
            type: 'storage',
            storagePath: {
                bucket: doc.previewImgBucket ?? STORAGE_BUCKETS.PREVIEW_IMAGES,
                path: doc.previewImgPath,
            },
            updatedAt: doc.updatedPreviewImgAt ? new Date(doc.updatedPreviewImgAt) : null,
        };
    } else if (doc.previewImgUrl) {
        previewImg = {
            type: 'url',
            url: doc.previewImgUrl,
            updatedAt: doc.updatedPreviewImgAt ? new Date(doc.updatedPreviewImgAt) : null,
        };
    }

    return {
        id: doc._id,
        name: doc.name,
        metadata: {
            createdAt: new Date(doc._creationTime),
            updatedAt: new Date(doc.updatedAt),
            description: doc.description ?? null,
            tags: doc.tags ?? [],
            previewImg,
            storageMode: doc.storageMode as ProjectStorageMode | undefined,
            runtime: (doc.runtimeMetadata as ProjectRuntimeMetadata | null | undefined) ?? null,
        },
        siteUrl: doc.siteUrl ?? null,
        previewUrl: doc.previewUrl ?? null,
        publishedUrl: doc.publishedUrl ?? null,
        sandboxPreviewUrl: doc.sandboxPreviewUrl ?? null,
    };
}

export interface ProjectFolder {
    id: string;
    name: string;
    projectIds: string[];
    createdAt: string;
    updatedAt: string;
}

const PROJECT_FOLDERS_STORAGE_KEY = 'weblab_project_folders_v1';

export const getFoldersStorageKey = (userId?: string | null) =>
    `${PROJECT_FOLDERS_STORAGE_KEY}:${userId ?? 'anonymous'}`;

export const getProjectPreviewImageUrl = (project: Project): string | null => {
    const preview = project.metadata?.previewImg;

    if (!preview) {
        return null;
    }

    if (preview.type === 'url' && preview.url) {
        return preview.url;
    }

    const path = preview.storagePath?.path;
    const bucket = preview.storagePath?.bucket ?? STORAGE_BUCKETS.PREVIEW_IMAGES;

    return path ? (getFileUrlFromStorage(bucket, path) ?? null) : null;
};

export const getProjectSiteUrl = (project: ProjectListItem): string | null =>
    project.siteUrl ?? project.publishedUrl ?? project.previewUrl ?? null;

// Live sandbox URL used only for in-app preview iframes. Never share.
export const getProjectSandboxPreviewUrl = (project: ProjectListItem): string | null =>
    project.sandboxPreviewUrl ?? null;

export const getDisplayUrl = (url: string | null | undefined): string | null => {
    if (!url) {
        return null;
    }

    try {
        const parsed = new URL(url);
        const path = parsed.pathname === '/' ? '' : parsed.pathname;
        const search =
            parsed.search.length > 16 ? `${parsed.search.slice(0, 16)}...` : parsed.search;
        return `${parsed.hostname}${path}${search}`;
    } catch {
        return url.replace(/^https?:\/\//, '');
    }
};

export const getFaviconUrl = (url: string | null | undefined): string | null => {
    if (!url) {
        return null;
    }

    try {
        const parsed = new URL(url);
        return `${parsed.origin}/favicon.ico`;
    } catch {
        return null;
    }
};

export const sanitizeFolders = (
    folders: ProjectFolder[],
    validProjectIds: Set<string>,
): ProjectFolder[] => {
    return folders
        .map((folder) => ({
            ...folder,
            projectIds: Array.from(
                new Set(folder.projectIds.filter((projectId) => validProjectIds.has(projectId))),
            ),
        }))
        .filter((folder) => folder.name.trim().length > 0);
};

export const moveProjectIdsToFolder = (
    folders: ProjectFolder[],
    projectIds: string[],
    folderId: string | null,
): ProjectFolder[] => {
    const selectedIds = new Set(projectIds);
    const nextFolders = folders.map((folder) => ({
        ...folder,
        projectIds: folder.projectIds.filter((projectId) => !selectedIds.has(projectId)),
    }));

    if (!folderId) {
        return nextFolders;
    }

    return nextFolders.map((folder) =>
        folder.id === folderId
            ? {
                  ...folder,
                  projectIds: Array.from(new Set([...folder.projectIds, ...projectIds])),
                  updatedAt: new Date().toISOString(),
              }
            : folder,
    );
};
