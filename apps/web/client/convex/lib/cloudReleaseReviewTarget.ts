export type ReleaseReviewTarget = {
    deploymentUrl: string;
    deploymentId: string;
    hash: string;
    destinationId: string;
    generation: number;
    credentialId: string;
    credentialVersion: number;
    credentialHash: string;
    providerProof: string;
    teamId: string;
    providerProjectId: string;
    hostname: string;
    hostingProfile?: 'imported-next-hosting-v1';
    deployHash?: string;
    buildPolicyHash?: string;
};

const strings = ['deploymentUrl', 'deploymentId', 'hash', 'destinationId', 'credentialId',
    'credentialHash', 'providerProof', 'teamId', 'providerProjectId', 'hostname'] as const;

/** Missing pins also refuse mixed old/new server rollouts. */
export function sameReleaseReviewTarget(left: ReleaseReviewTarget, right: ReleaseReviewTarget): boolean {
    const imported = left.hostingProfile !== undefined || left.deployHash !== undefined || left.buildPolicyHash !== undefined ||
        right.hostingProfile !== undefined || right.deployHash !== undefined || right.buildPolicyHash !== undefined;
    const hash = (value: unknown) => typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);
    return (!imported || (left.hostingProfile === 'imported-next-hosting-v1' && right.hostingProfile === left.hostingProfile &&
        hash(left.deployHash) && left.deployHash === right.deployHash && hash(left.buildPolicyHash) && left.buildPolicyHash === right.buildPolicyHash)) &&
        strings.every(key => typeof left[key] === 'string' && left[key].length > 0 && left[key] === right[key]) &&
        Number.isSafeInteger(left.generation) && left.generation > 0 && left.generation === right.generation &&
        Number.isSafeInteger(left.credentialVersion) && left.credentialVersion > 0 && left.credentialVersion === right.credentialVersion;
}
