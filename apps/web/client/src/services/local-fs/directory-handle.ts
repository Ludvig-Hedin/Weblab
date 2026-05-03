/**
 * Wrappers around the File System Access API for picking a folder, walking it,
 * and writing files back to it. Used by the local-folder import/export flows.
 *
 * The API (`showDirectoryPicker`, `FileSystemDirectoryHandle`) is Chromium-only.
 * Callers must gate UI on `isFsAccessSupported()` before invoking anything else.
 */

import { IGNORED_UPLOAD_DIRECTORIES, IGNORED_UPLOAD_FILES } from '@weblab/constants';

export interface PickDirectoryOptions {
    mode?: 'read' | 'readwrite';
}

export interface WalkOptions {
    /** Directory names to skip entirely (e.g. node_modules). Matched by basename. */
    excludeDirs?: ReadonlyArray<string>;
    /** File names to skip (e.g. .DS_Store). Matched by basename. */
    excludeFiles?: ReadonlyArray<string>;
    /** Hard cap on number of files to yield. Walk stops early when reached. */
    maxFiles?: number;
    /** Hard cap on total bytes accumulated. Walk stops early when reached. */
    maxBytes?: number;
}

export interface WalkedFile {
    /** Forward-slash relative path from the picked root. No leading slash. */
    path: string;
    content: Uint8Array;
}

export interface WalkResult {
    /** True when a maxFiles / maxBytes cap was hit and the walk stopped early. */
    truncated: boolean;
    /** Total file count yielded. */
    fileCount: number;
    /** Total bytes yielded. */
    byteCount: number;
}

export const DEFAULT_MAX_IMPORT_FILES = 5_000;
export const DEFAULT_MAX_IMPORT_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Feature detect the File System Access API. Returns true on Chromium-based
 * browsers (Chrome, Edge, Arc, Brave, Opera).
 */
export function isFsAccessSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Show the system folder picker. Returns null if the user cancels or the API
 * is unavailable.
 */
export async function pickDirectory(
    options: PickDirectoryOptions = {},
): Promise<FileSystemDirectoryHandle | null> {
    if (!isFsAccessSupported()) {
        return null;
    }

    try {
        // The cast is needed because TypeScript's lib.dom doesn't yet include
        // showDirectoryPicker on all targets.
        const handle = await (
            window as unknown as {
                showDirectoryPicker: (opts?: {
                    mode?: 'read' | 'readwrite';
                }) => Promise<FileSystemDirectoryHandle>;
            }
        ).showDirectoryPicker({ mode: options.mode ?? 'read' });
        return handle;
    } catch (error) {
        // AbortError: user dismissed the picker. Treat as cancellation.
        if (error instanceof DOMException && error.name === 'AbortError') {
            return null;
        }
        throw error;
    }
}

function shouldSkipDir(name: string, excludeDirs: ReadonlyArray<string>): boolean {
    if (excludeDirs.includes(name)) return true;
    // Hidden directories (.git, .next, .turbo, etc.) are always skipped.
    // If a caller needs to walk dot-prefixed dirs they would need to opt in
    // here explicitly — currently no caller does.
    if (name.startsWith('.')) return true;
    return false;
}

function shouldSkipFile(name: string, excludeFiles: ReadonlyArray<string>): boolean {
    if (excludeFiles.includes(name)) return true;
    return false;
}

/**
 * Recursively walk a directory handle. Yields one file at a time so the
 * caller can stream-upload without loading the whole tree into memory.
 *
 * Stops early if `maxFiles` or `maxBytes` is hit; the returned promise
 * resolves with `truncated: true` in that case.
 */
export async function* walkFiles(
    rootHandle: FileSystemDirectoryHandle,
    options: WalkOptions = {},
): AsyncGenerator<WalkedFile, WalkResult, void> {
    const excludeDirs = options.excludeDirs ?? IGNORED_UPLOAD_DIRECTORIES;
    const excludeFiles = options.excludeFiles ?? IGNORED_UPLOAD_FILES;
    const maxFiles = options.maxFiles ?? DEFAULT_MAX_IMPORT_FILES;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_IMPORT_BYTES;

    let fileCount = 0;
    let byteCount = 0;
    let truncated = false;

    type StackEntry = { handle: FileSystemDirectoryHandle; prefix: string };
    const stack: StackEntry[] = [{ handle: rootHandle, prefix: '' }];

    while (stack.length > 0) {
        const { handle, prefix } = stack.pop()!;

        // The async iterator on FileSystemDirectoryHandle.values() yields each child.
        // Cast is needed because lib.dom currently types this loosely.
        for await (const entry of (
            handle as unknown as {
                values: () => AsyncIterable<FileSystemHandle>;
            }
        ).values()) {
            const childPath = prefix ? `${prefix}/${entry.name}` : entry.name;

            if (entry.kind === 'directory') {
                if (shouldSkipDir(entry.name, excludeDirs)) continue;
                stack.push({
                    handle: entry as FileSystemDirectoryHandle,
                    prefix: childPath,
                });
                continue;
            }

            if (entry.kind === 'file') {
                if (shouldSkipFile(entry.name, excludeFiles)) continue;

                const fileHandle = entry as FileSystemFileHandle;
                const file = await fileHandle.getFile();

                if (fileCount + 1 > maxFiles || byteCount + file.size > maxBytes) {
                    truncated = true;
                    return { truncated, fileCount, byteCount };
                }

                const buffer = new Uint8Array(await file.arrayBuffer());
                fileCount += 1;
                byteCount += buffer.byteLength;
                yield { path: childPath, content: buffer };
            }
        }
    }

    return { truncated, fileCount, byteCount };
}

/**
 * Write a file to a directory handle, creating intermediate directories as
 * needed. `path` uses forward slashes and is relative to `rootHandle`.
 */
export async function writeFileToHandle(
    rootHandle: FileSystemDirectoryHandle,
    path: string,
    content: Uint8Array | string,
): Promise<void> {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) {
        throw new Error(`Cannot write to empty path`);
    }

    const fileName = segments[segments.length - 1]!;
    const dirSegments = segments.slice(0, -1);

    let dirHandle = rootHandle;
    for (const segment of dirSegments) {
        dirHandle = await dirHandle.getDirectoryHandle(segment, { create: true });
    }

    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await (
        fileHandle as unknown as {
            createWritable: () => Promise<FileSystemWritableFileStream>;
        }
    ).createWritable();

    try {
        // Recent lib.dom narrowed Blob/FileSystemWritableFileStream args to
        // exclude `Uint8Array<SharedArrayBuffer>`. Cast through `unknown` —
        // at runtime browsers accept both string and Uint8Array unchanged.
        await writable.write(content as unknown as FileSystemWriteChunkType);
    } finally {
        await writable.close();
    }
}

/**
 * Returns true if the directory handle has no entries at all (no exclusion
 * filtering is applied). Used by the export flow to warn before merging into
 * a non-empty folder.
 */
export async function isDirectoryEmpty(handle: FileSystemDirectoryHandle): Promise<boolean> {
    for await (const _entry of (
        handle as unknown as {
            values: () => AsyncIterable<FileSystemHandle>;
        }
    ).values()) {
        return false;
    }
    return true;
}
