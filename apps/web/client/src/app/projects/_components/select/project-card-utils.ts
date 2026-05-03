import type { Project } from '@weblab/models';
import { STORAGE_BUCKETS } from '@weblab/constants';

import { getFileUrlFromStorage } from '@/utils/supabase/client';

export interface ProjectListItem extends Project {
    siteUrl?: string | null;
    previewUrl?: string | null;
    publishedUrl?: string | null;
}

export interface ProjectFolder {
    id: string;
    name: string;
    projectIds: string[];
    createdAt: string;
    updatedAt: string;
}

const PROJECT_FOLDERS_STORAGE_KEY = 'onlook_project_folders_v1';

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
