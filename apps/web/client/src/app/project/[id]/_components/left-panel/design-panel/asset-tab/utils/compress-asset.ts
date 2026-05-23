// In-place raster compression for the Assets panel. Re-encodes through a
// canvas at reduced quality while keeping the original file extension, so
// asset references in code stay valid. SVG / PDF / video are not supported.

const CANVAS_OUTPUT_MIME: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
};

const getExtension = (fileName: string): string => {
    const lower = fileName.toLowerCase();
    const dot = lower.lastIndexOf('.');
    return dot === -1 ? '' : lower.substring(dot);
};

/** Whether `compressAsset` can re-encode this file without changing its format. */
export function canCompressAsset(fileName: string): boolean {
    return getExtension(fileName) in CANVAS_OUTPUT_MIME;
}

export interface CompressAssetResult {
    bytes: Uint8Array;
    originalSize: number;
    compressedSize: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode image for compression'));
        img.src = src;
    });
}

/**
 * Re-encode raster image bytes at reduced quality, preserving dimensions and
 * format. Returns the new bytes alongside the original and compressed sizes —
 * the caller decides whether the result is worth writing back.
 */
export async function compressAsset(
    fileName: string,
    originalBytes: Uint8Array,
    quality = 0.8,
): Promise<CompressAssetResult> {
    const outputMime = CANVAS_OUTPUT_MIME[getExtension(fileName)];
    if (!outputMime) {
        throw new Error('This file type cannot be compressed');
    }

    const sourceBlob = new Blob([originalBytes as BlobPart], {
        type: outputMime,
    });
    const url = URL.createObjectURL(sourceBlob);
    try {
        const img = await loadImage(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Canvas not available');
        }
        ctx.drawImage(img, 0, 0);

        const outputBlob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, outputMime, quality);
        });
        if (!outputBlob) {
            throw new Error('Compression failed');
        }

        const bytes = new Uint8Array(await outputBlob.arrayBuffer());
        return {
            bytes,
            originalSize: originalBytes.byteLength,
            compressedSize: bytes.byteLength,
        };
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Human-readable byte size, e.g. 1536 -> "1.5 KB". */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
