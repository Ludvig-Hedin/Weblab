/**
 * Wraps ZenFS to provide a simpler API with automatic path management and recursive operations.
 *
 * For each instance of FileSystem, it treats the base path as the root of the file system.
 * For example, if you do `new FileSystem('/my-project')`, when you call `readFile('/src/index.ts')`,
 * it will read the file from '/my-project/src/index.ts' under the hood for you.
 */

import path from 'path';

import type ZenFS from '@zenfs/core';
import { getFS } from './config';
import { type FileChangeEvent, type FileEntry, type FileInfo } from './types';

export class FileSystem {
    private fs: typeof ZenFS | null = null;
    private basePath: string;
    private watchers = new Map<string, any[]>();
    private watcherTimeouts = new Map<string, NodeJS.Timeout>();
    private isInitialized = false;

    constructor(rootDir: string) {
        this.basePath = path.resolve('/', rootDir);
    }

    get rootPath(): string {
        return this.basePath;
    }

    protected get initialized(): boolean {
        return this.isInitialized && this.fs !== null;
    }

    /**
     * SECURITY: resolve `inputPath` against `basePath` and refuse anything
     * that escapes the base. Without this, callers can pass values like
     * `../../etc/passwd` and `path.join` will happily walk out of basePath
     * (e.g. `path.join('/proj/main', '../../etc/passwd') === '/etc/passwd'`).
     * Used by every method that touches the underlying ZenFS to enforce
     * containment of the project root.
     */
    private resolveSafe(inputPath: string): string {
        const full = path.resolve(this.basePath, inputPath.replace(/^\/+/, ''));
        if (full === this.basePath || full.startsWith(this.basePath + path.sep)) {
            return full;
        }
        throw new Error(`Path escapes basePath: ${inputPath}`);
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        this.fs = await getFS();

        // Ensure base directory exists
        try {
            await this.fs.promises.mkdir(this.basePath, { recursive: true });
        } catch (error) {
            if ((error as any)?.code !== 'EEXIST') {
                throw error;
            }
        }

        this.isInitialized = true;
    }

    private isTextContent(buffer: Uint8Array): boolean {
        // Check first 512 bytes for binary content
        const checkLength = Math.min(512, buffer.length);

        for (let i = 0; i < checkLength; i++) {
            const byte = buffer[i];

            // Null bytes are a strong indicator of binary content
            if (byte === 0 || byte === undefined) return false;

            // Check for other control characters (except tab, newline, carriage return)
            if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
                return false;
            }

            // Check for high bytes (> 127) without valid UTF-8 sequences
            if (byte > 127) {
                // Simple check: if we see many high bytes, it's likely binary
                // A more robust check would validate UTF-8 sequences
                let highByteCount = 0;
                for (let j = i; j < Math.min(i + 10, checkLength); j++) {
                    const currentByte = buffer[j];
                    if (currentByte !== undefined && currentByte > 127) highByteCount++;
                }
                if (highByteCount > 7) return false;
            }
        }

