import { applyBlogOperations, applyBlogStructuralOperation, blogEditableTextKeys, parseBlogOperations, SANITY_BLOG_MAX_BYTES, type BlogOperation } from '../../convex/lib/sanityBlogContract';

function localRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid recovery object');
    return value as Record<string, unknown>;
}
function boundedLocalJson(json: string): unknown {
    if (new TextEncoder().encode(json).byteLength > SANITY_BLOG_MAX_BYTES) throw new Error('Recovery document or log is too large');
    return JSON.parse(json) as unknown;
}
function localTarget(values: unknown, key: string): Record<string, unknown> {
    if (!Array.isArray(values)) throw new Error('Invalid recovery content');
    const items = values.map(localRecord);
    if (items.some((item) => typeof item._key !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(item._key)) ||
        new Set(items.map((item) => item._key)).size !== items.length) throw new Error('Ambiguous recovery keys');
    const target = items.find((item) => item._key === key);
    if (!target) throw new Error('Missing recovery key');
    return target;
}
function localText(value: unknown, limit: number): value is string {
    return typeof value === 'string' && value.length <= limit;
}
function localExact(operation: Record<string, unknown>, keys: string[]): void {
    if (Object.keys(operation).length !== keys.length || keys.some((key) => !Object.hasOwn(operation, key))) throw new Error('Invalid recovery operation');
}

/** Local typing keeps incomplete values, but never bypasses structural or size limits. */
export function previewBlogOperations(json: string, operations: readonly BlogOperation[]): string {
    const doc = localRecord(boundedLocalJson(json));
    boundedLocalJson(JSON.stringify(operations));
    if (!Array.isArray(operations) || operations.length > 1000) throw new Error('Too many recovery operations');
    for (const raw of operations) {
        const operation = localRecord(raw);
        if (operation.kind === 'appendText' || operation.kind === 'blockStyle' || operation.kind === 'decorator') {
            applyBlogStructuralOperation(doc, operation);
        } else if (operation.kind === 'set') {
            localExact(operation, ['kind', 'field', 'value']);
            if (typeof operation.field !== 'string' || !['title', 'slug', 'excerpt', 'publishedAt', 'author'].includes(operation.field) || !localText(operation.value, operation.field === 'excerpt' ? 280 : operation.field === 'author' ? 1000 : operation.field === 'slug' ? 96 : operation.field === 'title' ? 10_000 : SANITY_BLOG_MAX_BYTES)) throw new Error('Invalid recovery field');
            if (operation.field === 'slug') doc.slug = { ...localRecord(doc.slug), current: operation.value };
            else doc[operation.field] = operation.value;
        } else if (operation.kind === 'categories') {
            localExact(operation, ['kind', 'value']);
            if (!Array.isArray(operation.value) || operation.value.length > 100 || !operation.value.every((value) => localText(value, 120))) throw new Error('Invalid recovery categories');
            doc.categories = operation.value;
        } else if (operation.kind === 'span' || operation.kind === 'link') {
            localExact(operation, operation.kind === 'span' ? ['kind', 'blockKey', 'spanKey', 'text'] : ['kind', 'blockKey', 'markKey', 'href']);
            if (typeof operation.blockKey !== 'string' || !blogEditableTextKeys(doc).has(operation.blockKey)) throw new Error('Read-only recovery block');
            const block = localTarget(doc.content, operation.blockKey);
            if (operation.kind === 'span' && typeof operation.spanKey === 'string' && localText(operation.text, 10_000)) localTarget(block.children, operation.spanKey).text = operation.text;
            else if (operation.kind === 'link' && typeof operation.markKey === 'string' && localText(operation.href, 4096)) localTarget(block.markDefs, operation.markKey).href = operation.href;
            else throw new Error('Invalid recovery text');
        } else if (operation.kind === 'imageText') {
            localExact(operation, ['kind', 'blockKey', 'field', 'value']);
            if (typeof operation.blockKey !== 'string' || (operation.field !== 'alt' && operation.field !== 'caption') || !localText(operation.value, 10_000)) throw new Error('Invalid recovery image');
            const block = localTarget(doc.content, operation.blockKey);
            if (block._type !== 'image') throw new Error('Read-only recovery image');
            block[operation.field] = operation.value;
        } else throw new Error('Unsupported recovery operation');
    }
    const result = JSON.stringify(doc);
    boundedLocalJson(result);
    return result;
}

