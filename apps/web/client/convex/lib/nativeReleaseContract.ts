import { v, type Infer } from 'convex/values';

export const nativeReleasePins = v.object({
    projectId: v.id('projects'), branchId: v.id('branches'),
    connectionId: v.id('nativeReleaseConnections'), connectionGeneration: v.number(),
    destinationId: v.id('nativeReleaseDestinations'), destinationGeneration: v.number(),
    callerKey: v.string(), kind: v.union(v.literal('publish'), v.literal('rollback')),
    releaseId: v.string(), deploymentId: v.string(),
    sourceHash: v.string(), contentHash: v.string(), assetsHash: v.string(),
    runtimeProfile: v.string(), runtimeVersion: v.string(),
    expectedLiveDeploymentId: v.union(v.string(), v.null()),
    domainsHash: v.string(), settingsHash: v.string(), environmentHash: v.string(),
    credentialVersion: v.number(),
});
export type NativeReleasePins = Infer<typeof nativeReleasePins>;
export const MAX_SETTLE_ATTEMPTS = 12;

export function assertNativeIdentifier(value: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error('NATIVE_INVALID_IDENTIFIER');
}
export function assertNativeGeneration(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('NATIVE_INVALID_GENERATION');
}
export function assertNativeRequest(operationKey: string, pins: NativeReleasePins): void {
    for (const value of [operationKey, pins.projectId, pins.branchId, pins.connectionId, pins.destinationId,
        pins.callerKey, pins.releaseId, pins.deploymentId, pins.runtimeProfile, pins.runtimeVersion]) assertNativeIdentifier(value);
    if (pins.expectedLiveDeploymentId !== null) assertNativeIdentifier(pins.expectedLiveDeploymentId);
    for (const value of [pins.sourceHash, pins.contentHash, pins.assetsHash, pins.domainsHash, pins.settingsHash, pins.environmentHash]) {
        if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('NATIVE_INVALID_HASH');
    }
    for (const value of [pins.connectionGeneration, pins.destinationGeneration, pins.credentialVersion]) assertNativeGeneration(value);
}

/** Explicit ordered fields make retry equality independent of object property order. */
export function nativePinsMatch(stored: NativeReleasePins, requested: NativeReleasePins): boolean {
    return (Object.keys(nativeReleasePins.fields) as Array<keyof NativeReleasePins>)
        .every(key => stored[key] === requested[key]);
}

/** Verified provider identity, never domains, names, local paths or caller IDs. */
export function nativeDestinationKey(providerAccountId: string, providerProjectId: string): string {
    assertNativeIdentifier(providerAccountId);
    assertNativeIdentifier(providerProjectId);
    return JSON.stringify(['vercel', providerAccountId, providerProjectId]);
}
