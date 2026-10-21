type ChunkRecoveryWindow = Window & {
    __weblabChunkRecoveryDisabled?: boolean;
    __weblabInitialChunkRecovery?: { disarm: () => void };
};

/** Self-contained: its emitted source runs before any Next/React code loads. */
function installInitialChunkRecovery() {
    const host = window as ChunkRecoveryWindow;
    if (host.__weblabChunkRecoveryDisabled || host.__weblabInitialChunkRecovery) return;
    let armed = true;
    const interactionEvents = ['pointerdown', 'keydown', 'input', 'change'];
    const isChunkUrl = (value: string) => {
        try {
            const url = new URL(value, host.location.href);
            return url.origin === host.location.origin &&
                /^\/_next\/static\/(?:chunks|[A-Za-z0-9_-]+)\/.+\.(?:js|css)$/.test(url.pathname);
        } catch { return false; }
    };
    const isChunkMessage = (value: unknown) => {
        const message = typeof value === 'string' ? value : value && typeof value === 'object' && 'message' in value
            ? String(value.message) : '';
        if (!/(Loading( CSS)? chunk [\w-]+ failed)|(Failed to load chunk)|(error loading dynamically imported module)|(Importing a module script failed)/i.test(message)) return false;
        // Capture complete absolute/protocol-relative URLs, so a foreign URL
        // cannot be mistaken for its embedded /_next/static/ path.
        return (message.match(/(?:(?:https?:)?\/\/|\/_next\/static\/)[^\s"'<>]+/g) ?? []).some(isChunkUrl);
    };
    const disarm = () => {
        armed = false;
        host.__weblabChunkRecoveryDisabled = true;
        host.removeEventListener('error', onError, true);
        host.removeEventListener('unhandledrejection', onRejection);
        for (const name of interactionEvents) host.removeEventListener(name, disarm, true);
    };
    const reload = () => {
        if (!armed || host.__weblabChunkRecoveryDisabled) return;
        try {
            const raw = host.sessionStorage.getItem('weblab:chunk-reload-at');
            const last = raw === null ? 0 : Number(raw);
            if (!Number.isFinite(last) || Date.now() - last < 10_000) return;
            host.sessionStorage.setItem('weblab:chunk-reload-at', String(Date.now()));
        } catch { return; }
        disarm();
        host.location.reload();
    };
    const onError = (event: ErrorEvent) => {
        const target = event.target;
        const chunkResource = target instanceof HTMLScriptElement && isChunkUrl(target.src)
            || target instanceof HTMLLinkElement && target.rel === 'stylesheet' && isChunkUrl(target.href);
        if (chunkResource || isChunkMessage(event.error) || isChunkMessage(event.message)) reload();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
        if (isChunkMessage(event.reason)) reload();
    };
    host.__weblabInitialChunkRecovery = { disarm };
    host.addEventListener('error', onError, true);
    host.addEventListener('unhandledrejection', onRejection);
    for (const name of interactionEvents) host.addEventListener(name, disarm, true);
}

// Use a raw inline <script> at the start of <head>, not Next's script queue.
// No user data or external runtime is interpolated into this source.
export const INITIAL_CHUNK_RECOVERY_SCRIPT = `(${installInitialChunkRecovery.toString()})();`;

export function disarmInitialChunkRecovery(): void {
    const host = window as ChunkRecoveryWindow;
    host.__weblabChunkRecoveryDisabled = true;
    host.__weblabInitialChunkRecovery?.disarm();
}
