// Poll a sandbox URL via HEAD-fetch until it responds (or the ceiling
// elapses). Used after a dev-server restart so we only reload frames
// once the sandbox can actually serve a response — a hardcoded delay
// either reloads too early (502) or makes the user wait longer than
// needed.
//
// Notes:
// - `mode: 'no-cors'` so cross-origin sandbox URLs don't throw on CORS.
//   We only care that the server responded, not what it returned.
// - The dev server is "ready" once any non-thrown response comes back
//   (opaque or otherwise). 502s thrown by the proxy will throw here
//   too because the proxy itself terminates the request.
// - `onTick` fires once per poll attempt regardless of result so the
//   caller can drive a countdown UI.
const POLL_INTERVAL_MS = 1000;
const DEFAULT_CEILING_MS = 60_000;

export interface WaitForSandboxReadyOptions {
    url: string;
    ceilingMs?: number;
    intervalMs?: number;
    onTick?: (elapsedMs: number) => void;
    signal?: AbortSignal;
}

export interface WaitForSandboxReadyResult {
    ready: boolean;
    elapsedMs: number;
}

export async function waitForSandboxReady({
    url,
    ceilingMs = DEFAULT_CEILING_MS,
    intervalMs = POLL_INTERVAL_MS,
    onTick,
    signal,
}: WaitForSandboxReadyOptions): Promise<WaitForSandboxReadyResult> {
    const startedAt = Date.now();

    while (true) {
        if (signal?.aborted) {
            return { ready: false, elapsedMs: Date.now() - startedAt };
        }

        const elapsed = Date.now() - startedAt;
        onTick?.(elapsed);

        try {
            await fetch(url, { method: 'HEAD', mode: 'no-cors', signal });
            return { ready: true, elapsedMs: Date.now() - startedAt };
        } catch {
            // Either still 502, network error, or aborted. Keep polling
            // until the ceiling — we'll reload anyway as a graceful
            // fallback so a slow sandbox isn't strictly fatal.
        }

        if (Date.now() - startedAt >= ceilingMs) {
            return { ready: false, elapsedMs: Date.now() - startedAt };
        }

        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }
}
