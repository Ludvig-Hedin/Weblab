import { ConvexError, convexToJson, v } from 'convex/values';

export const CLOUD_EDITOR_VERSION = 1;
export const CLOUD_EDITOR_TAG = 'cloud-editor-v1';
export const MAX_CLOUD_FILES = 400;
export const MAX_CLOUD_TEXT_BYTES = 750_000;
export const MAX_CLOUD_ASSET_BYTES = 2_000_000;
export const MAX_CLOUD_PROJECT_BYTES = 32_000_000;
export const MAX_CLOUD_CHANGE_BYTES = 3_000_000;
export const MAX_CLOUD_INLINE_BYTES = 4_000_000;

export const cloudScope = { projectId: v.id('projects'), branchId: v.id('branches') };
export const cloudChange = v.object({
    path: v.string(),
    content: v.union(v.string(), v.bytes(), v.null()),
    directory: v.optional(v.boolean()),
});

export function cloudError(code: string): never {
    throw new ConvexError(code);
}

/** Canonical relative paths only. Runtime materialization never interpolates these in shell code. */
export function cloudPath(value: string): string {
    if (!value || value.length > 240 || value.startsWith('/') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value))
        return cloudError('CLOUD_INVALID_PATH');
    const parts = value.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.env') || ['.git', '.next', 'node_modules'].includes(part) || (part === '.weblab' && value !== '.weblab/interactions.json' && value !== '.weblab')))
        return cloudError('CLOUD_INVALID_PATH');
    return value;
}

export function assertCloudRevision(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) cloudError('CLOUD_INVALID_REVISION');
}

export function assertOperationId(value: string): void {
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(value)) cloudError('CLOUD_INVALID_OPERATION');
}

export function validateCloudChanges(changes: Array<{ path: string; content: string | ArrayBuffer | null; directory?: boolean }>): void {
    if (!changes.length || changes.length > MAX_CLOUD_FILES) cloudError('CLOUD_INVALID_CHANGES');
    let total = 0;
    const paths = new Set<string>();
    for (const change of changes) {
        const path = cloudPath(change.path);
        if (paths.has(path)) cloudError('CLOUD_DUPLICATE_PATH');
        paths.add(path);
        if (path === '.weblab' && change.content !== null) cloudError('CLOUD_INVALID_DIRECTORY');
        if (change.directory && change.content !== null) cloudError('CLOUD_INVALID_DIRECTORY');
        if (typeof change.content === 'string') {
            const size = new TextEncoder().encode(change.content).byteLength;
            if (size > MAX_CLOUD_TEXT_BYTES) cloudError('CLOUD_TEXT_TOO_LARGE');
            total += size;
        } else if (change.content instanceof ArrayBuffer) {
            if (!path.startsWith('public/')) cloudError('CLOUD_ASSET_PATH');
            if (change.content.byteLength > MAX_CLOUD_ASSET_BYTES) cloudError('CLOUD_ASSET_TOO_LARGE');
            total += change.content.byteLength;
        }
    }
    if (total > MAX_CLOUD_CHANGE_BYTES || new TextEncoder().encode(JSON.stringify(convexToJson(changes))).byteLength > 4_000_000) cloudError('CLOUD_CHANGE_TOO_LARGE');
}

export function isCloudEditorRuntime(runtime: unknown): boolean {
    if (!runtime || typeof runtime !== 'object') return false;
    const cloud = (runtime as { cloud?: unknown }).cloud;
    return !!cloud && typeof cloud === 'object' && (cloud as { sourceVersion?: unknown }).sourceVersion === CLOUD_EDITOR_VERSION;
}

/** Count encoded text, leaving room for Convex record metadata and return envelopes. */
export function inlineSourceBytes(files: Iterable<{ text?: string }>): number {
    let total = 0;
    for (const file of files) total += 512 + (file.text === undefined ? 0 : new TextEncoder().encode(JSON.stringify(file.text)).byteLength);
    return total;
}
