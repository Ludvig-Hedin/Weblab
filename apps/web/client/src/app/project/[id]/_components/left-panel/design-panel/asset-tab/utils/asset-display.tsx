import type { AssetType } from '@weblab/utility';
import { Icons } from '@weblab/ui/icons';

/** Plural, human-readable label for each asset category. */
export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
    image: 'Images',
    video: 'Videos',
    audio: 'Audio',
    font: 'Fonts',
    lottie: 'Lottie',
    rive: 'Rive',
    document: 'Documents',
    other: 'Other',
};

/** Order type filters appear in the Assets panel sidebar / dropdown. */
export const TYPE_FILTER_ORDER: AssetType[] = [
    'image',
    'video',
    'audio',
    'document',
    'lottie',
    'rive',
    'font',
    'other',
];

/** Icon component for an asset category, used on generic (non-preview) cards. */
export const getAssetTypeIcon = (type: AssetType) => {
    switch (type) {
        case 'image':
            return Icons.Image;
        case 'video':
            return Icons.Video;
        case 'font':
        case 'document':
            return Icons.Text;
        case 'lottie':
        case 'rive':
            return Icons.Cube;
        case 'audio':
        case 'other':
        default:
            return Icons.File;
    }
};

/** Uppercase file extension without the dot, e.g. "image.PNG" -> "PNG". */
export const getFileExtensionLabel = (fileName: string): string => {
    const dot = fileName.lastIndexOf('.');
    return dot === -1 ? '' : fileName.substring(dot + 1).toUpperCase();
};
