/**
 * The CodeSandbox provider surfaces "shell isn't ready yet" errors with a
 * few different shapes depending on whether the container, the pitcher
 * exec helper, or the shell itself is the culprit. These are transient —
 * they clear once the sandbox has finished cold-booting (typically
 * 10–15 s on free-tier VMs) — and shouldn't be surfaced to the user as
 * real failures.
 *
 * Match a small set of stable substrings so callers can wait the race
 * out (with retry/backoff) and silence the corresponding console noise.
 *
 * Deliberately does NOT include "exit status 1" alone, which is also
 * returned by perfectly-legitimate command failures (e.g. `git config
 * <missing key>` exits 1) and would cause callers to retry indefinitely.
 */
export function isShellStartupError(error: string | null | undefined): boolean {
    if (!error) return false;
    const lower = error.toLowerCase();
    return (
        lower.includes('shell with id') || // "Shell with id ... does not exist"
        lower.includes('failed to exec in podman container') ||
        lower.includes('container is not ready')
    );
}