        return true;
    }

    /**
     * Create a new file with content
     */
    async createFile(inputPath: string, content = ''): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');

        const fullPath = this.resolveSafe(inputPath);

        // Ensure parent directory exists
        const dir = path.dirname(fullPath);
        if (dir) {
            await this.fs.promises.mkdir(dir, { recursive: true });
        }

        // Create the file
        await this.fs.promises.writeFile(fullPath, content);
    }

    /**
     * Check if a file exists
     */
    async fileExists(inputPath: string): Promise<boolean> {
        if (!this.fs) throw new Error('File system not initialized');

        try {
            const fullPath = this.resolveSafe(inputPath);
            await this.fs.promises.stat(fullPath);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Read a file - automatically detects text files and returns string in that case. Otherwise, returns Uint8Array.
     */
    async readFile(inputPath: string): Promise<string | Uint8Array> {
        if (!this.fs) throw new Error('File system not initialized');

        const fullPath = this.resolveSafe(inputPath);

        // Need to read as buffer first and check content to ensure it's not binary before converting to string
        const buffer = await this.fs.promises.readFile(fullPath);
        if (this.isTextContent(buffer)) {
            return buffer.toString('utf8');
        }

        return buffer;
    }

    async writeFile(inputPath: string, content: string | Uint8Array): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');

        const fullPath = this.resolveSafe(inputPath);

        // Ensure parent directory exists
        const dir = path.dirname(fullPath);
        if (dir) {
            await this.fs.promises.mkdir(dir, { recursive: true });
        }

        try {
            await this.fs.promises.writeFile(fullPath, content);
        } catch (err) {
            // ZenFS' IndexedDB-backed StoreFS occasionally throws
            // `Exception: File exists` from `commitNew` even though
            // `writeFile` is supposed to truncate-or-create. Triggered
            // when the in-memory index drifts from the persisted store
            // (typically after a sandbox restart re-runs `pullFromSandbox`
            // and the previous index was never released). Recover by
            // deleting the stale entry and writing fresh — this matches
            // POSIX `O_TRUNC|O_CREAT` semantics that the underlying call
            // is supposed to provide.
            const message = err instanceof Error ? err.message : String(err);
            if (/file exists|EEXIST/i.test(message)) {
                try {
                    await this.fs.promises.unlink(fullPath);
                } catch {
                    // unlink may itself fail if the entry is a directory
                    // or already absent — fall through to the retry and
                    // surface that error if it still doesn't take.
                }
                await this.fs.promises.writeFile(fullPath, content);
                return;
            }
            throw err;
        }
    }

    async writeFiles(files: Array<{ path: string; content: string | Uint8Array }>): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');

        // Write files sequentially to avoid race conditions
        for (const { path, content } of files) {
            try {
                await this.writeFile(path, content);
            } catch (error) {
                console.error(`[FileSystem] Failed to write ${path}:`, error);
            }
        }
    }

    async deleteFile(inputPath: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');

        const fullPath = this.resolveSafe(inputPath);

        // Check if it's a directory to use recursive deletion
        try {
            const stats = await this.fs.promises.stat(fullPath);
            if (stats.isDirectory()) {
                await this.fs.promises.rm(fullPath, { recursive: true });
            } else {
                await this.fs.promises.rm(fullPath);
            }
        } catch (error) {
            // If stat fails, try to delete anyway (let rm handle the error)
            await this.fs.promises.rm(fullPath, { recursive: true });
        }
    }

    async moveFile(from: string, to: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');

        const fromPath = this.resolveSafe(from);
        const toPath = this.resolveSafe(to);

        // Ensure destination directory exists
        const toDir = path.dirname(toPath);
        if (toDir) {
            await this.fs.promises.mkdir(toDir, { recursive: true });
        }

        await this.fs.promises.rename(fromPath, toPath);
    }

    async copyFile(from: string, to: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');

        const content = await this.readFile(from);
        await this.writeFile(to, content);
    }

    async createDirectory(inputPath: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');

        const fullPath = this.resolveSafe(inputPath);
        await this.fs.promises.mkdir(fullPath, { recursive: true });
    }

    async readDirectory(inputPath = '/'): Promise<FileEntry[]> {
        if (!this.fs) throw new Error('File system not initialized');

        const fullPath = this.resolveSafe(inputPath);

        const readDirRecursive = async (dirPath: string): Promise<FileEntry[]> => {
            try {
                const names = await this.fs!.promises.readdir(dirPath);
                const entries: FileEntry[] = [];

                for (const name of names) {
                    const entryPath = path.join(dirPath, name);
                    const stats = await this.fs!.promises.stat(entryPath);

                    const entry: FileEntry = {
                        name,
                        path: path.relative(this.basePath, entryPath), // Remove base path
                        isDirectory: stats.isDirectory(),
                        size: Number(stats.size), // Convert BigInt to number
                        modifiedTime: stats.mtime,
                    };

                    if (entry.isDirectory) {
                        entry.children = await readDirRecursive(entryPath);
                    }

                    entries.push(entry);
                }

                // Sort: directories first, then alphabetically
                entries.sort((a, b) => {
                    if (a.isDirectory !== b.isDirectory) {
                        return a.isDirectory ? -1 : 1;
                    }
                    return a.name.localeCompare(b.name);
                });

                return entries;
            } catch (err) {
                if ((err as any).code === 'ENOENT') {
                    return [];
                }
                throw err;
            }
        };

        return await readDirRecursive(fullPath);
    }

    async deleteDirectory(inputPath: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');

        const fullPath = this.resolveSafe(inputPath);
        console.log('Deleting directory', fullPath);
        await this.fs.promises.rm(fullPath, { recursive: true });
    }

    async moveDirectory(from: string, to: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');

        const fromPath = this.resolveSafe(from);
        const toPath = this.resolveSafe(to);

        // Ensure destination parent exists
        const toDir = path.dirname(toPath);
        if (toDir) {
            await this.fs.promises.mkdir(toDir, { recursive: true });
        }

        await this.fs.promises.rename(fromPath, toPath);
    }

    async copyDirectory(from: string, to: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');

        const fromPath = this.resolveSafe(from);
        const toPath = this.resolveSafe(to);

        const copyRecursive = async (src: string, dest: string): Promise<void> => {
            const stats = await this.fs!.promises.stat(src);

            if (stats.isDirectory()) {
                await this.fs!.promises.mkdir(dest, { recursive: true });
                const entries = await this.fs!.promises.readdir(src);

                for (const entry of entries) {
                    await copyRecursive(path.join(src, entry), path.join(dest, entry));
                }
            } else {
                const content = await this.fs!.promises.readFile(src);
                await this.fs!.promises.writeFile(dest, content);
            }
        };

        await copyRecursive(fromPath, toPath);
    }

    watchFile(inputPath: string, callback: (event: FileChangeEvent) => void) {
        if (!this.fs) throw new Error('File system not initialized');

        const fullPath = this.resolveSafe(inputPath);
        const timeoutKey = `watch-file:${inputPath}`;

        const watcher = this.fs.watch(fullPath, async (eventType, filename) => {
            // Clear any existing timeout
            const existingTimeout = this.watcherTimeouts.get(timeoutKey);
            if (existingTimeout) {
                clearTimeout(existingTimeout);
            }

            // Debounce the callback. This is required since the watcher will fire off way before the file is actually written to, resulting in broken states.
            const timeout = setTimeout(async () => {
                // For rename events, check if the file exists to determine if it's a delete
                if (eventType === 'rename') {
                    try {
                        await this.fs!.promises.stat(fullPath);
                        // File exists, it's either a create or rename
                        // For single file watching, we'll treat it as an update
                        callback({
                            type: 'update',
                            path: inputPath,
                        });
                    } catch (error) {
                        callback({
                            type: 'delete',
                            path: inputPath,
                        });
                    }
                } else {
                    // Change event is an update
                    callback({
                        type: 'update',
                        path: inputPath,
                    });
                }
                this.watcherTimeouts.delete(timeoutKey);
            }, 50);

            this.watcherTimeouts.set(timeoutKey, timeout);
        });

        // Store watcher for cleanup
        const watcherList = this.watchers.get(inputPath) || [];
        watcherList.push(watcher);
        this.watchers.set(inputPath, watcherList);

        // Return cleanup function
        return () => {
            watcher.close();
            const list = this.watchers.get(inputPath) || [];
            const index = list.indexOf(watcher);
            if (index > -1) {
                list.splice(index, 1);
            }

            // Clear any pending timeout
            const timeout = this.watcherTimeouts.get(timeoutKey);
            if (timeout) {
                clearTimeout(timeout);
                this.watcherTimeouts.delete(timeoutKey);
            }
        };
    }

    watchDirectory(inputPath: string, callback: (event: FileChangeEvent) => void) {
        if (!this.fs) throw new Error('File system not initialized');

        const watchers: any[] = [];
        const watchedPaths = new Set<string>();

        const setupWatcher = (dirPath: string) => {
            if (watchedPaths.has(dirPath)) return;
            watchedPaths.add(dirPath);

            const watcher = this.fs!.watch(dirPath, async (eventType, filename) => {
                if (!filename) return;

                const relativePath = path.relative(this.basePath, dirPath);
                const filePath = path.join(relativePath, filename);

                const timeoutKey = `watch-dir:${filePath}`;

                const existingTimeout = this.watcherTimeouts.get(timeoutKey);
                if (existingTimeout) {
                    clearTimeout(existingTimeout);
                }

                const timeout = setTimeout(async () => {
                    const fullPath = this.resolveSafe(filePath);

                    // For rename events, check if the file exists to determine the actual event type
                    if (eventType === 'rename') {
                        try {
                            const stats = await this.fs!.promises.stat(fullPath);

                            // File exists - determine if it's create or update
                            if (watchedPaths.has(fullPath)) {
                                // Path was already being watched, so it's an update
                                callback({
                                    type: 'update',
                                    path: filePath,
                                });
                            } else {
                                // New path, it's a create
                                console.log(`[FileSystem] Detected create for ${filePath}`);
                                callback({
                                    type: 'create',
                                    path: filePath,
                                });

                                // If it's a new directory, start watching it
                                if (stats.isDirectory()) {
                                    await setupWatchersRecursive(fullPath);
                                }
                            }
                        } catch (error) {
                            // File doesn't exist, it was deleted.
                            // fs.watch also fires on the watched directory
                            // itself when IT is deleted, with filename equal to
                            // its own basename — joining that onto relativePath
                            // fabricates a phantom child like "public/public".
                            // Detect the self-event and report the directory's
                            // own path instead.
                            let deletedPath = filePath;
                            if (filename === path.basename(dirPath)) {
                                try {
                                    await this.fs!.promises.stat(dirPath);
                                } catch {
                                    deletedPath = relativePath;
                                    watchedPaths.delete(dirPath);
                                }
                            }

                            if (!deletedPath) {
                                // The watch root itself vanished — nothing
                                // meaningful to report downstream.
                                this.watcherTimeouts.delete(timeoutKey);
                                return;
                            }

                            console.log(`[FileSystem] Detected delete for ${deletedPath}`);
                            callback({
                                type: 'delete',
                                path: deletedPath,
                            });

                            // Remove from watched paths if it was a directory
                            watchedPaths.delete(fullPath);
                        }
                    } else {
                        // Change event is an update
                        callback({
                            type: 'update',
                            path: filePath,
                        });
                    }

                    this.watcherTimeouts.delete(timeoutKey);
                }, 50);

                this.watcherTimeouts.set(timeoutKey, timeout);
            });

            watchers.push(watcher);
        };

        const setupWatchersRecursive = async (dirPath: string): Promise<void> => {
            setupWatcher(dirPath);

            try {
                const entries = await this.fs!.promises.readdir(dirPath);
                for (const entry of entries) {
                    const entryPath = path.join(dirPath, entry);
                    const stats = await this.fs!.promises.stat(entryPath);
                    if (stats.isDirectory()) {
                        await setupWatchersRecursive(entryPath);
                    }
                }
            } catch (err) {
                // Directory might not exist
            }
        };

        const fullPath = this.resolveSafe(inputPath);
        setupWatchersRecursive(fullPath);

        // Return cleanup function
        return () => {
            watchers.forEach((w) => w.close());
        };
    }

    async exists(inputPath: string): Promise<boolean> {
        if (!this.fs) throw new Error('File system not initialized');

        const fullPath = this.resolveSafe(inputPath);
        return await this.fs.promises.exists(fullPath);
    }

    async getInfo(inputPath: string): Promise<FileInfo> {
        if (!this.fs) throw new Error('File system not initialized');

        const fullPath = this.resolveSafe(inputPath);
        const stats = await this.fs.promises.stat(fullPath);
        const name = path.basename(inputPath);

        return {
            path: inputPath,
            name,
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
            size: Number(stats.size),
            createdTime: stats.ctime,
            modifiedTime: stats.mtime,
            accessedTime: stats.atime,
        };
    }

    async listFiles(pattern = '**/*'): Promise<string[]> {
        if (!this.fs) throw new Error('File system not initialized');

        const files: string[] = [];

        const listRecursive = async (dirPath: string): Promise<void> => {
            try {
                const entries = await this.fs!.promises.readdir(dirPath);

                for (const entry of entries) {
                    const entryPath = path.join(dirPath, entry);
                    const stats = await this.fs!.promises.stat(entryPath);

                    if (stats.isFile()) {
                        const relativePath = path.relative(this.basePath, entryPath);
                        files.push(relativePath);
                    } else if (stats.isDirectory()) {
                        await listRecursive(entryPath);
                    }
                }
            } catch (err) {
                // Ignore errors
            }
        };

        await listRecursive(this.basePath);

        // Simple pattern matching (not full glob). `**/` matches zero-or-more
        // leading path segments (incl. none) so `**/*` (the default) matches
        // root files AND deeply-nested files alike. Stash the `**/` and `**`
        // expansions behind placeholders FIRST so the `*` → `[^/]*` pass can't
        // corrupt the `.*` inside them (which would re-limit `**/` to a single
        // segment and drop everything below depth 1).
        if (pattern.includes('*')) {
            const regexStr = pattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*\*\//g, '__GLOBSTAR_SLASH__')
                .replace(/\*\*/g, '__DOUBLESTAR__')
                .replace(/\*/g, '[^/]*')
                .replace(/__GLOBSTAR_SLASH__/g, '(?:.*/)?')
                .replace(/__DOUBLESTAR__/g, '.*');
            const regex = new RegExp('^' + regexStr + '$');
            return files.filter((f) => regex.test(f));
        }

        return files;
    }

    async listAll(): Promise<Array<{ path: string; type: 'file' | 'directory' }>> {
        if (!this.fs) throw new Error('File system not initialized');

        const allPaths: Array<{ path: string; type: 'file' | 'directory' }> = [];

        const listRecursive = async (dirPath: string): Promise<void> => {
            try {
                const entries = await this.fs!.promises.readdir(dirPath);

                for (const entry of entries) {
                    const entryPath = path.join(dirPath, entry);
                    const stats = await this.fs!.promises.stat(entryPath);

                    const relativePath = entryPath.substring(this.basePath.length);

                    if (stats.isDirectory()) {
                        allPaths.push({ path: relativePath, type: 'directory' });
                        await listRecursive(entryPath);
                    } else if (stats.isFile()) {
                        allPaths.push({ path: relativePath, type: 'file' });
                    }
                }
            } catch (err) {
                // Ignore errors
            }
        };

        await listRecursive(this.basePath);
        return allPaths;
    }

    cleanup(): void {
        // Clear all watchers
        for (const watchers of this.watchers.values()) {
            watchers.forEach((w) => w.close());
        }
        this.watchers.clear();

        // Clear all pending timeouts
        for (const timeout of this.watcherTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.watcherTimeouts.clear();
    }
}
