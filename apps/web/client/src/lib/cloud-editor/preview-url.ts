import type { CloudEditorRuntimeStatus } from './api';

const TICKET = '__weblab_preview';
type PreviewStatus = Pick<
    CloudEditorRuntimeStatus,
    'status' | 'enabled' | 'previewUrl' | 'previewToken' | 'expiresAt'
>;

function httpsUrl(value: string): URL | null {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url : null;
    } catch {
        return null;
    }
}

/** Returned capabilities belong only in an in-memory iframe src, never saved frame URLs. */
export function authenticatedPreviewUrl(
    frameUrl: string | null | undefined,
    status: PreviewStatus | null | undefined,
    now = Date.now(),
): string | null {
    if (
        !frameUrl ||
        !status?.enabled ||
        (status.status !== 'ready' && status.status !== 'starting') ||
        !Number.isFinite(now) ||
        !Number.isSafeInteger(status.expiresAt) ||
        status.expiresAt! <= now ||
        !status.previewToken ||
        !/^[a-f0-9]{64}$/.test(status.previewToken) ||
        !status.previewUrl
    )
        return null;
    const frame = httpsUrl(frameUrl);
    const runtime = httpsUrl(status.previewUrl);
    if (!frame || !runtime || frame.origin !== runtime.origin) return null;
    // Remove an accidental stale ticket without ever forwarding two capabilities.
    if (frame.searchParams.has(TICKET)) frame.searchParams.delete(TICKET);
    return `${frame.origin}${frame.pathname}${frame.search}${frame.search ? '&' : '?'}${TICKET}=${status.previewToken}${frame.hash}`;
}

/** Move a saved page path onto a replacement runtime; this does not add a ticket. */
export function previewUrlOnRuntime(
    frameUrl: string,
    runtimeUrl: string | null | undefined,
): string | null {
    if (!runtimeUrl) return null;
    const runtime = httpsUrl(runtimeUrl);
    const frame = frameUrl ? httpsUrl(frameUrl) : runtime ? new URL('/', runtime) : null;
    if (!runtime || !frame) return null;
    if (frame.searchParams.has(TICKET)) frame.searchParams.delete(TICKET);
    return `${runtime.origin}${frame.pathname}${frame.search}${frame.hash}`;
}
