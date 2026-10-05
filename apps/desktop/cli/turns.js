/**
 * Tracks running CLI chat turns: at most one per working folder (two agents
 * editing the same private copy at once would trample each other), plus a
 * way to wait for every turn to wind down on app quit.
 */

const BUSY_MESSAGE = 'Another chat is already working in this folder. Wait for it to finish or stop it first.';

function createTurnRegistry() {
    const byStream = new Map(); // streamId → { cwd, abort, done }
    const byFolder = new Map(); // cwd → streamId

    return {
        /** Reserve `cwd` for `streamId`. Returns null on success, or an error message. */
        acquire(streamId, cwd) {
            if (byStream.has(streamId)) return 'duplicate_stream';
            if (byFolder.has(cwd)) return BUSY_MESSAGE;
            const abort = new AbortController();
            let resolveDone;
            const done = new Promise((resolve) => { resolveDone = resolve; });
            byStream.set(streamId, { cwd, abort, done, resolveDone, quarantined: false });
            byFolder.set(cwd, streamId);
            return null;
        },
        signal(streamId) {
            return byStream.get(streamId)?.abort.signal ?? null;
        },
        abort(streamId) {
            byStream.get(streamId)?.abort.abort();
        },
        quarantine(streamId) {
            const entry = byStream.get(streamId);
            if (entry) entry.quarantined = true;
        },
        release(streamId) {
            const entry = byStream.get(streamId);
            if (!entry || entry.quarantined) return;
            byStream.delete(streamId);
            if (byFolder.get(entry.cwd) === streamId) byFolder.delete(entry.cwd);
            entry.resolveDone();
        },
        isBusy(cwd) {
            return byFolder.has(cwd);
        },
        get size() {
            return byStream.size;
        },
        /** Abort everything and wait (bounded) for turns to finish their cleanup. */
        async abortAll(timeoutMs = 5000) {
            const pending = [...byStream.values()];
            for (const entry of pending) entry.abort.abort();
            if (pending.length === 0) return;
            let timer;
            try {
                await Promise.race([
                    Promise.all(pending.map((entry) => entry.done)),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('CLI cleanup is still pending.')), timeoutMs);
                    }),
                ]);
            } finally { clearTimeout(timer); }
        },
    };
}

module.exports = { createTurnRegistry, BUSY_MESSAGE };
