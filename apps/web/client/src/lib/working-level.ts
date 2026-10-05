export type WorkingLevel = 'content' | 'full';
export interface WorkingLevelPreference { version: 1; level: WorkingLevel }
export interface WorkingLevelStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export function workingLevelKey(userId: string): string {
    if (!userId || userId.length > 256) throw new Error('Invalid preference owner');
    return `weblab:working-level:v1:${encodeURIComponent(userId)}`;
}

export function parseWorkingLevel(raw: string | null): WorkingLevel | null {
    if (!raw || raw.length > 256) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const preference = value as Record<string, unknown>;
        return preference.version === 1 && (preference.level === 'content' || preference.level === 'full')
            ? preference.level : null;
    } catch { return null; }
}

export function readWorkingLevel(storage: WorkingLevelStorage, userId: string): { level: WorkingLevel | null; storageFailed: boolean } {
    try { return { level: parseWorkingLevel(storage.getItem(workingLevelKey(userId))), storageFailed: false }; }
    catch { return { level: null, storageFailed: true }; }
}

export function saveWorkingLevel(storage: WorkingLevelStorage, userId: string, level: WorkingLevel): boolean {
    if (level !== 'content' && level !== 'full') return false;
    try { storage.setItem(workingLevelKey(userId), JSON.stringify({ version: 1, level } satisfies WorkingLevelPreference)); return true; }
    catch { return false; }
}

export interface WorkingLevelEntry { userId: string; siteId: string; level: WorkingLevel }

/** A preference change does not replace a level already captured for this site entry. */
export function captureWorkingLevelEntry(previous: WorkingLevelEntry | null, userId: string, siteId: string, level: WorkingLevel): WorkingLevelEntry {
    return previous?.userId === userId && previous.siteId === siteId ? previous : { userId, siteId, level };
}

export function requiresWorkingLevelTeardown(previous: WorkingLevelEntry | null, next: WorkingLevelEntry | null, userId: string | null): boolean {
    return previous !== null && (previous.userId !== userId
        || (next !== null && (previous.siteId !== next.siteId || previous.level !== next.level)));
}

/** Registered editor work must finish before a retained editor subtree is removed. */
export class WorkingLevelLifecycle {
    private callbacks = new Map<symbol, () => Promise<void>>();
    private prepares = new Map<symbol, () => Promise<void>>();
    private pending: Promise<void> | null = null;
    private failures = new Set<() => void>();
    resumeAllowed = true;

    /** Only the retained engine can attest that its rejected clear never began disposal. */
    allowResumeBeforeDisposal(): void {
        this.resumeAllowed = true;
    }

    prepare(callback: () => Promise<void>): () => void {
        const token = Symbol();
        this.prepares.set(token, callback);
        return () => { this.prepares.delete(token); };
    }

    onFailure(callback: () => void): () => void {
        this.failures.add(callback);
        return () => { this.failures.delete(callback); };
    }

    reportFailure(): void {
        for (const callback of this.failures) callback();
    }

    register(callback: () => Promise<void>): () => void {
        const token = Symbol();
        this.callbacks.set(token, callback);
        return () => { this.callbacks.delete(token); };
    }

    close(): Promise<void> {
        if (this.pending) return this.pending;
        const callbacks = [...this.callbacks.values()];
        const prepares = [...this.prepares.values()];
        const operation = (async () => {
            for (const prepare of prepares) await prepare();
            this.resumeAllowed = false;
            for (const callback of callbacks) await callback();
        })();
        this.pending = operation;
        void operation.then(() => { this.pending = null; }, () => { this.pending = null; });
        return operation;
    }
}
