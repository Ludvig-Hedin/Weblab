import type { Id } from '@convex/_generated/dataModel';

export type ReleaseIntent = Readonly<{
    releaseId: Id<'cloudReleases'>;
    kind: 'build' | 'publish' | 'rollback';
    expectedLiveReleaseId: Id<'cloudReleases'> | null;
    operationKey: string;
}>;

/** Capture the whole request when the user opens confirmation, before reactive live updates. */
export function createReleaseIntent(
    releaseId: Id<'cloudReleases'>,
    kind: ReleaseIntent['kind'],
    expectedLiveReleaseId: Id<'cloudReleases'> | null,
    operationKeyFor: (scope: string) => string,
): ReleaseIntent {
    return Object.freeze({ releaseId, kind, expectedLiveReleaseId,
        operationKey: operationKeyFor(`${kind}/${releaseId}/${expectedLiveReleaseId ?? 'empty'}`) });
}

export function releaseConfirmationChanged(intent: ReleaseIntent, liveReleaseId: Id<'cloudReleases'> | null): boolean {
    return intent.expectedLiveReleaseId !== liveReleaseId;
}

export function releaseResultUncertain(operations: ReadonlyArray<{ stage: string }>): boolean {
    return operations.some(operation => operation.stage === 'unknown');
}
