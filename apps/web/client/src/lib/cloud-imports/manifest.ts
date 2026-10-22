import { BINARY_EXTENSIONS } from '@weblab/constants';
import { MAX_CLOUD_FILES, MAX_CLOUD_TEXT_BYTES } from '@convex/lib/cloudEditor';
import { importSourcePath, validateCloudImportManifest, MAX_IMPORT_BYTES, MAX_IMPORT_ASSET_BYTES, type CloudImportFile } from '@convex/lib/cloudImportManifest';
import { assertReleaseText } from '@convex/lib/cloudReleasePolicy';

export type ImportFileTuple = Pick<CloudImportFile, 'path' | 'kind' | 'bytes' | 'hash'>;
export type ReviewProblem = { path: string; code: string };
export type FolderReview = {
    folderName: string;
    included: Array<{ path: string; bytes: number }>;
    excluded: Array<{ path: string; reason: 'generated' | 'private' }>;
    problems: ReviewProblem[];
    manifest: Awaited<ReturnType<typeof validateCloudImportManifest>> | null;
    binaries: ReadonlyMap<string, File>;
};
const privatePath = /(?:^|\/)(?:\.env[^/]*|\.ssh|\.aws)(?:\/|$)|\.(?:db|sqlite|sqlite3|pem|key)$/i;
const generatedPath = /(?:^|\/)(?:\.git|node_modules|\.next|\.vercel|\.railway|\.codex|\.claude|\.agents|\.DS_Store)(?:\/|$)|^(?:dist|build|out|coverage)(?:\/|$)/i;
// The shared binary list also contains archives and executables. They are never import assets.
const media = new Set([...BINARY_EXTENSIONS.filter(ext => /\.(?:jpe?g|png|gif|bmp|ico|webp|mp3|mp4|wav|avi|mov|wmv|woff2?|ttf|eot|otf)$/.test(ext)), '.webm', '.avif', '.ogg', '.flac']);
const text = /\.(?:[cm]?[jt]sx?|jsonc?|ya?ml|toml|css|scss|sass|less|html?|mdx?|txt|csv|xml|svg|lock|sh|bash|zsh|yml|map)$/i;
const textNames = new Set(['Dockerfile', 'LICENSE', 'Makefile', '.env.example', '.gitignore', '.gitattributes', '.editorconfig', '.prettierignore', '.prettierrc', '.npmrc', '.nvmrc', '.browserslistrc']);
function fail(path: string, code: string): never { throw new ImportReviewError(path, code); }
export class ImportReviewError extends Error {
    constructor(public readonly path: string, public readonly code: string) { super(code); this.name = 'ImportReviewError'; }
}
export function safeImportCode(cause: unknown): string {
    const value = cause && typeof cause === 'object' && 'data' in cause ? cause.data : cause instanceof Error ? cause.message : '';
    return typeof value === 'string' && /^CLOUD_[A-Z_]+$/.test(value) ? value : 'CLOUD_IMPORT_FAILED';
}
function directoryPath(value: string): { root: string; path: string } {
    const parts = value.split('/');
    if (parts.length < 2 || parts.some(part => !part || part === '.' || part === '..') || /[\\\u0000-\u001f\u007f-\u009f]/.test(value)
        || /^[A-Za-z]:/.test(value) || new TextDecoder().decode(new TextEncoder().encode(value)) !== value) fail('', 'CLOUD_IMPORT_DIRECTORY_REQUIRED');
    return { root: parts[0]!, path: parts.slice(1).join('/') };
}
export async function hashImportBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
/** Local review reads one file at a time; a blocked file is reported, never silently removed. */
export async function reviewImportFolder(files: readonly File[], signal: AbortSignal, onFile?: (path: string) => void): Promise<FolderReview> {
    const result: FolderReview = { folderName: '', included: [], excluded: [], problems: [], manifest: null, binaries: new Map() };
    const candidates: Array<{ file: File; path: string; kind: 'text' | 'binary' }> = [];
    const seen = new Set<string>(); let total = 0;
    if (!files.length) fail('', 'CLOUD_IMPORT_DIRECTORY_REQUIRED');
    for (const file of files) {
        signal.throwIfAborted();
        const { root, path } = directoryPath(file.webkitRelativePath);
        if (result.folderName && root !== result.folderName) fail('', 'CLOUD_IMPORT_MIXED_ROOTS');
        result.folderName = root;
        if (seen.has(path)) fail(path, 'CLOUD_IMPORT_PATH_COLLISION');
        seen.add(path);
        if (path !== '.env.example' && privatePath.test(path)) { result.excluded.push({ path, reason: 'private' }); continue; }
        if (generatedPath.test(path)) { result.excluded.push({ path, reason: 'generated' }); continue; }
        result.included.push({ path, bytes: file.size });
        try {
            importSourcePath(path);
            const extension = /\.[^.\/]+$/.exec(path)?.[0]?.toLowerCase() ?? '';
            const kind = media.has(extension) ? 'binary' : text.test(path) || textNames.has(path.split('/').at(-1)!)
                || /^\.githooks\/(?:pre-commit|pre-push|commit-msg|prepare-commit-msg|post-checkout|post-merge)$/.test(path) ? 'text' : null;
            if (!kind) fail(path, 'CLOUD_IMPORT_UNSUPPORTED_FILE');
            if (file.size > (kind === 'binary' ? MAX_IMPORT_ASSET_BYTES : MAX_CLOUD_TEXT_BYTES)) fail(path, kind === 'binary' ? 'CLOUD_IMPORT_ASSET_TOO_LARGE' : 'CLOUD_IMPORT_TEXT_TOO_LARGE');
            candidates.push({ file, path, kind }); total += file.size;
        } catch (cause) { result.problems.push({ path, code: safeImportCode(cause) }); }
    }
    if (result.included.length > MAX_CLOUD_FILES) result.problems.push({ path: '', code: 'CLOUD_IMPORT_FILE_LIMIT' });
    if (total > MAX_IMPORT_BYTES) result.problems.push({ path: '', code: 'CLOUD_IMPORT_TOO_LARGE' });
    for (const path of seen) for (let parent = path.lastIndexOf('/'); parent > 0; parent = path.lastIndexOf('/', parent - 1)) {
        if (seen.has(path.slice(0, parent))) fail(path, 'CLOUD_IMPORT_PATH_COLLISION');
    }
    if (result.problems.length) return result;
    const manifest: CloudImportFile[] = [], binaries = new Map<string, File>();
    for (const { file, path, kind } of candidates) {
        signal.throwIfAborted(); onFile?.(path);
        try {
            const bytes = new Uint8Array(await file.arrayBuffer()); signal.throwIfAborted();
            if (bytes.byteLength !== file.size) fail(path, 'CLOUD_IMPORT_CONTENT_MISMATCH');
            const hash = await hashImportBytes(bytes); signal.throwIfAborted();
            if (kind === 'binary') { binaries.set(path, file); manifest.push({ path, kind, bytes: bytes.byteLength, hash }); continue; }
            let content: string;
            try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
            catch { fail(path, 'CLOUD_IMPORT_INVALID_TEXT'); }
            const encoded = new TextEncoder().encode(content);
            if (encoded.length !== bytes.length || encoded.some((byte, index) => byte !== bytes[index])) fail(path, 'CLOUD_IMPORT_CONTENT_MISMATCH');
            assertReleaseText(path === '.env.example' ? 'env-example.txt' : path, content);
            manifest.push({ path, kind, bytes: bytes.byteLength, hash, text: content });
        } catch (cause) { signal.throwIfAborted(); result.problems.push({ path, code: safeImportCode(cause) }); }
    }
    if (result.problems.length) return result;
    try {
        const packageFile = manifest.find(file => file.path === 'package.json');
        const pkg: unknown = JSON.parse(packageFile?.text ?? '');
        const declaresNext = pkg && typeof pkg === 'object' && ['dependencies', 'devDependencies'].some(key => {
            const deps = (pkg as Record<string, unknown>)[key];
            return deps && typeof deps === 'object' && 'next' in deps && typeof deps.next === 'string' && deps.next.length > 0;
        });
        const hasLayout = manifest.some(file => /^(?:src\/)?app\/layout\.[jt]sx?$/.test(file.path));
        const hasPage = manifest.some(file => /^(?:src\/)?app\/(?:[^/]+\/)*page\.[jt]sx?$/.test(file.path));
        if (!declaresNext || !hasLayout || !hasPage) fail('package.json', 'CLOUD_IMPORT_NEXT_REQUIRED');
    } catch { result.problems.push({ path: 'package.json', code: 'CLOUD_IMPORT_NEXT_REQUIRED' }); return result; }
    try { result.manifest = await validateCloudImportManifest(manifest); signal.throwIfAborted(); }
    catch (cause) { signal.throwIfAborted(); result.problems.push({ path: '', code: safeImportCode(cause) }); }
    result.binaries = binaries;
    result.included.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    return result;
}
