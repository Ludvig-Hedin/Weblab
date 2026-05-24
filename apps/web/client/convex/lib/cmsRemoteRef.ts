// Remote-ref encoding for CMS collections backed by external sources.
// Ported verbatim from apps/web/client/src/server/api/routers/cms/sync.ts
// — the prefix is persisted in the DB, do not change without a migration.

const REMOTE_REF_PREFIX = 'remote:';

export function readRemoteRef(description: string | null | undefined): string | null {
    if (!description) return null;
    const lines = description.split('\n');
    for (const line of lines) {
        if (line.startsWith(REMOTE_REF_PREFIX)) {
            return line.slice(REMOTE_REF_PREFIX.length).trim();
        }
    }
    return null;
}

export function encodeRemoteRef(remoteRef: string, userDescription?: string): string {
    const head = `${REMOTE_REF_PREFIX}${remoteRef}`;
    return userDescription ? `${head}\n${userDescription}` : head;
}

export function stripRemoteRef(description: string | null | undefined): string {
    if (!description) return '';
    return description
        .split('\n')
        .filter((line) => !line.startsWith(REMOTE_REF_PREFIX))
        .join('\n');
}
