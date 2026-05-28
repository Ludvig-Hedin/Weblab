/**
 * Reject a promise if it does not settle within `ms` milliseconds.
 *
 * Used to bound blocking I/O (e.g. server-side Convex/Clerk calls in
 * render-gating layouts) so a hung dependency surfaces as a thrown error the
 * nearest error boundary can catch, rather than blocking the SSR response until
 * an upstream proxy (Cloudflare's ~100s edge timeout) returns a hard 524.
 *
 * The original promise is not cancelled — JS promises are not cancellable — so
 * callers must ensure the wrapped work is safe to abandon. The timeout timer is
 * `unref`'d so it never keeps the Node process alive, and is always cleared once
 * the race settles to avoid a dangling timer.
 */
export class TimeoutError extends Error {
    constructor(ms: number, label?: string) {
        super(`${label ?? 'Operation'} timed out after ${ms}ms`);
        this.name = 'TimeoutError';
    }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(ms, label)), ms);
        timer.unref?.();
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}
