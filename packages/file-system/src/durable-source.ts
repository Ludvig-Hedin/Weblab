export type DurableContent = string | Uint8Array;

/** null deletes a path; directory:true with null creates a directory. */
export interface DurableSourceChange {
    path: string;
    content: DurableContent | null;
    directory?: true;
}

export type DurableSourceFile =
    | { path: string; content: DurableContent; directory?: undefined }
    | { path: string; content: null; directory: true };

export type DurableCommitHandler = (changes: DurableSourceChange[]) => Promise<void>;
/** Capture identity/revision now; persist exact proposal bytes only if preparation fails. */
export type DurableRecoveryHandler = (changes: DurableSourceChange[]) => () => Promise<void>;
export type DurableTree = Map<string, DurableSourceFile>;

export class DurableCacheError extends Error {
    readonly committed = true;
    constructor(cause: unknown) {
        super('Source was saved, but the browser cache must be reloaded.', { cause });
        this.name = 'DurableCacheError';
    }
}

export function durablePath(input: string): string {
    const path = input.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!path || /[\\\u0000-\u001f]/.test(path) || path.split('/').some((part) => !part || part === '.' || part === '..')) {
        throw new Error(`Invalid durable source path: ${input}`);
    }
    return path;
}

/** Only generated indexes and recovery data are local. Other .weblab files are source. */
export function isDurableCachePath(path: string): boolean {
    return path === '.weblab/index.json' || path.startsWith('.weblab/index.json/') ||
        path === '.weblab/components.json' || path.startsWith('.weblab/components.json/') ||
        path === '.weblab/cache' || path.startsWith('.weblab/cache/') ||
        path === '.weblab/recovery' || path.startsWith('.weblab/recovery/');
}

export function cloneDurableContent(content: DurableContent | null): DurableContent | null {
    return content instanceof Uint8Array ? content.slice() : content;
}

function cloneEntry(file: DurableSourceFile): DurableSourceFile {
    return file.directory ? { ...file } : { path: file.path, content: cloneDurableContent(file.content)! };
}

export function durableSnapshot(files: DurableSourceFile[]): DurableTree {
    const tree: DurableTree = new Map();
    for (const file of files) {
        const path = durablePath(file.path);
        if (isDurableCachePath(path)) throw new Error(`Snapshot contains local cache: ${path}`);
        if (tree.has(path)) throw new Error(`Duplicate durable source path: ${path}`);
        tree.set(path, cloneEntry({ ...file, path }));
    }
    addParents(tree);
    return tree;
}

function addParents(tree: DurableTree): void {
    if (tree.has('.weblab') && !tree.get('.weblab')?.directory) throw new Error('.weblab must be a directory');
    for (const path of Array.from(tree.keys())) {
        let parent = path.slice(0, path.lastIndexOf('/'));
        while (path.includes('/') && parent) {
            const existing = tree.get(parent);
            if (existing && !existing.directory) throw new Error(`A source file blocks directory: ${parent}`);
            if (!existing) tree.set(parent, { path: parent, content: null, directory: true });
            const slash = parent.lastIndexOf('/');
            parent = slash < 0 ? '' : parent.slice(0, slash);
        }
    }
}

export function applyDurableChanges(current: DurableTree, changes: DurableSourceChange[]): DurableTree {
    const next = new Map(current);
    const seen = new Set<string>();
    for (const change of changes) {
        const path = durablePath(change.path);
        if (seen.has(path)) throw new Error(`Duplicate change: ${path}`);
        if (isDurableCachePath(path)) throw new Error(`Cache cannot be committed: ${path}`);
        seen.add(path);
        if (change.directory) {
            if (change.content !== null) throw new Error('Directories cannot contain file bytes');
            if (next.has(path) && !next.get(path)?.directory) throw new Error(`File exists: ${path}`);
            next.set(path, { path, content: null, directory: true });
        } else if (change.content === null) {
            next.delete(path);
        } else {
            if (next.get(path)?.directory) throw new Error(`Directory exists: ${path}`);
            next.set(path, { path, content: cloneDurableContent(change.content)! });
        }
    }
    addParents(next);
    return next;
}

export function durableDiff(before: DurableTree, after: DurableTree): DurableSourceChange[] {
    const changes: DurableSourceChange[] = [];
    for (const path of before.keys()) {
        if (!after.has(path)) changes.push({ path, content: null });
    }
    for (const [path, file] of after) {
        const prior = before.get(path);
        if (prior === file) continue;
        if (file.directory && prior?.directory) continue;
        if (!file.directory && prior && !prior.directory && sameContent(prior.content, file.content)) continue;
        changes.push(file.directory ? { ...file } : { path, content: cloneDurableContent(file.content) });
    }
    return changes;
}

function sameContent(a: DurableContent, b: DurableContent): boolean {
    if (typeof a === 'string' || typeof b === 'string') return a === b;
    return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

export function durableRemove(tree: DurableTree, input: string, directory: boolean): DurableSourceChange[] {
    const path = durablePath(input);
    const entry = tree.get(path);
    if (!entry) throw new Error(`Source path does not exist: ${path}`);
    if (Boolean(entry.directory) !== directory) throw new Error(`Wrong source path kind: ${path}`);
    return Array.from(tree.keys()).filter((key) => key === path || (directory && key.startsWith(`${path}/`)))
        .map((key) => ({ path: key, content: null }));
}

export function durableTransfer(tree: DurableTree, fromInput: string, toInput: string, directory: boolean, move: boolean): DurableSourceChange[] {
    const from = durablePath(fromInput);
    const to = durablePath(toInput);
    const entry = tree.get(from);
    if (!entry || Boolean(entry.directory) !== directory) throw new Error(`Wrong source path kind: ${from}`);
    if (from === to || to.startsWith(`${from}/`) || from.startsWith(`${to}/`)) throw new Error('Source and destination overlap');
    // Reject overwrites, including directory merges, before any remote/cache write.
    if (tree.has(to)) throw new Error(`Destination already exists: ${to}`);
    const entries = Array.from(tree.values()).filter((file) => file.path === from || (directory && file.path.startsWith(`${from}/`)));
    const changes: DurableSourceChange[] = entries.map((file) => ({
        ...file, path: to + file.path.slice(from.length), content: cloneDurableContent(file.content),
    }));
    if (move) changes.push(...entries.map((file) => ({ path: file.path, content: null })));
    return changes;
}