/** A retry intent must be the exact saveable prefix from this saved baseline. */
export function validateBlogRecovery(baselineJson: string, captured: BlogRecoveryCheckpoint): { operations: BlogOperation[]; documentJson: string; saveIntent: BlogRecoveryCheckpoint['saveIntent'] } | null {
    try {
        const operations = boundedLocalJson(captured.operationsJson);
        if (!Array.isArray(operations) || !operations.length) return null;
        const documentJson = previewBlogOperations(baselineJson, operations as BlogOperation[]);
        if (documentJson !== captured.documentJson) return null;
        const intent = captured.saveIntent;
        if (intent !== undefined) {
            if (!intent || typeof intent.operationsJson !== 'string' || typeof intent.documentJson !== 'string') return null;
            parseBlogOperations(intent.operationsJson);
            const sent = JSON.parse(intent.operationsJson) as unknown[];
            if (blogOperationsAfterSave(operations, sent) === null || applyBlogOperations(baselineJson, intent.operationsJson) !== intent.documentJson) return null;
        }
        return { operations: operations as BlogOperation[], documentJson, saveIntent: intent };
    } catch { return null; }
}

/** Durable, writer-separated recovery. A failed write must never accept an edit. */
// Each source/operation contract stays at 256 KiB. Recovery carries the current
// document, an exact saved-document intent and operation logs, all JSON escaped.
export const BLOG_RECOVERY_MAX_BYTES = 2 * 1024 * 1024;
const PREFIX = 'weblab:sanity-blog:recovery:v1:';
const CREATE_PREFIX = 'weblab:sanity-blog:create:v1:';

export interface BlogRecoveryStorage {
    readonly length: number;
    key(index: number): string | null;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
export interface BlogRecoveryScope {
    ownerId: string;
    projectId: string;
    branchId: string;
    connectionId: string;
    connectionRevision: number;
    documentId: string;
    draftId: string;
}
export interface BlogRecoveryCheckpoint extends BlogRecoveryScope {
    version: 1;
    writerId: string;
    token: string;
    draftRevision: number;
    providerRevision: string | null;
    operationsJson: string;
    documentJson: string;
    updatedAt: number;
    saveIntent?: { operationsJson: string; documentJson: string };
}
export type BlogCreateScope = Omit<BlogRecoveryScope, 'documentId' | 'draftId'>;
export interface BlogCreateCheckpoint extends BlogCreateScope {
    version: 1;
    writerId: string;
    token: string;
    operationId: string;
    title: string;
    slug: string;
    publishedAt: string;
    updatedAt: number;
    submitted?: { title: string; slug: string; publishedAt: string };
}
export function blogCreateRecoveryKey(scope: BlogCreateScope, writerId: string): string {
    return CREATE_PREFIX + [scope.ownerId, scope.projectId, scope.branchId, scope.connectionId, String(scope.connectionRevision), writerId].map(encodeURIComponent).join(':');
}
export function sameBlogCreateScope(a: BlogCreateScope, b: BlogCreateScope): boolean {
    return a.ownerId === b.ownerId && a.projectId === b.projectId && a.branchId === b.branchId && a.connectionId === b.connectionId && a.connectionRevision === b.connectionRevision;
}
function parseCreateCheckpoint(raw: string | null): BlogCreateCheckpoint | null {
    if (!raw || new TextEncoder().encode(raw).byteLength > BLOG_RECOVERY_MAX_BYTES) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const value = parsed as BlogCreateCheckpoint;
        if (value.version !== 1 || !Number.isSafeInteger(value.connectionRevision) || value.connectionRevision < 0 || !Number.isFinite(value.updatedAt) ||
            ['ownerId', 'projectId', 'branchId', 'connectionId', 'writerId', 'token', 'operationId'].some((key) => typeof value[key as keyof BlogCreateCheckpoint] !== 'string' || !value[key as keyof BlogCreateCheckpoint]) ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.operationId) ||
            typeof value.title !== 'string' || typeof value.slug !== 'string' || typeof value.publishedAt !== 'string') return null;
        if (value.submitted && (typeof value.submitted.title !== 'string' || typeof value.submitted.slug !== 'string' || typeof value.submitted.publishedAt !== 'string')) return null;
        return value;
    } catch { return null; }
}
export function writeBlogCreateRecovery(storage: BlogRecoveryStorage, next: BlogCreateCheckpoint, expectedToken: string | null): boolean {
    try {
        const key = blogCreateRecoveryKey(next, next.writerId);
        const current = storage.getItem(key);
        if (current === null ? expectedToken !== null : parseCreateCheckpoint(current)?.token !== expectedToken) return false;
        const encoded = JSON.stringify(next);
        if (!parseCreateCheckpoint(encoded)) return false;
        if (current === encoded) return true;
        storage.setItem(key, encoded);
        return storage.getItem(key) === encoded;
    } catch { return false; }
}
export function listBlogCreateRecovery(storage: BlogRecoveryStorage, scope: BlogCreateScope): BlogCreateCheckpoint[] {
    const results: BlogCreateCheckpoint[] = [];
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (!key?.startsWith(CREATE_PREFIX)) continue;
        const value = parseCreateCheckpoint(storage.getItem(key));
        if (value && sameBlogCreateScope(value, scope) && key === blogCreateRecoveryKey(value, value.writerId)) results.push(value);
    }
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
}
export function removeBlogCreateRecovery(storage: BlogRecoveryStorage, captured: BlogCreateCheckpoint): boolean {
    try {
        const key = blogCreateRecoveryKey(captured, captured.writerId);
        const current = parseCreateCheckpoint(storage.getItem(key));
        if (!current || current.token !== captured.token || !sameBlogCreateScope(current, captured)) return false;
        storage.removeItem(key);
        return storage.getItem(key) === null;
    } catch { return false; }
}

