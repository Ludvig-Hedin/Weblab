import { ConvexError } from 'convex/values';
import type { Id } from '@convex/_generated/dataModel';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Scope = { workspaceId: Id<'workspaces'>; actorId: Id<'users'>; backupId: Id<'cloudReleases'> };
type Request = { operationKey: string; name: string };

/** Both restore entry points keep the exact request until a confirmed or terminal response. */
export async function restoreBackupCopy<T>(storage: Storage, scope: Scope, name: string,
    restore: (request: Request & { backupId: Id<'cloudReleases'> }) => Promise<T>): Promise<T> {
    const key = `weblab.cloud-backup-restore.v1:${scope.workspaceId}/${scope.actorId}/${scope.backupId}`;
    let raw: string, request: Request;
    try {
        const saved = storage.getItem(key);
        if (saved) {
            const value: unknown = JSON.parse(saved);
            if (!value || typeof value !== 'object' || !('operationKey' in value) || !('name' in value)
                || typeof value.operationKey !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(value.operationKey)
                || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) throw new Error('Invalid restore request');
            request = { operationKey: value.operationKey, name: value.name }; raw = saved;
        } else {
            request = { operationKey: crypto.randomUUID(), name };
            raw = JSON.stringify(request); storage.setItem(key, raw);
        }
    } catch { throw new Error('RESTORE_STORAGE_FAILED'); }
    const clear = () => {
        // sessionStorage is tab-scoped. Preserve a replacement request in this tab.
        try { if (storage.getItem(key) === raw) storage.removeItem(key); }
        catch { /* Cleanup cannot turn a confirmed restore into an unknown result. */ }
    };
    try {
        const result = await restore({ backupId: scope.backupId, ...request });
        clear(); return result;
    } catch (cause) {
        if (cause instanceof ConvexError && cause.data === 'CLOUD_BACKUP_RESTORE_REMOVED') clear();
        throw cause;
    }
}
