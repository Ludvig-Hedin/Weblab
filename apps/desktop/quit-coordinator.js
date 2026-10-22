/**
 * Close real windows before stopping their native services. BrowserWindow.close
 * honors beforeunload; only `closed` proves that the window accepted closing.
 * A later popup can refuse after an earlier window has already closed.
 */
function createQuitCoordinator({
    app, getWindows, getMainWindow, disposeCli, disposeLocal, showCleanupError,
    showCloseCancelled = () => {},
    quitOnWindowAllClosed = false, closeTimeoutMs = 30000,
    setTimer = setTimeout, clearTimer = clearTimeout,
}) {
    let state = 'idle';
    let active = null;
    let attempt = null;
    let cliDisposed = false;
    let localDisposed = false;
    let cleanupFault = null;

    const liveWindows = () => getWindows().filter((window) => !window.isDestroyed());
    const cancel = (reason, current = attempt) => {
        if (state !== 'closing' || !attempt || current !== attempt) return;
        attempt.cancelled = reason;
        attempt.cancelClose?.();
    };

    function closeWindow(window, current) {
        if (window.isDestroyed()) return Promise.resolve(true);
        current.window = window;
        return new Promise((resolve) => {
            const contents = window.webContents;
            let closeEvent;
            let settled = false;
            let timer;
            const finish = (accepted) => {
                if (settled) return;
                settled = true;
                clearTimer(timer);
                window.removeListener('closed', onClosed);
                window.removeListener('close', onClose);
                contents.removeListener('will-prevent-unload', onRefused);
                current.cancelClose = null;
                resolve(accepted);
            };
            const onClosed = () => finish(!current.cancelled && !closeEvent?.defaultPrevented);
            const onRefused = () => {
                // preventDefault here would OVERRIDE the renderer's veto.
                if (!settled) cancel('beforeunload', current);
            };
            const onClose = (event) => {
                closeEvent = event;
                // Other close listeners may prevent default after ours runs.
                queueMicrotask(() => {
                    if (!settled && event.defaultPrevented) cancel('close-prevented', current);
                });
            };
            current.cancelClose = () => finish(false);
            window.on('closed', onClosed);
            window.on('close', onClose);
            contents.on('will-prevent-unload', onRefused);
            timer = setTimer(() => {
                if (!settled) cancel('close-timeout', current);
            }, closeTimeoutMs);
            try {
                window.close();
                if (!settled && closeEvent?.defaultPrevented) cancel('close-prevented', current);
            } catch {
                if (!settled) cancel('close-error', current);
            }
        });
    }

    async function run(current, retryCleanup) {
        if (!retryCleanup) {
            const windows = liveWindows();
            const main = getMainWindow();
            if (windows.includes(main)) {
                windows.splice(windows.indexOf(main), 1);
                windows.unshift(main);
            }
            for (const window of windows) {
                if (current.cancelled || !await closeWindow(window, current)) {
                    state = 'idle';
                    return { status: 'cancelled', reason: current.cancelled };
                }
            }
            // A window created between the last closed event and this continuation
            // cancels the attempt, even when it was absent from the snapshot.
            if (current.cancelled || liveWindows().length) {
                state = 'idle';
                return { status: 'cancelled', reason: current.cancelled ?? 'live-windows' };
            }
        }

        state = 'cleaning';
        cleanupFault = null;
        try {
            if (liveWindows().length) throw new Error('A window is still open.');
            if (!cliDisposed) {
                await disposeCli();
                cliDisposed = true;
            }
            if (cleanupFault || liveWindows().length) throw cleanupFault ?? new Error('A window reopened during cleanup.');
            if (!localDisposed) {
                await disposeLocal();
                localDisposed = true;
            }
            if (cleanupFault || liveWindows().length) throw cleanupFault ?? new Error('A window reopened during cleanup.');
            state = 'quit-ready';
            app.quit();
            return { status: 'quit' };
        } catch (error) {
            // Disposal may already be irreversible. Never reopen an editor on
            // stopped services, or claim that its processes have been restored.
            state = 'cleanup-failed';
            showCleanupError(error);
            return { status: 'cleanup-failed' };
        }
    }

    function requestQuit() {
        if (active) return active;
        if (state === 'quit-ready' || state === 'quit-issued') return Promise.resolve({ status: 'quit' });
        const retryCleanup = state === 'cleanup-failed';
        const current = { cancelled: null, cancelClose: null, window: null };
        attempt = current;
        if (!retryCleanup) state = 'closing';
        // Install the active promise before close() can synchronously emit
        // window-all-closed or another Quit request.
        const clearCurrent = () => {
            if (attempt === current) {
                active = null;
                attempt = null;
            }
        };
        active = Promise.resolve().then(() => run(current, retryCleanup)).then((result) => {
            // Release the completed attempt before showing native UI. A Quit
            // triggered inside that UI must start a new attempt, not join this
            // cancelled promise or be cleared by its finalizer afterwards.
            clearCurrent();
            if (result.status === 'cancelled') {
                try { showCloseCancelled(result.reason, current.window); }
                catch { /* Notification failure must not trap Quit or stop services. */ }
            }
            return result;
        }, (error) => {
            clearCurrent();
            throw error;
        });
        return active;
    }

    app.on('before-quit', (event) => {
        if (state === 'quit-ready') {
            state = 'quit-issued';
            return;
        }
        event.preventDefault();
        void requestQuit();
    });
    app.on('window-all-closed', () => {
        if (active || quitOnWindowAllClosed) void requestQuit();
    });
    app.on('browser-window-created', () => {
        if (state === 'closing') cancel('new-window');
        else if (state === 'cleaning') cleanupFault = new Error('A window reopened during cleanup.');
    });

    return {
        requestQuit,
        get state() { return state; },
        get blocksWindows() { return state !== 'idle'; },
    };
}

module.exports = { createQuitCoordinator };