export function blogRecoveryKey(scope: BlogRecoveryScope, writerId: string): string {
    return PREFIX + [scope.ownerId, scope.projectId, scope.branchId, scope.connectionId,
        String(scope.connectionRevision), scope.documentId, scope.draftId, writerId].map(encodeURIComponent).join(':');
}

export function sameBlogRecoveryScope(a: BlogRecoveryScope, b: BlogRecoveryScope): boolean {
    return a.ownerId === b.ownerId && a.projectId === b.projectId && a.branchId === b.branchId &&
        a.connectionId === b.connectionId && a.connectionRevision === b.connectionRevision &&
        a.documentId === b.documentId && a.draftId === b.draftId;
}

function parseCheckpoint(raw: string | null): BlogRecoveryCheckpoint | null {
    if (!raw || new TextEncoder().encode(raw).byteLength > BLOG_RECOVERY_MAX_BYTES) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const checkpoint = value as BlogRecoveryCheckpoint;
        const strings = ['ownerId', 'projectId', 'branchId', 'connectionId', 'documentId', 'draftId', 'writerId', 'token', 'operationsJson', 'documentJson'] as const;
        if (checkpoint.version !== 1 || strings.some((key) => typeof checkpoint[key] !== 'string' || !checkpoint[key]) ||
            !Number.isSafeInteger(checkpoint.connectionRevision) || !Number.isSafeInteger(checkpoint.draftRevision) ||
            checkpoint.connectionRevision < 0 || checkpoint.draftRevision < 0 || !Number.isFinite(checkpoint.updatedAt) ||
            (checkpoint.providerRevision !== null && typeof checkpoint.providerRevision !== 'string') ||
            !Array.isArray(JSON.parse(checkpoint.operationsJson))) return null;
        if (checkpoint.saveIntent !== undefined && (!checkpoint.saveIntent || typeof checkpoint.saveIntent.operationsJson !== 'string' || typeof checkpoint.saveIntent.documentJson !== 'string' ||
            !Array.isArray(JSON.parse(checkpoint.saveIntent.operationsJson)))) return null;
        return checkpoint;
    } catch { return null; }
}

/** Compare the exact writer token before replacing it, and verify durable readback. */
export function writeBlogRecovery(storage: BlogRecoveryStorage, next: BlogRecoveryCheckpoint, expectedToken: string | null): boolean {
    try {
        const key = blogRecoveryKey(next, next.writerId);
        const current = storage.getItem(key);
        if (current !== null && parseCheckpoint(current)?.token !== expectedToken) return false;
        if (current === null && expectedToken !== null) return false;
        const encoded = JSON.stringify(next);
        if (!parseCheckpoint(encoded) || new TextEncoder().encode(encoded).byteLength > BLOG_RECOVERY_MAX_BYTES) return false;
        if (current === encoded) return true;
        storage.setItem(key, encoded);
        return storage.getItem(key) === encoded;
    } catch { return false; }
}

