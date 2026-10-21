import { cloudError, MAX_CLOUD_FILES, MAX_CLOUD_TEXT_BYTES } from './cloudEditor';
import { assertReleaseText, releasePath } from './cloudReleasePolicy';

export const IMPORT_SOURCE_PROFILE = 'imported-source-v1';
export const IMPORT_PREPARED_PROFILE = 'imported-next-v1';
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
export const MAX_IMPORT_ASSET_BYTES = 32 * 1024 * 1024;
export const MAX_IMPORT_INLINE_BYTES = 700_000;
export const IMPORT_CHUNK_BYTES = 512 * 1024;

export type CloudImportFile = {
    path: string;
    kind: 'text' | 'binary';
    bytes: number;
    hash: string;
    text?: string;
};

// TextEncoder replaces unpaired surrogates, which would collapse distinct input
// strings into the same bytes. Reject them in both paths and source text.
function validUnicode(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(++index);
            if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
        } else if (code >= 0xdc00 && code <= 0xdfff) return false;
    }
    return true;
}

export function importSourcePath(path: string): string {
    if (typeof path !== 'string' || !validUnicode(path) || /^[A-Za-z]:/.test(path) ||
        /[\u0000-\u001f\u007f-\u009f]/.test(path) ||
        path.split('/').some(part => /^(?:\.railway|\.agents|\.DS_Store)$/i.test(part))) cloudError('CLOUD_IMPORT_UNSAFE_PATH');
    // This is the sole .env exception. Nested examples and differently cased
    // names remain excluded by the existing release path policy.
    if (path !== '.env.example') releasePath(path);
    return path;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function validateCloudImportManifest(files: CloudImportFile[]): Promise<{
    files: CloudImportFile[];
    bytes: number;
    manifestHash: string;
}> {
    if (!Array.isArray(files) || files.length < 1 || files.length > MAX_CLOUD_FILES) cloudError('CLOUD_IMPORT_INVALID_MANIFEST');
    const encoder = new TextEncoder();
    const paths = new Set<string>();
    const canonical: CloudImportFile[] = [];
    let bytes = 0;
    let inlineBytes = 2; // JSON array brackets, plus separators below.
    for (const file of files) {
        if (!file || typeof file !== 'object' || Array.isArray(file) ||
            Object.keys(file).some(key => !['path', 'kind', 'bytes', 'hash', 'text'].includes(key)) ||
            (file.kind !== 'text' && file.kind !== 'binary') || !Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
            typeof file.hash !== 'string' || !/^[a-f0-9]{64}$/.test(file.hash)) cloudError('CLOUD_IMPORT_INVALID_MANIFEST');
        const path = importSourcePath(file.path);
        if (paths.has(path)) cloudError('CLOUD_IMPORT_PATH_COLLISION');
        paths.add(path);
        const copy: CloudImportFile = { path, kind: file.kind, bytes: file.bytes, hash: file.hash };
        if (file.kind === 'text') {
            if (typeof file.text !== 'string' || !validUnicode(file.text)) cloudError('CLOUD_IMPORT_INVALID_TEXT');
            if (file.bytes > MAX_CLOUD_TEXT_BYTES) cloudError('CLOUD_IMPORT_TEXT_TOO_LARGE');
            const textBytes = encoder.encode(file.text);
            if (textBytes.byteLength !== file.bytes) cloudError('CLOUD_IMPORT_CONTENT_MISMATCH');
            assertReleaseText(path === '.env.example' ? 'env-example.txt' : path, file.text);
            copy.text = file.text;
        } else {
            if ('text' in file) cloudError('CLOUD_IMPORT_INVALID_MANIFEST');
            if (file.bytes > MAX_IMPORT_ASSET_BYTES) cloudError('CLOUD_IMPORT_ASSET_TOO_LARGE');
        }
        bytes += file.bytes;
        if (bytes > MAX_IMPORT_BYTES) cloudError('CLOUD_IMPORT_TOO_LARGE');
        inlineBytes += encoder.encode(JSON.stringify(copy)).byteLength + (canonical.length ? 1 : 0);
        if (inlineBytes > MAX_IMPORT_INLINE_BYTES) cloudError('CLOUD_IMPORT_INLINE_TOO_LARGE');
        canonical.push(copy);
    }
    for (const path of paths) {
        const parts = path.split('/');
        for (let length = 1; length < parts.length; length++) {
            if (paths.has(parts.slice(0, length).join('/'))) cloudError('CLOUD_IMPORT_PATH_COLLISION');
        }
    }
    canonical.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    for (const file of canonical) {
        if (file.kind === 'text' && await sha256(encoder.encode(file.text!)) !== file.hash) cloudError('CLOUD_IMPORT_CONTENT_MISMATCH');
    }
    const tuples = canonical.map(file => [file.path, file.kind, file.bytes, file.hash]);
    return { files: canonical, bytes, manifestHash: await sha256(encoder.encode(JSON.stringify(tuples))) };
}

export function isImportedCloudProfile(profile?: string): boolean {
    return profile === IMPORT_SOURCE_PROFILE || profile === IMPORT_PREPARED_PROFILE;
}

export function sourceProfileCapabilities(profile?: string) {
    if (profile === undefined || profile === 'starter-v1') return { sourceWrite: true, contentWrite: true, preview: true, release: true, imported: false };
    if (profile === IMPORT_PREPARED_PROFILE) return { sourceWrite: true, contentWrite: false, preview: true, release: false, imported: true };
    return { sourceWrite: false, contentWrite: false, preview: false, release: false, imported: isImportedCloudProfile(profile) };
}

export function assertExecutableCloudProfile(profile?: string): void {
    if (!sourceProfileCapabilities(profile).preview) cloudError(profile === IMPORT_SOURCE_PROFILE ? 'CLOUD_IMPORT_SOURCE_ONLY' : 'CLOUD_PROFILE_UNSUPPORTED');
}

export function assertContentCloudProfile(profile?: string): void {
    if (!sourceProfileCapabilities(profile).contentWrite) cloudError('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
}

export function assertReleaseCloudProfile(profile?: string): void {
    if (!sourceProfileCapabilities(profile).release) cloudError('CLOUD_RELEASE_PROFILE_UNSUPPORTED');
}
