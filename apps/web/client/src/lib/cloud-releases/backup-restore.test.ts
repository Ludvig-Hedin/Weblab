import { describe, expect, it } from 'bun:test';
import { ConvexError } from 'convex/values';
import type { Id } from '@convex/_generated/dataModel';
import { restoreBackupCopy } from './backup-restore';

const scope = { workspaceId: 'workspaces:one' as Id<'workspaces'>, actorId: 'users:one' as Id<'users'>, backupId: 'cloudReleases:one' as Id<'cloudReleases'> };
class MemoryStorage {
    values = new Map<string, string>();
    refuseWrite = false; refuseRemove = false;
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { if (this.refuseWrite) throw new Error('quota'); this.values.set(key, value); }
    removeItem(key: string) { if (this.refuseRemove) throw new Error('unavailable'); this.values.delete(key); }
}

describe('backup restore retry identity', () => {
    it('reuses unknown requests across entry points and clears confirmed requests for the next intentional restore', async () => {
        const storage = new MemoryStorage(), keys: string[] = [], names: string[] = [];
        await expect(restoreBackupCopy(storage, scope, 'Original name', async request => {
            keys.push(request.operationKey); throw new Error('response lost');
        })).rejects.toThrow('response lost');
        expect(storage.values.size).toBe(1);
        await restoreBackupCopy(storage, scope, 'Changed locale name', async request => {
            keys.push(request.operationKey); names.push(request.name); return 'restored';
        });
        expect(storage.values.size).toBe(0);
        await restoreBackupCopy(storage, scope, 'New copy', async request => { keys.push(request.operationKey); return 'new'; });
        expect(keys[0]).toBe(keys[1]);
        expect(keys[2]).not.toBe(keys[0]);
        expect(names).toEqual(['Original name']);
    });
    it('clears a terminal deleted target but retains other typed refusals', async () => {
        const storage = new MemoryStorage();
        await expect(restoreBackupCopy(storage, scope, 'Site', async () => { throw new ConvexError('CLOUD_BACKUP_RESTORE_REMOVED'); })).rejects.toThrow('CLOUD_BACKUP_RESTORE_REMOVED');
        expect(storage.values.size).toBe(0);
        await expect(restoreBackupCopy(storage, scope, 'Site', async () => { throw new ConvexError('FORBIDDEN'); })).rejects.toThrow('FORBIDDEN');
        expect(storage.values.size).toBe(1);
    });
    it('does not send without persistence and does not turn acknowledged success into failure when cleanup fails', async () => {
        const storage = new MemoryStorage(); let sent = 0;
        storage.refuseWrite = true;
        await expect(restoreBackupCopy(storage, scope, 'Site', async () => { sent++; return 'saved'; })).rejects.toThrow('RESTORE_STORAGE_FAILED');
        expect(sent).toBe(0);
        storage.refuseWrite = false; storage.refuseRemove = true;
        expect(await restoreBackupCopy(storage, scope, 'Site', async () => 'saved')).toBe('saved');
        expect(storage.values.size).toBe(1);
    });
    it('isolates actor requests and leaves an exact-key replacement untouched', async () => {
        const storage = new MemoryStorage();
        await expect(restoreBackupCopy(storage, scope, 'First', async () => { throw new Error('unknown'); })).rejects.toThrow('unknown');
        const [key, original] = [...storage.values.entries()][0]!;
        await restoreBackupCopy(storage, { ...scope, actorId: 'users:other' as Id<'users'> }, 'Other', async () => 'saved');
        expect(storage.getItem(key)).toBe(original);
        const replacement = JSON.stringify({ operationKey: 'replacement_request_001', name: 'Another request' });
        await restoreBackupCopy(storage, scope, 'First', async () => { storage.setItem(key, replacement); return 'saved'; });
        expect(storage.getItem(key)).toBe(replacement);
    });
});