/** This helper makes the ordering contract explicit: persist before accepting state. */
export function acceptBlogRecoveryEdit(storage: BlogRecoveryStorage, next: BlogRecoveryCheckpoint, prior: BlogRecoveryCheckpoint | null): BlogRecoveryCheckpoint | null {
    if (prior && (!sameBlogRecoveryScope(prior, next) || prior.writerId !== next.writerId)) return null;
    return writeBlogRecovery(storage, next, prior?.token ?? null) ? next : null;
}

/** A delayed receipt can delete only its own captured checkpoint, never newer typing. */
export function removeBlogRecovery(storage: BlogRecoveryStorage, captured: BlogRecoveryCheckpoint): boolean {
    try {
        const key = blogRecoveryKey(captured, captured.writerId);
        const current = parseCheckpoint(storage.getItem(key));
        if (!current || current.token !== captured.token || !sameBlogRecoveryScope(current, captured)) return false;
        storage.removeItem(key);
        return storage.getItem(key) === null;
    } catch { return false; }
}

/** Restore is offered only for the exact account, connection and server baseline. */
export function listBlogRecovery(storage: BlogRecoveryStorage, scope: BlogRecoveryScope, draftRevision: number, providerRevision: string | null, baselineJson?: string): BlogRecoveryCheckpoint[] {
    const results: BlogRecoveryCheckpoint[] = [];
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (!key?.startsWith(PREFIX)) continue;
        const checkpoint = parseCheckpoint(storage.getItem(key));
        if (!checkpoint || !sameBlogRecoveryScope(checkpoint, scope) || checkpoint.providerRevision !== providerRevision ||
            key !== blogRecoveryKey(checkpoint, checkpoint.writerId)) continue;
        const saveIntent = checkpoint.saveIntent;
        if (checkpoint.draftRevision === draftRevision) {
            if (baselineJson === undefined || validateBlogRecovery(baselineJson, checkpoint)) results.push(checkpoint);
        }
        else if (checkpoint.draftRevision + 1 === draftRevision && saveIntent && saveIntent.documentJson === baselineJson) {
            // A save may finish before a crash or blocked-storage receipt. Rebase
            // only against its exact saved document, never an arbitrary new version.
            const remaining = blogOperationsAfterSave<unknown>(JSON.parse(checkpoint.operationsJson), JSON.parse(saveIntent.operationsJson));
            if (remaining?.length) {
                try {
                    parseBlogOperations(saveIntent.operationsJson);
                    if (previewBlogOperations(baselineJson!, remaining as BlogOperation[]) === checkpoint.documentJson) results.push({ ...checkpoint, draftRevision, operationsJson: JSON.stringify(remaining), saveIntent: undefined });
                } catch { /* Invalid recovery stays stored and is never accepted. */ }
            }
        }
    }
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Saved prefix extraction refuses a receipt that does not match the captured edit log. */
export function blogOperationsAfterSave<T>(current: readonly T[], captured: readonly T[]): T[] | null {
    if (current.length < captured.length || captured.some((operation, index) => JSON.stringify(operation) !== JSON.stringify(current[index]))) return null;
    return current.slice(captured.length);
}

/** Keep typing bounded, while a submitted save prefix stays immutable. */
export function appendBlogOperation(current: readonly BlogOperation[], operation: BlogOperation, frozenPrefix = 0): BlogOperation[] {
    const identity = (value: BlogOperation): string | null => {
        switch (value.kind) {
            case 'appendText':
            case 'decorator': return null;
            case 'blockStyle': return `style:${value.blockKey}`;
            case 'set': return `set:${value.field}`;
            case 'categories': return 'categories';
            case 'span': return `span:${value.blockKey}:${value.spanKey}`;
            case 'link': return `link:${value.blockKey}:${value.markKey}`;
            case 'imageText': return `image:${value.blockKey}:${value.field}`;
        }
    };
    const target = identity(operation);
    if (target === null) return [...current, operation];
    const found = current.findIndex((value, index) => index >= frozenPrefix && identity(value) === target);
    return found === -1 ? [...current, operation] : current.map((value, index) => index === found ? operation : value);
}
