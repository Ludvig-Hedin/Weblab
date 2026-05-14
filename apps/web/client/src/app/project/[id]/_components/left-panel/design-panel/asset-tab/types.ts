import type { AssetType } from '@weblab/utility';

export interface AssetData {
    name: string;
    path: string;
    type: AssetType;
    mimeType: string;
    size?: number;
    modifiedTime?: Date;
}

export interface FolderData {
    name: string;
    path: string;
}

export interface BreadcrumbSegment {
    name: string;
    path: string;
}
