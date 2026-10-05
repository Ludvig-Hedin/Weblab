import ZenFS, { configure, InMemory, mounts } from '@zenfs/core';
import { IndexedDB } from '@zenfs/dom';

let configPromise: Promise<void> | null = null;

export async function getFS(): Promise<typeof ZenFS> {
    // Use a single promise to ensure configuration only happens once
    configPromise ??= configure({
        mounts: {
            '/': {
                backend: IndexedDB,
                storeName: 'browser-fs',
            },
        },
    }).catch((err) => {
        // Reset on error so it can be retried
        configPromise = null;
        throw err;
    });

    await configPromise;
    return ZenFS;
}

/** Disposable cloud cache. Never touches the persistent browser-fs parent tree. */
export async function createMemoryFS() {
    const rootPath = `/__weblab_cloud_cache_${crypto.randomUUID()}`;
    const backend = InMemory.create({});
    await backend.ready();
    ZenFS.mount(rootPath, backend);
    return {
        fs: ZenFS,
        rootPath,
        dispose() {
            if (mounts.get(rootPath) === backend) ZenFS.umount(rootPath);
        },
    };
}
