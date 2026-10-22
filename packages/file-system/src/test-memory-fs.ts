type MemoryEntry = { path: string; isDirectory: boolean; children?: MemoryEntry[] };
const scopes = new Map<string, { files: Map<string, string | Uint8Array>; directories: Set<string> }>();

/** Shared mock identity keeps CodeFileSystem's cached superclass stable across test files. */
export class MemoryFileSystem {
    private files: Map<string, string | Uint8Array>;
    private directories: Set<string>;
    constructor(rootPath: string) {
        let scope = scopes.get(rootPath);
        if (!scope) {
            scope = { files: new Map(), directories: new Set() };
            scopes.set(rootPath, scope);
        }
        this.files = scope.files;
        this.directories = scope.directories;
    }
    protected get initialized() { return true; }
    async initialize() {}
    protected beginClose() {}
    cleanup() {}
    private key(path: string) { return path.replace(/^\/+/, '').replace(/\/+$/, ''); }
    async writeFile(path: string, content: string | Uint8Array) {
        const key = this.key(path);
        this.files.set(key, content instanceof Uint8Array ? content.slice() : content);
        let parent = key.slice(0, key.lastIndexOf('/'));
        while (key.includes('/') && parent) {
            this.directories.add(parent);
            const slash = parent.lastIndexOf('/');
            parent = slash < 0 ? '' : parent.slice(0, slash);
        }
    }
    async readFile(path: string) {
        const content = this.files.get(this.key(path));
        if (content === undefined) throw new Error(`ENOENT ${path}`);
        return content;
    }
    async fileExists(path: string) { return this.files.has(this.key(path)); }
    async deleteFile(path: string) { this.files.delete(this.key(path)); }
    async createDirectory(path: string) { this.directories.add(this.key(path)); }
    async deleteDirectory(path: string) {
        const key = this.key(path);
        for (const name of this.files.keys()) if (name === key || name.startsWith(`${key}/`)) this.files.delete(name);
        for (const name of this.directories) if (name === key || name.startsWith(`${key}/`)) this.directories.delete(name);
    }
    async readDirectory(path: string): Promise<MemoryEntry[]> {
        const prefix = this.key(path);
        const direct = (name: string) => {
            const remainder = prefix ? name.startsWith(`${prefix}/`) ? name.slice(prefix.length + 1) : null : name;
            return remainder !== null && remainder !== '' && !remainder.includes('/');
        };
        const entries: MemoryEntry[] = [];
        for (const name of this.directories) if (direct(name)) entries.push({ path: name, isDirectory: true, children: await this.readDirectory(name) });
        for (const name of this.files.keys()) if (direct(name)) entries.push({ path: name, isDirectory: false });
        return entries;
    }
    async listAll() {
        return [...this.files.keys()].map((path) => ({ path: `/${path}`, type: 'file' }));
    }
}
