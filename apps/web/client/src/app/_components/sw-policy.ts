type WorkerInfo = { scriptURL: string } | null;
type RegistrationInfo = {
    scope: string;
    active: WorkerInfo;
    waiting: WorkerInfo;
    installing: WorkerInfo;
    unregister(): Promise<boolean>;
};

export function serviceWorkerMode(setting: string | undefined, production: boolean) {
    if (setting === 'false') return 'opt-out';
    return setting === 'true' || production ? 'enabled' : 'inactive';
}

function ownsWorker(worker: WorkerInfo, origin: string) {
    return worker?.scriptURL === new URL('/sw.js', origin).href;
}

export function ownsRegistration(registration: RegistrationInfo, origin: string) {
    const workers = [registration.active, registration.waiting, registration.installing]
        .filter((worker): worker is NonNullable<WorkerInfo> => worker !== null);
    return registration.scope === new URL('/', origin).href
        && workers.length > 0
        && workers.every(worker => ownsWorker(worker, origin));
}

export function ownsOfflineCache(name: string) {
    return /^weblab-(shell|runtime|next-data)-v\d+$/.test(name);
}

/** Explicit opt-out on an isolated cloud origin only. Never touches draft/recovery storage.
 * Unregistering does not detach an open page's controller. Save work and close all
 * tabs on this origin before reopening; a controlled tab can still refill caches.
 * Cleanup runs on every opted-out page load, including the first uncontrolled load.
 */
export async function removeOptedOutServiceWorker(
    origin: string,
    workers: { controller: WorkerInfo; getRegistrations(): Promise<readonly RegistrationInfo[]> },
    storage: Pick<CacheStorage, 'keys' | 'delete'> | undefined,
) {
    let failures = 0;
    try {
        const registrations = await workers.getRegistrations();
        const results = await Promise.allSettled(registrations
            .filter(registration => ownsRegistration(registration, origin))
            .map(registration => registration.unregister()));
        failures += results.filter(result => result.status === 'rejected').length;
    } catch {
        failures++;
    }
    if (storage) {
        try {
            const names = await storage.keys();
            const results = await Promise.allSettled(names.filter(ownsOfflineCache)
                .map(name => storage.delete(name)));
            failures += results.filter(result => result.status === 'rejected').length;
        } catch {
            failures++;
        }
    }
    return { requiresReload: ownsWorker(workers.controller, origin), failures };
}
