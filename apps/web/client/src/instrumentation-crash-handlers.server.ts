let crashHandlersRegistered = false;

/**
 * Surface silent crashes in Railway logs.
 *
 * Kept in a Node-only module so the Edge runtime never statically analyzes
 * `process.on` calls from instrumentation.ts.
 */
export function registerProcessCrashHandlers() {
    if (crashHandlersRegistered) return;

    crashHandlersRegistered = true;

    process.on('unhandledRejection', (reason, promise) => {
        console.error(
            '[fatal] unhandledRejection - letting Node exit so Railway restarts the container',
            { reason, promise },
        );
        process.exit(1);
    });

    process.on('uncaughtException', (error, origin) => {
        console.error(
            '[fatal] uncaughtException - letting Node exit so Railway restarts the container',
            { error, origin },
        );
        process.exit(1);
    });

    process.on('SIGTERM', () => {
        console.warn(
            '[shutdown] received SIGTERM - Railway is restarting or replacing this replica',
        );
    });
}
